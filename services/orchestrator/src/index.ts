import express from 'express';
import { createRiskEngineClient } from './core/riskEngineClient';
import { LRUCache } from './ds/lruCache';
import type { CachedSession } from './core/loginStateMachine';
import { MongoClient } from 'mongodb';
import { parseTopAttemptsLimit } from './routes/topAttemptsLimit';

// ---- Config from environment ----
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const RISK_ENGINE_URL = process.env.RISK_ENGINE_URL ?? 'http://risk-engine:8001';
const SESSION_TTL_MS = parseInt(process.env.SESSION_TTL_MINUTES ?? '30', 10) * 60_000;
const SESSION_CACHE_MAX = 1024;
const MONGO_URL = process.env.MONGO_URL ?? 'mongodb://mongo:27017';

// ---- Collaborators ----
const sessionCache = new LRUCache<string, CachedSession>(SESSION_CACHE_MAX);
const riskEngine = createRiskEngineClient(RISK_ENGINE_URL);
const mongoClient = new MongoClient(MONGO_URL);
const authDb = mongoClient.db('authdb');

// ---- Express app ----
const app = express();
app.use(express.json());

// Health check — used by gateway and docker-compose healthcheck
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'orchestrator' });
});

// GET /api/admin/attempts/top — fetch top N riskiest attempts
app.get('/api/admin/attempts/top', async (req, res) => {
  const n = parseTopAttemptsLimit(req.query.n);
  if (n === null) {
    return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'n must be a positive whole number' } });
  }

  try {
    const loginEventsCol = authDb.collection('login_events');
    const fraudFlagsCol = authDb.collection('fraud_flags');

    // Get attempts sorted by trust_score ascending (riskiest first)
    const attempts = await loginEventsCol
      .find({})
      .sort({ trust_score: 1, timestamp: -1 })
      .limit(n)
      .toArray();

    // Attach cluster_id if wallet is flagged
    const result = await Promise.all(
      attempts.map(async (attempt) => {
        const flag = await fraudFlagsCol.findOne({ node_ids: attempt.wallet_address });
        return {
          event_id: attempt.event_id || attempt._id.toString(),
          wallet_address: attempt.wallet_address,
          ip_address: attempt.ip_address,
          device_fingerprint: attempt.device_fingerprint,
          trust_score: attempt.trust_score,
          decision: attempt.decision,
          timestamp: attempt.timestamp,
          cluster_id: flag ? flag.cluster_id : undefined,
        };
      })
    );

    return res.json({ attempts: result });
  } catch (err) {
    console.error('[admin] failed to fetch top attempts:', err);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch attempts' } });
  }
});

// POST /api/auth/register — placeholder (DB persistence is Phase 2)
app.post('/api/auth/register', (req, res) => {
  const { wallet_address } = req.body as { wallet_address?: string };
  if (!wallet_address) {
    return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'wallet_address required' } });
  }
  // Phase 1: accept registrations, no on-chain tx yet (Karthik's Phase 2)
  console.log(`[register] wallet=${wallet_address}`);
  return res.status(201).json({ wallet_address });
});

// POST /api/auth/login — score with risk engine and return routing decision
app.post('/api/auth/login', async (req, res) => {
  const { wallet_address, device_fingerprint } = req.body as {
    wallet_address?: string;
    device_fingerprint?: string;
  };

  if (!wallet_address || !device_fingerprint) {
    return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'wallet_address and device_fingerprint required' } });
  }

  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
    ?? req.socket.remoteAddress
    ?? '0.0.0.0';

  try {
    const { trustScore, reasons } = await riskEngine.score({
      walletAddress: wallet_address,
      ipAddress: ip,
      deviceFingerprint: device_fingerprint,
      timestamp: new Date(),
    });

    const decision =
      trustScore >= 90 ? 'CHALLENGE_ISSUED'
      : trustScore >= 50 ? 'OTP_PENDING'
      : 'BLOCKED';

    console.log(`[login] wallet=${wallet_address} score=${trustScore} decision=${decision}`);

    // Report completed blocked events back to risk engine for history tracking
    if (decision === 'BLOCKED') {
      fetch(`${RISK_ENGINE_URL}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address,
          ip_address: ip,
          device_fingerprint,
          trust_score: trustScore,
          decision: 'blocked',
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {}); // fire-and-forget
    }

    return res.json({ state: decision, trustScore, reasons });
  } catch (err) {
    console.error('[login] risk engine error:', err);
    // NFR-10: fail to OTP step-up, never open
    return res.json({ state: 'OTP_PENDING', trustScore: 70, reasons: [] });
  }
});

// POST /api/auth/nonce — placeholder for Phase 2 signature flow
app.post('/api/auth/nonce', (req, res) => {
  const { wallet_address } = req.body as { wallet_address?: string };
  if (!wallet_address) {
    return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'wallet_address required' } });
  }
  // Phase 2: Karthik's on-chain nonce
  const nonce = require('crypto').randomBytes(32).toString('hex');
  return res.json({ wallet_address, nonce });
});

// POST /api/auth/verify — placeholder for Phase 2 signature verification
app.post('/api/auth/verify', (_req, res) => {
  return res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'Signature verification is Phase 2 (Karthik)' } });
});

// POST /api/auth/otp/verify — placeholder for Phase 2
app.post('/api/auth/otp/verify', (_req, res) => {
  return res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: 'OTP verification is Phase 2' } });
});

app.listen(PORT, async () => {
  try {
    await mongoClient.connect();
    console.log(`Connected to MongoDB at ${MONGO_URL}`);
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
  }
  console.log(`Orchestrator listening on port ${PORT}`);
  console.log(`  Risk engine: ${RISK_ENGINE_URL}`);
  console.log(`  Session TTL: ${SESSION_TTL_MS / 60_000} min`);
});

export { sessionCache, riskEngine };
