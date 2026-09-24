import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { SessionStore } from '../core/sessions';
import { sendError } from '../errors';

export interface AuthOptions {
  sessions: SessionStore;
  adminWallets: string[];
  internalApiToken: string;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return null;
  }

  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function presentsInternalToken(req: Request, expected: string): boolean {
  const presented = req.headers['x-internal-token'];
  if (!expected || typeof presented !== 'string') {
    return false;
  }

  const presentedBytes = Buffer.from(presented);
  const expectedBytes = Buffer.from(expected);
  return presentedBytes.length === expectedBytes.length && timingSafeEqual(presentedBytes, expectedBytes);
}

// Validates the opaque session token: cache first, then Postgres (TRD §11.3).
export function createRequireSession(options: AuthOptions): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = bearerToken(req);
    if (token === null) {
      sendError(res, 'SESSION_INVALID');
      return;
    }

    const session = await options.sessions.find(token);
    if (session === null) {
      sendError(res, 'SESSION_INVALID');
      return;
    }

    res.locals.session = { token, walletAddress: session.walletAddress };
    next();
  };
}

// Admin endpoints need a session whose wallet is on the ADMIN_WALLETS list
// (TRD §11.4) — there is no second credential system. The shared internal token
// is accepted as a service credential for the local demo scripts; the gateway
// strips that header from anything a client sends, so it never arrives from
// outside.
export function createRequireAdmin(options: AuthOptions): RequestHandler {
  const requireSession = createRequireSession(options);

  return (req: Request, res: Response, next: NextFunction): void => {
    if (presentsInternalToken(req, options.internalApiToken)) {
      next();
      return;
    }

    requireSession(req, res, () => {
      const wallet = res.locals.session?.walletAddress?.toLowerCase();
      if (!wallet || !options.adminWallets.includes(wallet)) {
        sendError(res, 'FORBIDDEN');
        return;
      }
      next();
    });
  };
}
