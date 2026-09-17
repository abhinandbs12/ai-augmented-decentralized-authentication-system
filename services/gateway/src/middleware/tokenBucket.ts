import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { sendError } from '../errors';

export interface TokenBucketOptions {
  capacity: number;
  refillIntervalMs: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const CLEANUP_INTERVAL_MS = 60 * 1000;

// Each client IP gets a burst of `capacity` requests, then earns one more request
// every `refillIntervalMs`. Must run before body parsing and validation, so abusive
// traffic is rejected before any other work is done.
export function createTokenBucketMiddleware(options: TokenBucketOptions): RequestHandler {
  const { capacity, refillIntervalMs } = options;
  const buckets = new Map<string, Bucket>();
  let lastCleanup = Date.now();

  function earnedTokensSince(bucket: Bucket, now: number): number {
    // Clamp at zero so a system clock moving backwards never removes tokens.
    return Math.max(0, now - bucket.lastRefill) / refillIntervalMs;
  }

  function refillBucket(bucket: Bucket, now: number): void {
    bucket.tokens = Math.min(capacity, bucket.tokens + earnedTokensSince(bucket, now));
    bucket.lastRefill = now;
  }

  // A bucket that has refilled to full behaves exactly like a new one,
  // so removing it keeps memory bounded without giving anyone extra tokens.
  function removeFullBuckets(now: number): void {
    if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
      return;
    }

    lastCleanup = now;
    for (const [clientIp, bucket] of buckets) {
      if (bucket.tokens + earnedTokensSince(bucket, now) >= capacity) {
        buckets.delete(clientIp);
      }
    }
  }

  return function tokenBucketMiddleware(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    removeFullBuckets(now);

    const clientIp = req.ip ?? 'unknown';
    let bucket = buckets.get(clientIp);

    if (bucket === undefined) {
      bucket = { tokens: capacity, lastRefill: now };
      buckets.set(clientIp, bucket);
    } else {
      refillBucket(bucket, now);
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      next();
      return;
    }

    sendError(res, 'RATE_LIMITED');
  };
}
