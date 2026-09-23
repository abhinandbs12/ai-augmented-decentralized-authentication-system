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
import { OtpService } from '../src/otp/otpService';

// ---- In-memory stand-ins for the four tables the routes touch -------------
const tables = vi.hoisted(() => ({
  users: new Map<string, { id: string; walletAddress: string; displayName: string | null; phoneNumber: string | null }>(),
  nonces: new Map<string, { id: string; wallet: string; value: string; trustScore: number; used: boolean; expired: boolean }>(),
  sessions: new Map<string, { walletAddress: string; userId: string; expiresAt: Date; revoked: boolean }>(),
  otp: new Map<string, { id: string; walletAddress: string; codeHash: string; trustScore: number; attempts: number; verified: boolean; expired: boolean }>(),
}));

vi.mock('../src/db/users', () => ({
  insertUser: async (_pool: Pool, user: { walletAddress: string; displayName?: string; phoneNumber?: string }) => {
    const walletAddress = user.walletAddress.toLowerCase();
    if (tables.users.has(walletAddress)) {
      return null;
    }
    const record = {
      id: randomUUID(),
      walletAddress,
      displayName: user.displayName ?? null,
      phoneNumber: user.phoneNumber ?? null,
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
    nonce: { walletAddress: string; value: string; trustScore: number },
  ) => {
    const id = randomUUID();
    tables.nonces.set(`${nonce.walletAddress.toLowerCase()}:${nonce.value}`, {
      id,
      wallet: nonce.walletAddress.toLowerCase(),
      value: nonce.value,
      trustScore: nonce.trustScore,
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
    return { status: 'consumed', nonceId: stored.id, trustScore: stored.trustScore };
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
}));

vi.mock('../src/db/otpChallenges', () => ({
  insertOtpChallenge: async (
    _pool: Pool,
    challenge: { walletAddress: string; codeHash: string; trustScore: number },
  ) => {
    const id = randomUUID();
    tables.otp.set(id, {
      id,
      walletAddress: challenge.walletAddress.toLowerCase(),
      codeHash: challenge.codeHash,
      trustScore: challenge.trustScore,
      attempts: 0,
      verified: false,
      expired: false,
    });
    return id;
  },
  findOtpChallenge: async (_pool: Pool, id: string) => tables.otp.get(id) ?? null,
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

interface TestContext {
  app: ReturnType<typeof createApp>;
  system: string[];
  chain: AuthRegistryClient;
  reported: LoginEventReport[];
  anchored: AuditEvent[];
  sessions: SessionStore;
  setScore(trustScore: number, reasons?: string[]): void;
  failScoring(): void;
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
    otp: new OtpService(pool, { ttlMs: 5 * 60_000, maxAttempts: 3 }, { send: async () => undefined }),
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
    setScore: (trustScore, reasons = []) => {
      score = { trustScore, reasons };
    },
    failScoring: () => {
      score = null;
    },
  };
}

async function registerWallet(context: TestContext, walletAddress = WALLET): Promise<void> {
  await request(context.app)
    .post('/api/auth/register')
    .send({ wallet_address: walletAddress, phone_number: '+919876543210' });
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
        .send({ wallet_address: WALLET, display_name: 'Asha', phone_number: '+919876543210' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ wallet_address: WALLET.toLowerCase(), registered: true, tx_hash: '0xregister' });
      expect(context.chain.registerUser).toHaveBeenCalledWith(WALLET);
    });

    it('rejects a second registration of the same wallet (FR-04)', async () => {
      await registerWallet(context);

      const response = await request(context.app).post('/api/auth/register').send({ wallet_address: WALLET });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('ALREADY_REGISTERED');
    });

    it('rejects a malformed wallet address', async () => {
      const response = await request(context.app).post('/api/auth/register').send({ wallet_address: '0x123' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_REQUEST');
    });

    it('reports an unreachable chain instead of creating a profile', async () => {
      vi.mocked(context.chain.registerUser).mockRejectedValueOnce(
        new ChainError('CHAIN_UNAVAILABLE', 'no rpc'),
      );

      const response = await request(context.app).post('/api/auth/register').send({ wallet_address: WALLET });

      expect(response.status).toBe(502);
      expect(response.body.error.code).toBe('CHAIN_UNAVAILABLE');
    });

    // A previous attempt that registered on-chain and then failed must not lock
    // the customer out for good.
    it('completes the profile when the wallet is already registered on-chain', async () => {
      vi.mocked(context.chain.registerUser).mockRejectedValueOnce(
        new ChainError('ALREADY_REGISTERED', 'AuthRegistry: already registered'),
      );

      const response = await request(context.app).post('/api/auth/register').send({ wallet_address: WALLET });

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
