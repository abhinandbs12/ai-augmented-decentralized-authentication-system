import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTokenBucketMiddleware } from '../src/middleware/tokenBucket';

// Expected numbers are written out instead of derived from the options,
// so the test fails if the limiting maths changes.
const DEFAULT_OPTIONS = { capacity: 10, refillIntervalMs: 3000 };
const CLIENT_IP = '203.0.113.1';

function sendRequest(middleware: RequestHandler, ip: string | undefined) {
  const req = { ip } as Request;
  const res = {
    locals: { requestId: 'test-request-id' },
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  const next = vi.fn();

  middleware(req, res as unknown as Response, next as NextFunction);

  return { res, next };
}

function isAllowed(middleware: RequestHandler, ip: string | undefined = CLIENT_IP): boolean {
  return sendRequest(middleware, ip).next.mock.calls.length === 1;
}

function countAllowed(middleware: RequestHandler, attempts: number): number {
  let allowed = 0;
  for (let i = 0; i < attempts; i++) {
    if (isAllowed(middleware)) {
      allowed++;
    }
  }
  return allowed;
}

describe('createTokenBucketMiddleware', () => {
  beforeEach(() => {
    // Freeze time so a tight loop of requests earns no new tokens.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows the first 10 requests from one IP and rejects requests 11-15 with 429', () => {
    const middleware = createTokenBucketMiddleware(DEFAULT_OPTIONS);

    for (let i = 0; i < 10; i++) {
      const { res, next } = sendRequest(middleware, CLIENT_IP);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    }

    for (let i = 0; i < 5; i++) {
      const { res, next } = sendRequest(middleware, CLIENT_IP);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many attempts. Please wait a moment.',
          request_id: 'test-request-id',
        },
      });
    }
  });

  it('earns one new request every 3 seconds', () => {
    const middleware = createTokenBucketMiddleware(DEFAULT_OPTIONS);
    expect(countAllowed(middleware, 11)).toBe(10);

    vi.advanceTimersByTime(1500);
    expect(isAllowed(middleware)).toBe(false);

    vi.advanceTimersByTime(1500);
    expect(isAllowed(middleware)).toBe(true);
    expect(isAllowed(middleware)).toBe(false);
  });

  it('never stores more than the capacity', () => {
    const middleware = createTokenBucketMiddleware(DEFAULT_OPTIONS);
    expect(countAllowed(middleware, 10)).toBe(10);

    // 45 seconds would earn 15 tokens without the cap (and is too soon for cleanup).
    vi.advanceTimersByTime(45 * 1000);

    expect(countAllowed(middleware, 15)).toBe(10);
  });

  it('uses the configured capacity and refill interval', () => {
    const middleware = createTokenBucketMiddleware({ capacity: 2, refillIntervalMs: 1000 });
    expect(countAllowed(middleware, 3)).toBe(2);

    vi.advanceTimersByTime(1000);
    expect(countAllowed(middleware, 2)).toBe(1);
  });

  it('does not reset the bucket of a client that keeps sending requests', () => {
    const middleware = createTokenBucketMiddleware(DEFAULT_OPTIONS);
    expect(countAllowed(middleware, 10)).toBe(10);

    // Stay active for two hours, spending each token as soon as it is earned,
    // while the periodic cleanup runs many times.
    for (let elapsedMs = 0; elapsedMs < 2 * 60 * 60 * 1000; elapsedMs += 3000) {
      vi.advanceTimersByTime(3000);
      expect(isAllowed(middleware)).toBe(true);
    }

    expect(isAllowed(middleware)).toBe(false);
  });

  it('does not let cleanup hand out tokens that have not been earned yet', () => {
    // A full refill takes 1000 seconds, far longer than one cleanup cycle.
    const middleware = createTokenBucketMiddleware({ capacity: 1000, refillIntervalMs: 1000 });
    expect(countAllowed(middleware, 1000)).toBe(1000);

    vi.advanceTimersByTime(11 * 60 * 1000);

    expect(countAllowed(middleware, 1000)).toBe(660);
  });

  it('keeps a separate bucket for each IP address', () => {
    const middleware = createTokenBucketMiddleware(DEFAULT_OPTIONS);
    expect(countAllowed(middleware, 11)).toBe(10);

    expect(isAllowed(middleware, '203.0.113.2')).toBe(true);
  });

  it('still rate limits requests that have no IP address', () => {
    const middleware = createTokenBucketMiddleware(DEFAULT_OPTIONS);

    for (let i = 0; i < 10; i++) {
      expect(isAllowed(middleware, undefined)).toBe(true);
    }
    expect(isAllowed(middleware, undefined)).toBe(false);
  });
});
