import { randomUUID } from 'node:crypto';
import type { Db } from 'mongodb';
import type { Pool } from 'pg';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type AppDependencies } from '../src/app';
import type { MerkleBatcher } from '../src/audit/batcher';
import type { AuditEvent } from '../src/audit/merkleTree';
import { ChainError, type AuthRegistryClient } from '../src/chain/authRegistryClient';
import type { EventReporter, LoginEventReport } from '../src/core/eventReporter';
import type { CachedSession } from '../src/core/loginStateMachine';
import { createCircuitBreaker } from '../src/core/circuitBreaker';
import { NonceService } from '../src/core/nonces';
import type { RiskEngine } from '../src/core/riskEngineClient';
import { SessionStore } from '../src/core/sessions';
import { LRUCache } from '../src/ds/lruCache';
import { OtpService, type OtpSender } from '../src/otp/otpService';

// ---- In-memory stand-ins for the four tables the routes touch -------------
const tables = vi.hoisted(() => ({
  users: new Map<string, { id: string; walletAddress: string; displayName: string | null; email: string | null }>(),
  nonces: new Map<string, { id: string; wallet: string; value: string; context: Record<string, unknown>; used: boolean; expired: boolean }>(),
  sessions: new Map<string, { walletAddress: string; userId: string; expiresAt: Date; revoked: boolean }>(),
  otp: new Map<string, { id: string; walletAddress: string; codeHash: string; trustScore: number; deviceFingerprint: string; factors: string[]; attempts: number; verified: boolean; expired: boolean; sentAt: Date; sendCount: number }>(),
}));

vi.mock('../src/db/users', () => ({
  insertUser: async (_pool: Pool, user: { walletAddress: string; displayName?: string; email: string }) => {
    const walletAddress = user.walletAddress.toLowerCase();
    if (tables.users.has(walletAddress)) {
      return null;
    }
    const record = {
      id: randomUUID(),
      walletAddress,
      displayName: user.displayName ?? null,
      email: user.email,
    };
    tables.users.set(walletAddress, record);
    return record;
  },
  findUserByWallet: async (_pool: Pool, walletAddress: string) =>
    tables.users.get(walletAddress.toLowerCase()) ?? null,
  markLoggedIn: async () => undefined,
}));

vi.mock('../src/db/nonces', () => ({
  insertNonce: async (
    _pool: Pool,
    {
      id: requestedId,
      walletAddress,
      value,
      expiresAt: _expiresAt,
      ...context
    }: { id?: string; walletAddress: string; value: string; expiresAt: Date },
  ) => {
    const id = requestedId ?? randomUUID();
    tables.nonces.set(`${walletAddress.toLowerCase()}:${value}`, {
      id,
      wallet: walletAddress.toLowerCase(),
      value,
      context,
      used: false,
      expired: false,
    });
    return id;
  },
  consumeNonce: async (_pool: Pool, walletAddress: string, value: string) => {
    const stored = tables.nonces.get(`${walletAddress.toLowerCase()}:${value}`);
    if (!stored) {
      return { status: 'unknown' };
    }
    if (stored.used) {
      return { status: 'used' };
    }
    if (stored.expired) {
      return { status: 'expired' };
    }
    stored.used = true;
    return { status: 'consumed', nonceId: stored.id, ...stored.context };
  },
}));

