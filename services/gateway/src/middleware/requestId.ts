import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// The gateway is the entry point, so it always creates the id itself.
// A client-supplied X-Request-Id is overwritten and never reaches the logs.
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();

  req.headers['x-request-id'] = requestId;
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  next();
}
