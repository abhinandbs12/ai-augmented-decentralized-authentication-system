import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createRiskEngineClient } from '../src/core/riskEngineClient';

type Handler = (req: IncomingMessage, body: string, res: ServerResponse) => void;

const LOGIN_CONTEXT = {
  walletAddress: '0xab12ab12ab12ab12ab12ab12ab12ab12ab12ab12',
  ipAddress: '203.0.113.9',
  deviceFingerprint: 'a1b2'.repeat(16),
  timestamp: new Date('2026-09-08T10:22:31.000Z'),
};

let server: Server | undefined;

// Starts a stand-in risk engine and returns its base URL.
function startRiskEngine(handler: Handler): Promise<string> {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => handler(req, body, res));
  });

  return new Promise((resolve) => {
    server!.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${(server!.address() as AddressInfo).port}`);
    });
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server!.close(resolve));
    server = undefined;
  }
});

describe('createRiskEngineClient', () => {
  it('sends the login context in the risk engine request format', async () => {
    let receivedPath = '';
    let receivedContentType = '';
    let receivedBody: unknown;
    const baseUrl = await startRiskEngine((req, body, res) => {
      receivedPath = `${req.method} ${req.url}`;
      receivedContentType = req.headers['content-type'] ?? '';
      receivedBody = JSON.parse(body);
      sendJson(res, 200, { trust_score: 96, reasons: [] });
    });

    await createRiskEngineClient(baseUrl).score(LOGIN_CONTEXT);

    expect(receivedPath).toBe('POST /score');
    expect(receivedContentType).toBe('application/json');
    expect(receivedBody).toEqual({
      wallet: LOGIN_CONTEXT.walletAddress,
      ip_address: LOGIN_CONTEXT.ipAddress,
      device_fingerprint: LOGIN_CONTEXT.deviceFingerprint,
      timestamp: '2026-09-08T10:22:31.000Z',
    });
  });

  it('returns the trust score and reasons', async () => {
    const baseUrl = await startRiskEngine((_req, _body, res) => {
      sendJson(res, 200, { trust_score: 70, reasons: ['unrecognized_device'] });
    });

    const result = await createRiskEngineClient(baseUrl).score(LOGIN_CONTEXT);

    expect(result).toEqual({ trustScore: 70, reasons: ['unrecognized_device'] });
  });

  it('accepts a base URL with a trailing slash', async () => {
    let receivedUrl = '';
    const baseUrl = await startRiskEngine((req, _body, res) => {
      receivedUrl = req.url ?? '';
      sendJson(res, 200, { trust_score: 100, reasons: [] });
    });

    await createRiskEngineClient(`${baseUrl}/`).score(LOGIN_CONTEXT);

    expect(receivedUrl).toBe('/score');
  });

  it('throws when the risk engine returns an error status', async () => {
    const baseUrl = await startRiskEngine((_req, _body, res) => {
      sendJson(res, 503, { detail: 'Risk engine not initialized' });
    });

    await expect(createRiskEngineClient(baseUrl).score(LOGIN_CONTEXT)).rejects.toThrow('HTTP 503');
  });

  it.each([
    [{ trust_score: 101, reasons: [] }],
    [{ trust_score: -1, reasons: [] }],
    [{ trust_score: 70.5, reasons: [] }],
    [{ trust_score: '70', reasons: [] }],
    [{ trust_score: 70 }],
    [{ trust_score: 70, reasons: [42] }],
    [null],
  ])('throws on a malformed response: %j', async (responseBody) => {
    const baseUrl = await startRiskEngine((_req, _body, res) => {
      sendJson(res, 200, responseBody);
    });

    await expect(createRiskEngineClient(baseUrl).score(LOGIN_CONTEXT)).rejects.toThrow(/invalid/);
  });

  it('throws when the response is not JSON', async () => {
    const baseUrl = await startRiskEngine((_req, _body, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('not json');
    });

    await expect(createRiskEngineClient(baseUrl).score(LOGIN_CONTEXT)).rejects.toThrow();
  });

  it('gives up after 800 ms when the risk engine is slow', async () => {
    const baseUrl = await startRiskEngine((_req, _body, res) => {
      setTimeout(() => sendJson(res, 200, { trust_score: 100, reasons: [] }), 3000);
    });

    const startedAt = Date.now();
    await expect(createRiskEngineClient(baseUrl).score(LOGIN_CONTEXT)).rejects.toThrow();
    const elapsedMs = Date.now() - startedAt;

    expect(elapsedMs).toBeGreaterThanOrEqual(700);
    expect(elapsedMs).toBeLessThan(2000);
  });

  it('throws when the risk engine cannot be reached', async () => {
    const baseUrl = await startRiskEngine(() => {});
    server!.close();
    server = undefined;

    await expect(createRiskEngineClient(baseUrl).score(LOGIN_CONTEXT)).rejects.toThrow();
  });
});
