import { once } from 'node:events';
import { createServer, request as httpRequest, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { inspect } from 'node:util';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';

interface ReceivedRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: string;
}

const WALLET = `0x${'ab12'.repeat(10)}`;
const FINGERPRINT = 'a1b2'.repeat(16);
const NONCE = '8f2c'.repeat(16);
const SIGNATURE = `0x${'cd'.repeat(65)}`;
const OTP_CHALLENGE_ID = '3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// A stand-in orchestrator that records every request the gateway forwards.
const receivedRequests: ReceivedRequest[] = [];
let orchestrator: Server;
let orchestratorUrl: string;

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function createGateway(tokenBucket = { capacity: 100, refillIntervalMs: 3000 }) {
  return createApp({ orchestratorUrl, tokenBucket });
}

function expectErrorBody(response: request.Response, status: number, code: string): void {
  expect(response.status).toBe(status);
  expect(response.body).toEqual({
    error: {
      code,
      message: expect.any(String),
      request_id: response.headers['x-request-id'],
    },
  });
}

beforeAll(async () => {
  orchestrator = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      receivedRequests.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ handled_by: 'orchestrator' }));
    });
  });
  orchestratorUrl = await listen(orchestrator);
});

afterAll(async () => {
  await close(orchestrator);
});

beforeEach(() => {
  receivedRequests.length = 0;
});

