import { Router, type RequestHandler } from 'express';
import type { Db } from 'mongodb';
import { ChainError, type AuthRegistryClient } from '../chain/authRegistryClient';
import type { CircuitBreaker } from '../core/circuitBreaker';
import type { SessionStore } from '../core/sessions';
import { sendError, type ErrorCode } from '../errors';
import type { Realtime } from '../realtime/socket';
import { parseTopAttemptsLimit } from './topAttemptsLimit';
import { asyncRoute } from './validators';

export interface AdminDependencies {
  authDb: Db;
  chain: AuthRegistryClient;
  breaker: CircuitBreaker;
  realtime: Realtime;
  sessions: SessionStore;
  adminWallets: string[];
  requireAdmin: RequestHandler;
}

const CHAIN_ERROR_RESPONSES: Record<string, ErrorCode> = {
  AUTH_PAUSED: 'AUTH_PAUSED',
  CHAIN_UNAVAILABLE: 'CHAIN_UNAVAILABLE',
};

export function createAdminRoutes(deps: AdminDependencies): Router {
  const router = Router();

  // Every admin route needs a session whose wallet is on the allow-list.
  router.use(deps.requireAdmin);

  // FR-24. A sorted, limited query is the Phase 1 approach; the min-heap is
  // listed for Phase 2 in Phase2_Remaining_Work §4.
  router.get(
    '/attempts/top',
    asyncRoute(async (req, res) => {
      const limit = parseTopAttemptsLimit(req.query.n);
      if (limit === null) {
        sendError(res, 'INVALID_REQUEST');
        return;
      }

      const loginEvents = deps.authDb.collection('login_events');
      const fraudFlags = deps.authDb.collection('fraud_flags');

      const attempts = await loginEvents
        .find({})
        .sort({ trust_score: 1, timestamp: -1 })
        .limit(limit)
        .toArray();

      const ranked = await Promise.all(
        attempts.map(async (attempt) => {
          const flag = await fraudFlags.findOne({ node_ids: attempt.wallet_address });
          return {
            event_id: attempt.event_id ?? attempt._id.toString(),
            wallet_address: attempt.wallet_address,
            ip_address: attempt.ip_address,
            device_fingerprint: attempt.device_fingerprint,
            trust_score: attempt.trust_score,
            decision: attempt.decision,
            factors: attempt.factors ?? [],
            verified: attempt.verified ?? false,
            timestamp: attempt.timestamp,
            cluster_id: flag ? flag.cluster_id : undefined,
          };
        }),
      );

      res.json({ attempts: ranked });
    }),
  );

  // FR-19: the circuit breaker lives in the contract, so pausing stops every
  // login regardless of its Trust Score. Customer sessions end with it (TRD
  // §11.3); administrators stay signed in so that one of them can resume.
  // pauseAuth() is idempotent, so a pause that failed here can simply be retried.
  router.post(
    '/pause',
    asyncRoute(async (_req, res) => {
      await callChain(res, () => deps.chain.pauseAuth(), async (txHash) => {
        await deps.sessions.revokeAllExcept(deps.adminWallets);
        deps.realtime.emitSystem('paused', 'administrator');
        return { paused: true, tx_hash: txHash };
      });
    }),
  );

  router.post(
    '/resume',
    asyncRoute(async (_req, res) => {
      await callChain(res, () => deps.chain.resumeAuth(), (txHash) => {
        deps.breaker.reset();
        deps.realtime.emitSystem('resumed', 'administrator');
        return { paused: false, tx_hash: txHash };
      });
    }),
  );

  router.get(
    '/status',
    asyncRoute(async (_req, res) => {
      try {
        const breaker = deps.breaker.status();
        res.json({
          paused: await deps.chain.isPaused(),
          breaker: {
            anomalous_in_window: breaker.anomalousInWindow,
            threshold: breaker.threshold,
            window_ms: breaker.windowMs,
          },
        });
      } catch (error) {
        sendError(res, CHAIN_ERROR_RESPONSES[(error as ChainError).code] ?? 'CHAIN_UNAVAILABLE');
      }
    }),
  );

  // TC-07: deliberately alters a stored event so an auditor can watch its
  // Merkle proof stop verifying. Admin-only, and it only touches telemetry.
  router.post(
    '/tamper/:eventId',
    asyncRoute(async (req, res) => {
      const result = await deps.authDb
        .collection('login_events')
        .updateOne({ event_id: req.params.eventId }, { $set: { trust_score: 1 } });

      if (result.matchedCount === 0) {
        sendError(res, 'NOT_FOUND');
        return;
      }

      res.json({ event_id: req.params.eventId, tampered: true });
    }),
  );

  return router;
}

// Only the chain call maps to a chain error. Anything `body` throws, such as a
// database failure, reaches the error handler as the 500 it is.
async function callChain(
  res: Parameters<typeof sendError>[0],
  call: () => Promise<{ txHash: string }>,
  body: (txHash: string) => Record<string, unknown> | Promise<Record<string, unknown>>,
): Promise<void> {
  let txHash: string;
  try {
    ({ txHash } = await call());
  } catch (error) {
    sendError(res, CHAIN_ERROR_RESPONSES[(error as ChainError).code] ?? 'CHAIN_UNAVAILABLE');
    return;
  }
  res.json(await body(txHash));
}