vi.mock('../src/db/sessions', () => ({
  insertSession: async (
    _pool: Pool,
    session: { userId: string; tokenHash: string; expiresAt: Date },
  ) => {
    const user = [...tables.users.values()].find((candidate) => candidate.id === session.userId);
    tables.sessions.set(session.tokenHash, {
      walletAddress: user?.walletAddress ?? '',
      userId: session.userId,
      expiresAt: session.expiresAt,
      revoked: false,
    });
  },
  findActiveSession: async (_pool: Pool, tokenHash: string) => {
    const stored = tables.sessions.get(tokenHash);
    if (!stored || stored.revoked || stored.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return { walletAddress: stored.walletAddress, userId: stored.userId, expiresAt: stored.expiresAt };
  },
  revokeSession: async (_pool: Pool, tokenHash: string) => {
    const stored = tables.sessions.get(tokenHash);
    if (!stored || stored.revoked) {
      return false;
    }
    stored.revoked = true;
    return true;
  },
  revokeSessionsExcept: async (_pool: Pool, walletAddresses: string[]) => {
    const ending = [...tables.sessions.values()].filter(
      (stored) => !stored.revoked && !walletAddresses.includes(stored.walletAddress),
    );
    for (const stored of ending) {
      stored.revoked = true;
    }
    return ending.length;
  },
}));

vi.mock('../src/db/otpChallenges', () => ({
  insertOtpChallenge: async (
    _pool: Pool,
    challenge: { walletAddress: string; codeHash: string; trustScore: number; deviceFingerprint: string; factors: string[] },
  ) => {
    const id = randomUUID();
    tables.otp.set(id, {
      id,
      walletAddress: challenge.walletAddress.toLowerCase(),
      codeHash: challenge.codeHash,
      trustScore: challenge.trustScore,
      deviceFingerprint: challenge.deviceFingerprint,
      factors: challenge.factors,
      attempts: 0,
      verified: false,
      expired: false,
      sentAt: new Date(),
      sendCount: 1,
    });
    return id;
  },
  findOtpChallenge: async (_pool: Pool, id: string) => tables.otp.get(id) ?? null,
  replaceOtpCode: async (_pool: Pool, id: string, replacement: { codeHash: string; sendCount: number }) => {
    const challenge = tables.otp.get(id);
    if (!challenge || challenge.verified || challenge.sendCount !== replacement.sendCount) {
      return false;
    }
    Object.assign(challenge, {
      codeHash: replacement.codeHash,
      expired: false,
      sentAt: new Date(),
      sendCount: challenge.sendCount + 1,
    });
    return true;
  },
  countFailedAttempt: async (_pool: Pool, id: string) => {
    const challenge = tables.otp.get(id);
    if (!challenge) {
      return 0;
    }
    challenge.attempts += 1;
    return challenge.attempts;
  },
  markOtpVerified: async (_pool: Pool, id: string) => {
    const challenge = tables.otp.get(id);
    if (!challenge || challenge.verified) {
      return false;
    }
    challenge.verified = true;
    return true;
  },
  deleteOtpChallenge: async (_pool: Pool, id: string) => void tables.otp.delete(id),
}));

vi.mock('../src/db/auditBatches', () => ({
  findLeafByEventId: async (_pool: Pool, eventId: string) =>
    eventId === ANCHORED_EVENT_ID
      ? { batchId: 0, leafIndex: 0, eventId, leafHash: '0x' + '11'.repeat(32) }
      : null,
  findBatchLeaves: async () => ['0x' + '11'.repeat(32), '0x' + '22'.repeat(32)],
  findBatch: async (_pool: Pool, batchId: number) =>
    batchId === 0 ? { batchId: 0, merkleRoot: '0x' + '33'.repeat(32), txHash: '0xtx', eventCount: 2 } : null,
  insertBatch: async () => 0,
}));

const ANCHORED_EVENT_ID = 'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa';
const WALLET = '0xab12ab12ab12ab12ab12ab12ab12ab12ab12ab12';
const ADMIN_WALLET = '0xad00ad00ad00ad00ad00ad00ad00ad00ad00ad00';
const DEVICE = 'a3f1'.repeat(16);
const SIGNATURE = `0x${'cd'.repeat(65)}`;
const INTERNAL_TOKEN = 'internal-token-for-tests';
const EMAIL = 'asha@example.com';

interface TestContext {
  app: ReturnType<typeof createApp>;
  system: string[];
  chain: AuthRegistryClient;
  reported: LoginEventReport[];
  anchored: AuditEvent[];
  sessions: SessionStore;
  emails: { to: string; code: string }[];
  setScore(trustScore: number, reasons?: string[]): void;
  failScoring(): void;
  failEmail(): void;
}

function fakeCollection(documents: Record<string, unknown>[]) {
  return {
    find: () => ({
      sort: () => ({
        limit: () => ({ toArray: async () => documents }),
      }),
    }),
    findOne: async (query: Record<string, unknown>) =>
      documents.find((document) => Object.entries(query).every(([key, value]) => document[key] === value)) ?? null,
    updateOne: async (query: Record<string, unknown>) => ({
      matchedCount: documents.some((document) => document.event_id === query.event_id) ? 1 : 0,
    }),
  };
}

function createTestApp(): TestContext {
  const pool = {} as Pool;
  const sessionCache = new LRUCache<string, CachedSession>(10);
  const sessions = new SessionStore(pool, sessionCache, 30 * 60_000);

  let score: { trustScore: number; reasons: string[] } | null = { trustScore: 96, reasons: [] };
  const riskEngine: RiskEngine = {
    score: async () => {
      if (score === null) {
        throw new Error('risk engine unreachable');
      }
      return score;
    },
  };

  const chain: AuthRegistryClient = {
    registerUser: vi.fn(async () => ({ txHash: '0xregister' })),
    isRegistered: vi.fn(async () => true),
    verifySignature: vi.fn(async () => ({ txHash: '0xverify' })),
    submitMerkleRoot: vi.fn(async () => ({ txHash: '0xanchor', batchId: 0 })),
    getMerkleRoot: vi.fn(async () => '0x' + '33'.repeat(32)),
    pauseAuth: vi.fn(async () => ({ txHash: '0xpause' })),
    resumeAuth: vi.fn(async () => ({ txHash: '0xresume' })),
    isPaused: vi.fn(async () => false),
  };

  const reported: LoginEventReport[] = [];
  const events: EventReporter = { report: async (event) => void reported.push(event) };

  const anchored: AuditEvent[] = [];
  const batcher: MerkleBatcher = {
    enqueue: (event) => void anchored.push(event),
    flush: async () => undefined,
    stop: () => undefined,
    pending: () => anchored.length,
  };

  const loginEvents = [
    { event_id: ANCHORED_EVENT_ID, wallet_address: WALLET, ip_address: '203.0.113.9', device_fingerprint: DEVICE, trust_score: 96, decision: 'allow', verified: true, timestamp: new Date('2026-09-20T10:00:00Z') },
  ];
  const authDb = {
    collection: (name: string) => (name === 'login_events' ? fakeCollection(loginEvents) : fakeCollection([])),
  } as unknown as Db;

  // Stands in for the mail server: the test reads the code the customer would.
  const emails: { to: string; code: string }[] = [];
  let emailWorks = true;
  const mailbox: OtpSender = {
    channel: 'email',
    send: async (to, code) => {
      if (!emailWorks) {
        throw new Error('connection refused');
      }
      emails.push({ to, code });
    },
  };

  const system: string[] = [];
  const breaker = createCircuitBreaker({
    threshold: 3,
    windowMs: 10_000,
    trip: async () => {
      await chain.pauseAuth();
    },
  });

  const dependencies: AppDependencies = {
    pool,
    authDb,
    sessions,
    sessionCache,
    nonces: new NonceService(pool, 5 * 60_000),
    otp: new OtpService(pool, { ttlMs: 5 * 60_000, maxAttempts: 3, resendCooldownMs: 30_000, maxSends: 3 }, mailbox),
    chain,
    riskEngine,
    events,
    batcher,
    realtime: { emitLoginEvent: () => undefined, emitSystem: (state) => void system.push(state), close: async () => undefined },
    breaker,
    adminWallets: [ADMIN_WALLET],
    internalApiToken: INTERNAL_TOKEN,
  };

  return {
    app: createApp(dependencies),
    system,
    chain,
    reported,
    anchored,
    sessions,
    emails,
    setScore: (trustScore, reasons = []) => {
      score = { trustScore, reasons };
    },
    failScoring: () => {
      score = null;
    },
    failEmail: () => {
      emailWorks = false;
    },
  };
}

async function registerWallet(context: TestContext, walletAddress = WALLET): Promise<void> {
  await request(context.app)
    .post('/api/auth/register')
    .send({ wallet_address: walletAddress, email: EMAIL });
}

async function loginAndVerify(context: TestContext, walletAddress = WALLET): Promise<string> {
  await registerWallet(context, walletAddress);
  const login = await request(context.app)
    .post('/api/auth/login')
    .send({ wallet_address: walletAddress, device_fingerprint: DEVICE });

  const verified = await request(context.app)
    .post('/api/auth/verify')
    .send({ wallet_address: walletAddress, nonce: login.body.nonce, signature: SIGNATURE });

  return verified.body.session_token;
}

describe('orchestrator app', () => {
  let context: TestContext;

  beforeEach(() => {
    tables.users.clear();
    tables.nonces.clear();
    tables.sessions.clear();
    tables.otp.clear();
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    context = createTestApp();
  });

  describe('health and plumbing', () => {
    it('answers the health check', async () => {
      const response = await request(context.app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok', service: 'orchestrator' });
    });

    it('puts a request id on every response and in every error body', async () => {
      const response = await request(context.app).get('/api/does-not-exist');

      expect(response.status).toBe(404);
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      expect(response.body.error).toMatchObject({ code: 'NOT_FOUND' });
      expect(response.body.error.request_id).toBe(response.headers['x-request-id']);
    });

    it('keeps the request id the gateway generated', async () => {
      const response = await request(context.app)
        .get('/api/does-not-exist')
        .set('X-Request-Id', 'from-the-gateway');

      expect(response.body.error.request_id).toBe('from-the-gateway');
    });

    it('answers a malformed body with the error envelope and never logs the body', async () => {
      const response = await request(context.app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"wallet_address": "0xab12', );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_REQUEST');
      const logged = vi.mocked(console.error).mock.calls.flat().join(' ');
      expect(logged).not.toContain('wallet_address');
    });
  });

  describe('POST /api/auth/register', () => {
    it('registers the customer wallet on-chain and creates the profile', async () => {
      const response = await request(context.app)
        .post('/api/auth/register')
        .send({ wallet_address: WALLET, display_name: 'Asha', email: ' Asha@Example.com ' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ wallet_address: WALLET.toLowerCase(), registered: true, tx_hash: '0xregister' });
      expect(context.chain.registerUser).toHaveBeenCalledWith(WALLET);
      expect(tables.users.get(WALLET.toLowerCase())?.email).toBe(EMAIL);
    });

    // The code of a step-up sign-in can only reach the customer by email.
    it('refuses a registration without a valid email address, before touching the chain', async () => {
      const missing = await request(context.app).post('/api/auth/register').send({ wallet_address: WALLET });
      const malformed = await request(context.app)
        .post('/api/auth/register')
        .send({ wallet_address: WALLET, email: 'not-an-address' });

      expect([missing.status, malformed.status]).toEqual([400, 400]);
      expect(context.chain.registerUser).not.toHaveBeenCalled();
    });

    it('rejects a second registration of the same wallet (FR-04)', async () => {
      await registerWallet(context);

      const response = await request(context.app)
        .post('/api/auth/register')
        .send({ wallet_address: WALLET, email: EMAIL });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('ALREADY_REGISTERED');
    });

    it('rejects a malformed wallet address', async () => {
      const response = await request(context.app)
        .post('/api/auth/register')
        .send({ wallet_address: '0x123', email: EMAIL });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_REQUEST');
    });

    it('reports an unreachable chain instead of creating a profile', async () => {
      vi.mocked(context.chain.registerUser).mockRejectedValueOnce(
        new ChainError('CHAIN_UNAVAILABLE', 'no rpc'),
      );

      const response = await request(context.app)
        .post('/api/auth/register')
        .send({ wallet_address: WALLET, email: EMAIL });

      expect(response.status).toBe(502);
      expect(response.body.error.code).toBe('CHAIN_UNAVAILABLE');
    });

    // A previous attempt that registered on-chain and then failed must not lock
    // the customer out for good.
    it('completes the profile when the wallet is already registered on-chain', async () => {
      vi.mocked(context.chain.registerUser).mockRejectedValueOnce(
        new ChainError('ALREADY_REGISTERED', 'AuthRegistry: already registered'),
      );

      const response = await request(context.app)
        .post('/api/auth/register')
        .send({ wallet_address: WALLET, email: EMAIL });

      expect(response.status).toBe(201);
      expect(response.body.tx_hash).toBeNull();
    });
  });

  describe('POST /api/auth/login', () => {
    it('issues a signature challenge for a score of 90 or more', async () => {
      await registerWallet(context);
      context.setScore(96);

      const response = await request(context.app)
        .post('/api/auth/login')
        .send({ wallet_address: WALLET, device_fingerprint: DEVICE });

      expect(response.status).toBe(200);
      expect(response.body.decision).toBe('allow');
      expect(response.body.trust_score).toBe(96);
      expect(response.body.nonce).toMatch(/^[0-9a-f]{64}$/);
      expect(response.body.expires_at).toBeTruthy();
    });

    it('asks for an OTP in the middle band and does not issue a nonce', async () => {
      await registerWallet(context);
      context.setScore(71, ['unrecognized_device']);

      const response = await request(context.app)
        .post('/api/auth/login')
        .send({ wallet_address: WALLET, device_fingerprint: DEVICE });

      expect(response.status).toBe(200);
      expect(response.body.decision).toBe('otp_required');
      expect(response.body.otp_challenge_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(response.body.nonce).toBeUndefined();
      expect(response.body.factors).toEqual(['unrecognized_device']);
    });

    it('blocks a score below 50 and issues no challenge of any kind', async () => {
      await registerWallet(context);
      context.setScore(22);

      const response = await request(context.app)
        .post('/api/auth/login')
        .send({ wallet_address: WALLET, device_fingerprint: DEVICE });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ decision: 'blocked', trust_score: 22, reason: 'risk_threshold' });
      expect(tables.nonces.size).toBe(0);
      expect(tables.otp.size).toBe(0);
    });

    // NFR-10: a risk engine that cannot answer must add friction, never remove it.
    it('falls back to the OTP band when the risk engine cannot be reached', async () => {
      await registerWallet(context);
      context.failScoring();

      const response = await request(context.app)
        .post('/api/auth/login')
        .send({ wallet_address: WALLET, device_fingerprint: DEVICE });

      expect(response.body.decision).toBe('otp_required');
      expect(response.body.trust_score).toBe(70);
    });

    it('records every attempt as unverified history', async () => {
      await registerWallet(context);
      context.setScore(96);

      await request(context.app)
        .post('/api/auth/login')
        .send({ wallet_address: WALLET, device_fingerprint: DEVICE });

      expect(context.reported).toHaveLength(1);
      expect(context.reported[0]).toMatchObject({ decision: 'allow', trustScore: 96, verified: false });
    });

    it('reuses an active session without scoring the attempt again', async () => {
      const token = await loginAndVerify(context);
      context.setScore(22);

      const response = await request(context.app)
        .post('/api/auth/login')
        .set('Authorization', `Bearer ${token}`)
        .send({ wallet_address: WALLET, device_fingerprint: DEVICE });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ decision: 'allow', session_active: true });
    });

    it('rejects a device fingerprint that is not a 32-byte hash', async () => {
      const response = await request(context.app)
        .post('/api/auth/login')
        .send({ wallet_address: WALLET, device_fingerprint: 'my-laptop' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_REQUEST');
    });
  });

  describe('POST /api/auth/verify', () => {
    it('creates a session and anchors the verified event', async () => {
      await registerWallet(context);
      const login = await request(context.app)
        .post('/api/auth/login')
        .send({ wallet_address: WALLET, device_fingerprint: DEVICE });

      const response = await request(context.app)
        .post('/api/auth/verify')
        .send({ wallet_address: WALLET, nonce: login.body.nonce, signature: SIGNATURE });

      expect(response.status).toBe(200);
      expect(response.body.decision).toBe('allow');
      expect(response.body.session_token).toMatch(/^[0-9a-f]{64}$/);
      expect(context.chain.verifySignature).toHaveBeenCalledWith(WALLET, login.body.nonce, SIGNATURE);
      expect(context.anchored).toHaveLength(1);
      expect(context.reported.at(-1)).toMatchObject({ verified: true, trustScore: 96 });
    });

    // TC-02: the nonce is consumed here, so the same signed challenge cannot be
    // presented twice even before the contract is asked.
    it('rejects a replayed nonce', async () => {
      await registerWallet(context);
      const login = await request(context.app)
        .post('/api/auth/login')
        .send({ wallet_address: WALLET, device_fingerprint: DEVICE });
      const body = { wallet_address: WALLET, nonce: login.body.nonce, signature: SIGNATURE };

      await request(context.app).post('/api/auth/verify').send(body);
      const replay = await request(context.app).post('/api/auth/verify').send(body);

      expect(replay.status).toBe(409);
      expect(replay.body.error.code).toBe('NONCE_USED');
    });

    it('rejects a nonce that was never issued', async () => {
      const response = await request(context.app)
        .post('/api/auth/verify')
        .send({ wallet_address: WALLET, nonce: 'ab'.repeat(32), signature: SIGNATURE });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('NONCE_USED');
    });

    it('reports an expired nonce separately so the customer can retry', async () => {
      await registerWallet(context);
      const login = await request(context.app)
        .post('/api/auth/login')
        .send({ wallet_address: WALLET, device_fingerprint: DEVICE });
      tables.nonces.get(`${WALLET.toLowerCase()}:${login.body.nonce}`)!.expired = true;

      const response = await request(context.app)
        .post('/api/auth/verify')
        .send({ wallet_address: WALLET, nonce: login.body.nonce, signature: SIGNATURE });

      expect(response.status).toBe(410);
      expect(response.body.error.code).toBe('NONCE_EXPIRED');
    });

    it('maps a contract rejection to the documented status', async () => {
      await registerWallet(context);
      const login = await request(context.app)
        .post('/api/auth/login')
        .send({ wallet_address: WALLET, device_fingerprint: DEVICE });
      vi.mocked(context.chain.verifySignature).mockRejectedValueOnce(
        new ChainError('INVALID_SIGNATURE', 'AuthRegistry: invalid signature'),
      );

      const response = await request(context.app)
        .post('/api/auth/verify')
        .send({ wallet_address: WALLET, nonce: login.body.nonce, signature: SIGNATURE });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_SIGNATURE');
    });

    // FR-19: while the contract is paused nothing logs in, whatever the score.
    it('refuses a login while authentication is paused', async () => {
      await registerWallet(context);
      const login = await request(context.app)
        .post('/api/auth/login')
        .send({ wallet_address: WALLET, device_fingerprint: DEVICE });
      vi.mocked(context.chain.verifySignature).mockRejectedValueOnce(
        new ChainError('AUTH_PAUSED', 'AuthRegistry: authentication is paused'),
      );

      const response = await request(context.app)
        .post('/api/auth/verify')
        .send({ wallet_address: WALLET, nonce: login.body.nonce, signature: SIGNATURE });

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('AUTH_PAUSED');
    });

    it('rejects a signature of the wrong length', async () => {
      const response = await request(context.app)
        .post('/api/auth/verify')
        .send({ wallet_address: WALLET, nonce: 'ab'.repeat(32), signature: '0xdeadbeef' });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/otp/verify', () => {
    async function startOtpLogin(): Promise<string> {
      await registerWallet(context);
      context.setScore(71);
      const login = await request(context.app)
        .post('/api/auth/login')
        .send({ wallet_address: WALLET, device_fingerprint: DEVICE });
      return login.body.otp_challenge_id;
    }

    function codeFor(challengeId: string): string {
      // The service stores only a hash, so the test finds the matching code the
      // same way the customer would: by knowing it. Here it is brute-forced from
      // the stored hash over the six-digit space, which keeps the plaintext out
      // of the service and out of the logs.
      const { createHash } = require('node:crypto') as typeof import('node:crypto');
      const stored = tables.otp.get(challengeId)!;
      for (let candidate = 0; candidate < 1_000_000; candidate += 1) {
        const code = candidate.toString().padStart(6, '0');
        if (createHash('sha256').update(code).digest('hex') === stored.codeHash) {
          return code;
        }
      }
      throw new Error('no matching code');
    }

    it('issues the signature challenge only after the correct code', async () => {
      const challengeId = await startOtpLogin();

      const response = await request(context.app)
        .post('/api/auth/otp/verify')
        .send({ otp_challenge_id: challengeId, code: codeFor(challengeId) });

      expect(response.status).toBe(200);
      expect(response.body.nonce).toMatch(/^[0-9a-f]{64}$/);
      expect(response.body.trust_score).toBe(71);
    });

    it('records the completed login with the route and reasons that caused the code', async () => {
      await registerWallet(context);
      context.setScore(71, ['unrecognized_device']);
      const login = await request(context.app)
        .post('/api/auth/login')
        .send({ wallet_address: WALLET, device_fingerprint: DEVICE });
      const challengeId = login.body.otp_challenge_id;

      const otp = await request(context.app)
        .post('/api/auth/otp/verify')
        .send({ otp_challenge_id: challengeId, code: codeFor(challengeId) });
      await request(context.app)
        .post('/api/auth/verify')
        .send({ wallet_address: WALLET, nonce: otp.body.nonce, signature: SIGNATURE });

      expect(context.reported.at(-1)).toMatchObject({
        verified: true,
        decision: 'otp_required',
        trustScore: 71,
        deviceFingerprint: DEVICE,
        factors: ['unrecognized_device'],
      });
    });

    it('emails the code to the address on the account and says so', async () => {
      const challengeId = await startOtpLogin();

      expect(context.emails).toEqual([{ to: EMAIL, code: codeFor(challengeId) }]);
    });

    it('tells the customer when the code could not be emailed', async () => {
      await registerWallet(context);
      context.setScore(71);
      context.failEmail();

      const login = await request(context.app)
        .post('/api/auth/login')
        .send({ wallet_address: WALLET, device_fingerprint: DEVICE });

      expect(login.body).toMatchObject({ decision: 'otp_required', otp_delivery: 'failed' });
    });

    // An account opened before email codes has no address: nothing was sent.
    it('says no code was sent when the account has no email address', async () => {
      tables.users.set(WALLET.toLowerCase(), {
        id: randomUUID(),
        walletAddress: WALLET.toLowerCase(),
        displayName: null,
        email: null,
      });
      context.setScore(71);

      const login = await request(context.app)
        .post('/api/auth/login')
        .send({ wallet_address: WALLET, device_fingerprint: DEVICE });

      expect(login.body).toMatchObject({ decision: 'otp_required', otp_delivery: 'none' });
      expect(context.emails).toEqual([]);
    });

    it('reports an expired code as expired', async () => {
      const challengeId = await startOtpLogin();
      const code = codeFor(challengeId);
      tables.otp.get(challengeId)!.expired = true;

      const response = await request(context.app)
        .post('/api/auth/otp/verify')
        .send({ otp_challenge_id: challengeId, code });

      expect(response.status).toBe(410);
      expect(response.body.error.code).toBe('OTP_EXPIRED');
    });

    it('records a step-up sign-in as one event, from the code step to the signature', async () => {
      const challengeId = await startOtpLogin();

      const otp = await request(context.app)
        .post('/api/auth/otp/verify')
        .send({ otp_challenge_id: challengeId, code: codeFor(challengeId) });
      await request(context.app)
        .post('/api/auth/verify')
        .send({ wallet_address: WALLET, nonce: otp.body.nonce, signature: SIGNATURE });

      const reports = context.reported.filter((report) => report.walletAddress.toLowerCase() === WALLET.toLowerCase());
      expect(reports).toHaveLength(2);
      expect(reports.map((report) => report.eventId)).toEqual([challengeId, challengeId]);
      expect(reports.map((report) => report.verified)).toEqual([false, true]);
    });

    it('counts a wrong code and says how many attempts remain', async () => {
      const challengeId = await startOtpLogin();
      const wrongCode = codeFor(challengeId) === '000000' ? '111111' : '000000';

      const response = await request(context.app)
        .post('/api/auth/otp/verify')
        .send({ otp_challenge_id: challengeId, code: wrongCode });

      expect(response.status).toBe(422);
      expect(response.body.error).toMatchObject({ code: 'OTP_INVALID', attempts_remaining: 2 });
    });

    it('blocks the attempt once the challenge is destroyed', async () => {
      const challengeId = await startOtpLogin();
      const code = codeFor(challengeId);
      const wrongCode = code === '000000' ? '111111' : '000000';

      for (let attempt = 0; attempt < 3; attempt += 1) {
        await request(context.app)
          .post('/api/auth/otp/verify')
          .send({ otp_challenge_id: challengeId, code: wrongCode });
      }

      const response = await request(context.app)
        .post('/api/auth/otp/verify')
        .send({ otp_challenge_id: challengeId, code });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('RISK_BLOCKED');
    });

    it('rejects a code that is not six digits', async () => {
      const challengeId = await startOtpLogin();

      const response = await request(context.app)
        .post('/api/auth/otp/verify')
        .send({ otp_challenge_id: challengeId, code: '12' });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/otp/resend', () => {
    async function startOtpLogin(): Promise<string> {
      await registerWallet(context);
      context.setScore(71);
      const login = await request(context.app)
        .post('/api/auth/login')
        .send({ wallet_address: WALLET, device_fingerprint: DEVICE });
      expect(login.body).toMatchObject({ otp_delivery: 'email', resend_in_seconds: 30 });
      return login.body.otp_challenge_id;
    }

    const resend = (challengeId: string) =>
      request(context.app).post('/api/auth/otp/resend').send({ otp_challenge_id: challengeId });

    // Moves the last send back past the cooldown instead of waiting for it.
    const coolDown = (challengeId: string) => {
      tables.otp.get(challengeId)!.sentAt = new Date(Date.now() - 31_000);
    };

    it('refuses a new code during the cooldown and says how long to wait', async () => {
      const challengeId = await startOtpLogin();

      const response = await resend(challengeId);

      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe('OTP_RESEND_TOO_SOON');
      expect(response.body.error.retry_after_seconds).toBeGreaterThan(0);
      expect(response.body.error.retry_after_seconds).toBeLessThanOrEqual(30);
      expect(response.headers['retry-after']).toBe(String(response.body.error.retry_after_seconds));
      expect(context.emails).toHaveLength(1);
    });

    it('emails a new code after the cooldown, and only the newest code works', async () => {
      const challengeId = await startOtpLogin();
      const firstCode = context.emails[0].code;
      coolDown(challengeId);

      const response = await resend(challengeId);
      const secondCode = context.emails[1].code;
      const oldCode = await request(context.app)
        .post('/api/auth/otp/verify')
        .send({ otp_challenge_id: challengeId, code: firstCode === secondCode ? '000000' : firstCode });
      const newCode = await request(context.app)
        .post('/api/auth/otp/verify')
        .send({ otp_challenge_id: challengeId, code: secondCode });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ otp_delivery: 'email', resend_in_seconds: 30 });
      expect(context.emails.map((email) => email.to)).toEqual([EMAIL, EMAIL]);
      expect(oldCode.body.error).toMatchObject({ code: 'OTP_INVALID', attempts_remaining: 2 });
      expect(newCode.status).toBe(200);
    });

    // Wrong guesses belong to the challenge: asking for a new code must not
    // hand out three more.
    it('keeps the wrong guesses already made', async () => {
      const challengeId = await startOtpLogin();
      const wrongCode = context.emails[0].code === '000000' ? '111111' : '000000';
      await request(context.app).post('/api/auth/otp/verify').send({ otp_challenge_id: challengeId, code: wrongCode });
      coolDown(challengeId);
      await resend(challengeId);
      const nextWrong = context.emails[1].code === wrongCode ? '222222' : wrongCode;

      const response = await request(context.app)
        .post('/api/auth/otp/verify')
        .send({ otp_challenge_id: challengeId, code: nextWrong });

      expect(response.body.error).toMatchObject({ code: 'OTP_INVALID', attempts_remaining: 1 });
    });

    it('lets an expired code be replaced', async () => {
      const challengeId = await startOtpLogin();
      tables.otp.get(challengeId)!.expired = true;
      coolDown(challengeId);

      await resend(challengeId);
      const response = await request(context.app)
        .post('/api/auth/otp/verify')
        .send({ otp_challenge_id: challengeId, code: context.emails[1].code });

      expect(response.status).toBe(200);
    });

    it('stops after three codes in all', async () => {
      const challengeId = await startOtpLogin();
      coolDown(challengeId);
      await resend(challengeId);
      coolDown(challengeId);
      await resend(challengeId);
      coolDown(challengeId);

      const response = await resend(challengeId);

      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe('OTP_RESEND_LIMIT');
      expect(context.emails).toHaveLength(3);
    });

    it('says when the new code could not be emailed', async () => {
      const challengeId = await startOtpLogin();
      coolDown(challengeId);
      context.failEmail();

      const response = await resend(challengeId);

      expect(response.status).toBe(200);
      expect(response.body.otp_delivery).toBe('failed');
    });

    it('refuses a finished, unknown or malformed challenge', async () => {
      const challengeId = await startOtpLogin();
      await request(context.app)
        .post('/api/auth/otp/verify')
        .send({ otp_challenge_id: challengeId, code: context.emails[0].code });
      coolDown(challengeId);

      const finished = await resend(challengeId);
      const unknown = await resend(randomUUID());
      const malformed = await resend('not-a-uuid');

      expect(finished.status).toBe(403);
      expect(unknown.body.error.code).toBe('RISK_BLOCKED');
      expect(malformed.status).toBe(400);
      expect(context.emails).toHaveLength(1);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('refuses without a session token', async () => {
      const response = await request(context.app).post('/api/auth/logout');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('SESSION_INVALID');
    });

    it('invalidates the session immediately', async () => {
      const token = await loginAndVerify(context);

      const loggedOut = await request(context.app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);
      const reused = await request(context.app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(loggedOut.status).toBe(200);
      expect(reused.status).toBe(401);
    });
  });

  describe('admin routes', () => {
    it('refuses an anonymous caller', async () => {
      const response = await request(context.app).get('/api/admin/attempts/top');

      expect(response.status).toBe(401);
    });

    it('refuses a session whose wallet is not on the allow-list', async () => {
      const token = await loginAndVerify(context);

      const response = await request(context.app)
        .get('/api/admin/attempts/top')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('serves an admin session', async () => {
      const token = await loginAndVerify(context, ADMIN_WALLET);

      const response = await request(context.app)
        .get('/api/admin/attempts/top')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.attempts).toHaveLength(1);
    });

    it('accepts the internal service token', async () => {
      const response = await request(context.app)
        .get('/api/admin/attempts/top')
        .set('X-Internal-Token', INTERNAL_TOKEN);

      expect(response.status).toBe(200);
    });

    it('rejects a wrong internal token', async () => {
      const response = await request(context.app)
        .get('/api/admin/attempts/top')
        .set('X-Internal-Token', 'guessed');

      expect(response.status).toBe(401);
    });

    it('rejects an invalid n', async () => {
      const response = await request(context.app)
        .get('/api/admin/attempts/top?n=0')
        .set('X-Internal-Token', INTERNAL_TOKEN);

      expect(response.status).toBe(400);
    });

    it('pauses and resumes authentication', async () => {
      const paused = await request(context.app)
        .post('/api/admin/pause')
        .set('X-Internal-Token', INTERNAL_TOKEN);
      const resumed = await request(context.app)
        .post('/api/admin/resume')
        .set('X-Internal-Token', INTERNAL_TOKEN);

      expect(paused.body).toEqual({ paused: true, tx_hash: '0xpause' });
      expect(resumed.body).toEqual({ paused: false, tx_hash: '0xresume' });
      expect(context.chain.pauseAuth).toHaveBeenCalledOnce();
      expect(context.chain.resumeAuth).toHaveBeenCalledOnce();
    });

    // TRD §11.3: a pause stops existing sessions too, not only new sign-ins.
    it('ends customer sessions when paused, but keeps the administrator able to resume', async () => {
      const customerToken = await loginAndVerify(context);
      const adminToken = await loginAndVerify(context, ADMIN_WALLET);

      const paused = await request(context.app)
        .post('/api/admin/pause')
        .set('Authorization', `Bearer ${adminToken}`);
      const customer = await request(context.app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${customerToken}`);
      const resumed = await request(context.app)
        .post('/api/admin/resume')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(paused.status).toBe(200);
      expect(customer.status).toBe(401);
      expect(customer.body.error.code).toBe('SESSION_INVALID');
      expect(resumed.status).toBe(200);
    });

    it('does not report a chain outage when the pause itself went through', async () => {
      vi.spyOn(context.sessions, 'revokeAllExcept').mockRejectedValueOnce(new Error('database unavailable'));

      const response = await request(context.app)
        .post('/api/admin/pause')
        .set('X-Internal-Token', INTERNAL_TOKEN);

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
      expect(context.system).toEqual([]);
    });
  });

  describe('circuit breaker', () => {
    it('pauses authentication once more than the threshold of blocked attempts arrive', async () => {
      await registerWallet(context);
      context.setScore(10);

      for (let attempt = 0; attempt < 4; attempt += 1) {
        await request(context.app)
          .post('/api/auth/login')
          .send({ wallet_address: WALLET, device_fingerprint: DEVICE });
      }
      await new Promise((resolve) => setImmediate(resolve));

      expect(context.chain.pauseAuth).toHaveBeenCalledOnce();
    });

    it('reports the breaker and re-arms it on resume', async () => {
      const status = await request(context.app)
        .get('/api/admin/status')
        .set('X-Internal-Token', INTERNAL_TOKEN);
      await request(context.app).post('/api/admin/resume').set('X-Internal-Token', INTERNAL_TOKEN);

      expect(status.body).toEqual({
        paused: false,
        breaker: { anomalous_in_window: 0, threshold: 3, window_ms: 10_000 },
      });
      expect(context.system).toEqual(['resumed']);
    });
  });

  describe('audit routes', () => {
    it('refuses an anonymous caller', async () => {
      const response = await request(context.app).get(`/api/audit/proof/${ANCHORED_EVENT_ID}`);

      expect(response.status).toBe(401);
    });

    it('returns the proof for an anchored event', async () => {
      const response = await request(context.app)
        .get(`/api/audit/proof/${ANCHORED_EVENT_ID}`)
        .set('X-Internal-Token', INTERNAL_TOKEN);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ event_id: ANCHORED_EVENT_ID, batch_id: 0, leaf_index: 0 });
      expect(response.body.siblings).toHaveLength(1);
      expect(response.body.current_leaf_hash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(response.body.event).toMatchObject({ eventId: ANCHORED_EVENT_ID, trustScore: 96, decision: 'allow' });
    });

    it('reports an event that has not been anchored yet', async () => {
      const response = await request(context.app)
        .get('/api/audit/proof/11111111-0000-4000-8000-111111111111')
        .set('X-Internal-Token', INTERNAL_TOKEN);

      expect(response.status).toBe(404);
    });

    it('reads the root back from the chain', async () => {
      const response = await request(context.app)
        .get('/api/audit/root/0')
        .set('X-Internal-Token', INTERNAL_TOKEN);

      expect(response.status).toBe(200);
      expect(response.body.merkle_root).toBe('0x' + '33'.repeat(32));
      expect(context.chain.getMerkleRoot).toHaveBeenCalledWith(0);
    });

    it('rejects a batch id that is not a number', async () => {
      const response = await request(context.app)
        .get('/api/audit/root/abc')
        .set('X-Internal-Token', INTERNAL_TOKEN);

      expect(response.status).toBe(400);
    });
  });
});