describe('gateway basics', () => {
  it('answers the health check with a request id', async () => {
    const response = await request(createGateway()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
  });

  it('sets security headers and hides the Express signature', async () => {
    const response = await request(createGateway()).get('/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('returns the error envelope for unknown non-API paths', async () => {
    const response = await request(createGateway()).get('/not-a-route');

    expectErrorBody(response, 404, 'NOT_FOUND');
    expect(receivedRequests).toHaveLength(0);
  });
});

describe('proxying to the orchestrator', () => {
  it('forwards a valid login request with its full path and body', async () => {
    const body = { wallet_address: WALLET, device_fingerprint: FINGERPRINT };

    const response = await request(createGateway()).post('/api/auth/login').send(body);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ handled_by: 'orchestrator' });
    expect(receivedRequests).toHaveLength(1);
    expect(receivedRequests[0].method).toBe('POST');
    expect(receivedRequests[0].url).toBe('/api/auth/login');
    expect(JSON.parse(receivedRequests[0].body)).toEqual(body);
  });

  it('removes unexpected fields before forwarding', async () => {
    await request(createGateway())
      .post('/api/auth/login')
      .send({ wallet_address: WALLET, device_fingerprint: FINGERPRINT, is_admin: true });

    expect(JSON.parse(receivedRequests[0].body)).toEqual({
      wallet_address: WALLET,
      device_fingerprint: FINGERPRINT,
    });
  });

  it('sends its own request id to the orchestrator and ignores one supplied by the client', async () => {
    const response = await request(createGateway())
      .post('/api/auth/nonce')
      .set('X-Request-Id', 'client-chosen-id')
      .send({ wallet_address: WALLET });

    const requestId = response.headers['x-request-id'];
    expect(requestId).toMatch(UUID_PATTERN);
    expect(receivedRequests[0].headers['x-request-id']).toBe(requestId);
  });

  it('replaces a client-supplied X-Forwarded-For with the real client address', async () => {
    await request(createGateway())
      .post('/api/auth/nonce')
      .set('X-Forwarded-For', '198.51.100.7')
      .send({ wallet_address: WALLET });

    expect(receivedRequests[0].headers['x-forwarded-for']).toMatch(/127\.0\.0\.1$/);
  });

  // The orchestrator accepts the internal token as a service credential, so a
  // client must never be able to smuggle one through the gateway.
  it('drops a client-supplied X-Internal-Token', async () => {
    await request(createGateway())
      .post('/api/auth/nonce')
      .set('X-Internal-Token', 'stolen-or-guessed')
      .send({ wallet_address: WALLET });

    expect(receivedRequests[0].headers['x-internal-token']).toBeUndefined();
  });

  it('forwards a JSON body that the client sent in chunks', async () => {
    const gateway = createGateway().listen(0, '127.0.0.1');
    await once(gateway, 'listening');
    const body = JSON.stringify({ wallet_address: WALLET, device_fingerprint: FINGERPRINT });

    const status = await new Promise<number>((resolve, reject) => {
      const clientRequest = httpRequest(
        {
          host: '127.0.0.1',
          port: (gateway.address() as AddressInfo).port,
          path: '/api/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' },
        },
        (response) => {
          response.resume();
          response.on('end', () => resolve(response.statusCode ?? 0));
        },
      );
      clientRequest.on('error', reject);
      clientRequest.write(body.slice(0, 20));
      clientRequest.end(body.slice(20));
    });
    await close(gateway);

    expect(status).toBe(200);
    expect(JSON.parse(receivedRequests[0].body)).toEqual(JSON.parse(body));
  });

  it('passes routes without a body schema through untouched', async () => {
    const gateway = createGateway();

    await request(gateway).post('/api/auth/logout').set('Authorization', 'Bearer abc');
    await request(gateway).post('/api/admin/pause');
    await request(gateway).get('/api/admin/attempts/top?n=10');

    expect(receivedRequests.map((received) => received.url)).toEqual([
      '/api/auth/logout',
      '/api/admin/pause',
      '/api/admin/attempts/top?n=10',
    ]);
    expect(receivedRequests[0].headers.authorization).toBe('Bearer abc');
  });

  it('returns 503 with the error envelope when the orchestrator is unreachable', async () => {
    const stoppedServer = createServer();
    const stoppedUrl = await listen(stoppedServer);
    await close(stoppedServer);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const gateway = createApp({
      orchestratorUrl: stoppedUrl,
      tokenBucket: { capacity: 100, refillIntervalMs: 3000 },
    });
    const response = await request(gateway)
      .post('/api/auth/login')
      .send({ wallet_address: WALLET, device_fingerprint: FINGERPRINT });

    expectErrorBody(response, 503, 'SERVICE_UNAVAILABLE');
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});

describe('request validation', () => {
  it.each([
    ['/api/auth/register', { wallet_address: WALLET }],
    ['/api/auth/register', { wallet_address: WALLET, display_name: 'Asha R', phone_number: '+919876543210' }],
    ['/api/auth/nonce', { wallet_address: WALLET }],
    ['/api/auth/login', { wallet_address: WALLET, device_fingerprint: FINGERPRINT }],
    ['/api/auth/verify', { wallet_address: WALLET, nonce: NONCE, signature: SIGNATURE }],
    ['/api/auth/otp/verify', { otp_challenge_id: OTP_CHALLENGE_ID, code: '123456' }],
  ])('accepts a valid body for %s', async (path, body) => {
    const response = await request(createGateway()).post(path).send(body);

    expect(response.status).toBe(200);
    expect(receivedRequests).toHaveLength(1);
  });

  it.each([
    ['/api/auth/register', {}],
    ['/api/auth/register', { wallet_address: '0x1234' }],
    ['/api/auth/register', { wallet_address: WALLET, phone_number: '98765' }],
    ['/api/auth/register', { wallet_address: WALLET, display_name: '   ' }],
    ['/api/auth/nonce', { wallet_address: 12345 }],
    ['/api/auth/login', { wallet_address: WALLET }],
    ['/api/auth/login', { wallet_address: WALLET, device_fingerprint: 'short' }],
    ['/api/auth/login', [WALLET, FINGERPRINT]],
    ['/api/auth/verify', { wallet_address: WALLET, nonce: NONCE }],
    ['/api/auth/verify', { wallet_address: WALLET, nonce: NONCE, signature: '0x1234' }],
    ['/api/auth/otp/verify', { otp_challenge_id: 'not-a-uuid', code: '123456' }],
    ['/api/auth/otp/verify', { otp_challenge_id: OTP_CHALLENGE_ID, code: '12345' }],
    ['/api/auth/otp/verify', { otp_challenge_id: OTP_CHALLENGE_ID, code: 123456 }],
  ])('rejects an invalid body for %s: %j', async (path, body) => {
    const response = await request(createGateway()).post(path).send(body);

    expectErrorBody(response, 400, 'INVALID_REQUEST');
    expect(receivedRequests).toHaveLength(0);
  });

  it('does not write the raw request body to the logs when JSON is malformed', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request(createGateway())
      .post('/api/auth/otp/verify')
      .set('Content-Type', 'application/json')
      .send(`{"otp_challenge_id": "${OTP_CHALLENGE_ID}", "code": "482913",}`);

    const logged = consoleError.mock.calls
      .flat()
      .map((value) => (typeof value === 'string' ? value : inspect(value)))
      .join('\n');
    consoleError.mockRestore();

    expectErrorBody(response, 400, 'INVALID_REQUEST');
    expect(logged).not.toContain('482913');
  });

  it('rejects malformed JSON', async () => {
    const response = await request(createGateway())
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"wallet_address": ');

    expectErrorBody(response, 400, 'INVALID_REQUEST');
    expect(receivedRequests).toHaveLength(0);
  });

  it('rejects a body that is not JSON', async () => {
    const response = await request(createGateway())
      .post('/api/auth/login')
      .set('Content-Type', 'text/plain')
      .send(`wallet_address=${WALLET}`);

    expectErrorBody(response, 400, 'INVALID_REQUEST');
    expect(receivedRequests).toHaveLength(0);
  });

  it('rejects an oversized body', async () => {
    const response = await request(createGateway())
      .post('/api/auth/login')
      .send({ wallet_address: WALLET, device_fingerprint: FINGERPRINT, padding: 'x'.repeat(20_000) });

    expectErrorBody(response, 400, 'INVALID_REQUEST');
    expect(receivedRequests).toHaveLength(0);
  });

  it('validates path variants that Express treats as the same route', async () => {
    const gateway = createGateway();

    for (const path of ['/api/auth/LOGIN', '/api/auth/login/', '/API/AUTH/Login']) {
      const response = await request(gateway).post(path).send({ wallet_address: WALLET });
      expectErrorBody(response, 400, 'INVALID_REQUEST');
    }
    expect(receivedRequests).toHaveLength(0);
  });
});

