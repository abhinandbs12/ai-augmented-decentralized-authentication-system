import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// The gateway generates the id and overwrites whatever the client sent, so the
// header can be trusted here. A direct call still gets an id of its own, which
// keeps every error body carrying one (TRD §14.1).
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const forwarded = req.headers['x-request-id'];
  const requestId = typeof forwarded === 'string' && forwarded.length > 0 ? forwarded : randomUUID();

  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  next();
}
