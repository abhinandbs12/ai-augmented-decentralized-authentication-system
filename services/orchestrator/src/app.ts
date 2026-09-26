import express, { type ErrorRequestHandler, type Express } from 'express';
import helmet from 'helmet';
import type { Db } from 'mongodb';
import type { Pool } from 'pg';
import type { MerkleBatcher } from './audit/batcher';
import type { AuthRegistryClient } from './chain/authRegistryClient';
import type { EventReporter } from './core/eventReporter';
import type { CircuitBreaker } from './core/circuitBreaker';
import type { CachedSession } from './core/loginStateMachine';
import type { NonceService } from './core/nonces';
import type { RiskEngine } from './core/riskEngineClient';
import type { SessionStore } from './core/sessions';
import type { LRUCache } from './ds/lruCache';
import { sendError } from './errors';
import { createRequireAdmin, createRequireSession } from './middleware/auth';
import { requestIdMiddleware } from './middleware/requestId';
import type { OtpService } from './otp/otpService';
import type { Realtime } from './realtime/socket';
import { createAdminRoutes } from './routes/admin';
import { createAuditRoutes } from './routes/audit';
import { createAuthRoutes } from './routes/auth';

export interface AppDependencies {
  pool: Pool;
  authDb: Db;
  sessions: SessionStore;
  sessionCache: LRUCache<string, CachedSession>;
  nonces: NonceService;
  otp: OtpService;
  chain: AuthRegistryClient;
  riskEngine: RiskEngine;
  events: EventReporter;
  batcher: MerkleBatcher;
  realtime: Realtime;
  breaker: CircuitBreaker;
  adminWallets: string[];
  internalApiToken: string;
}

// Auth bodies are a few hundred bytes; the gateway enforces the same limit.
const MAX_BODY_SIZE = '10kb';

export function createApp(deps: AppDependencies): Express {
  const app = express();
  const auth = { sessions: deps.sessions, adminWallets: deps.adminWallets, internalApiToken: deps.internalApiToken };
  const requireSession = createRequireSession(auth);
  const requireAdmin = createRequireAdmin(auth);

  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(express.json({ limit: MAX_BODY_SIZE }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'orchestrator' });
  });

  app.use('/api/auth', createAuthRoutes({ ...deps, requireSession }));
  app.use('/api/admin', createAdminRoutes({
      authDb: deps.authDb,
      chain: deps.chain,
      breaker: deps.breaker,
      realtime: deps.realtime,
      sessions: deps.sessions,
      adminWallets: deps.adminWallets,
      requireAdmin,
    }));
  app.use(
    '/api/audit',
    createAuditRoutes({ pool: deps.pool, authDb: deps.authDb, chain: deps.chain, requireAdmin }),
  );

  app.use((_req, res) => {
    sendError(res, 'NOT_FOUND');
  });
  app.use(handleUnexpectedError);

  return app;
}

const handleUnexpectedError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    // Only the error type is logged: body-parser attaches the raw body, which
    // can hold an OTP code or a signature.
    const errorType = (error as { type?: unknown }).type ?? status;
    console.error(`Rejected request body [${res.locals.requestId}]: ${String(errorType)}`);
    sendError(res, 'INVALID_REQUEST');
    return;
  }

  console.error(`Unexpected orchestrator error [${res.locals.requestId}]:`, error);
  sendError(res, 'INTERNAL_ERROR');
};