describe('rate limiting', () => {
  it('rejects excess auth requests with the error envelope', async () => {
    const gateway = createGateway({ capacity: 2, refillIntervalMs: 60_000 });
    const body = { wallet_address: WALLET };

    await request(gateway).post('/api/auth/nonce').send(body);
    await request(gateway).post('/api/auth/nonce').send(body);
    const response = await request(gateway).post('/api/auth/nonce').send(body);

    expectErrorBody(response, 429, 'RATE_LIMITED');
    expect(receivedRequests).toHaveLength(2);
  });

  it('runs before validation, so invalid requests also use up tokens', async () => {
    const gateway = createGateway({ capacity: 2, refillIntervalMs: 60_000 });

    expect((await request(gateway).post('/api/auth/login').send({})).status).toBe(400);
    expect((await request(gateway).post('/api/auth/login').send({})).status).toBe(400);
    const response = await request(gateway)
      .post('/api/auth/login')
      .send({ wallet_address: WALLET, device_fingerprint: FINGERPRINT });

    expectErrorBody(response, 429, 'RATE_LIMITED');
    expect(receivedRequests).toHaveLength(0);
  });

  it('is not bypassed by a spoofed X-Forwarded-For header', async () => {
    const gateway = createGateway({ capacity: 1, refillIntervalMs: 60_000 });
    const body = { wallet_address: WALLET };

    await request(gateway).post('/api/auth/nonce').set('X-Forwarded-For', '198.51.100.1').send(body);
    const response = await request(gateway)
      .post('/api/auth/nonce')
      .set('X-Forwarded-For', '198.51.100.2')
      .send(body);

    expectErrorBody(response, 429, 'RATE_LIMITED');
  });

  it('applies only to /api/auth routes', async () => {
    const gateway = createGateway({ capacity: 1, refillIntervalMs: 60_000 });

    for (let i = 0; i < 3; i++) {
      expect((await request(gateway).get('/api/admin/attempts/top')).status).toBe(200);
      expect((await request(gateway).get('/health')).status).toBe(200);
    }
  });
});
