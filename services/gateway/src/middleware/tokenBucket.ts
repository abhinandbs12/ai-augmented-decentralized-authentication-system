import type { NextFunction, Request, Response } from 'express';

// Each client IP gets a burst of BUCKET_CAPACITY requests,
// then earns one more request every REFILL_INTERVAL_MS.
const BUCKET_CAPACITY = 10;
const REFILL_INTERVAL_MS = 3000;

// A bucket idle for 10 minutes has long since refilled to full, so removing it
// changes nothing for the client and keeps memory bounded.
const IDLE_BUCKET_TTL_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

const RATE_LIMIT_MESSAGE = 'Too many requests, please try again shortly';

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();
let lastCleanup = Date.now();

function refillBucket(bucket: Bucket, now: number): void {
  // Clamp at zero so a system clock moving backwards never removes tokens.
  const elapsedMs = Math.max(0, now - bucket.lastRefill);
  const earnedTokens = elapsedMs / REFILL_INTERVAL_MS;

  bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + earnedTokens);
  bucket.lastRefill = now;
}

function removeIdleBuckets(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
    return;
  }

  lastCleanup = now;
  for (const [clientIp, bucket] of buckets) {
    if (now - bucket.lastRefill > IDLE_BUCKET_TTL_MS) {
      buckets.delete(clientIp);
    }
  }
}

// Must run before request validation and before proxying, so abusive traffic
// is rejected before any other work is done.
export function tokenBucketMiddleware(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  removeIdleBuckets(now);

  const clientIp = req.ip ?? 'unknown';
  let bucket = buckets.get(clientIp);

  if (bucket === undefined) {
    bucket = { tokens: BUCKET_CAPACITY, lastRefill: now };
    buckets.set(clientIp, bucket);
  } else {
    refillBucket(bucket, now);
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    next();
    return;
  }

  res.status(429).json({ error: RATE_LIMIT_MESSAGE });
}
