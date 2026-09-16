import type { NextFunction, Request, Response } from 'express';
import { tokenBucketMiddleware } from '../src/middleware/tokenBucket';

// Expected values are written out here instead of imported, so the test
// fails if the documented limits (10 requests, 1 token per 3 seconds) change.
const RATE_LIMIT_BODY = { error: 'Too many requests, please try again shortly' };

interface MockResponse {
  status: jest.Mock;
  json: jest.Mock;
}

function sendRequest(ip: string | undefined) {
  const req = { ip } as Request;
  const res: MockResponse = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  const next = jest.fn();

  tokenBucketMiddleware(req, res as unknown as Response, next as NextFunction);

  return { res, next };
}

function isAllowed(ip: string | undefined): boolean {
  const { next } = sendRequest(ip);
  return next.mock.calls.length === 1;
}

function useAllTokens(ip: string | undefined): void {
  for (let i = 0; i < 10; i++) {
    expect(isAllowed(ip)).toBe(true);
  }
}

describe('tokenBucketMiddleware', () => {
  beforeEach(() => {
    // Freeze time so a tight loop of requests earns no new tokens.
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows the first 10 requests from one IP and rejects requests 11-15 with 429', () => {
    const ip = '203.0.113.1';

    for (let i = 0; i < 10; i++) {
      const { res, next } = sendRequest(ip);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    }

    for (let i = 0; i < 5; i++) {
      const { res, next } = sendRequest(ip);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(RATE_LIMIT_BODY);
    }
  });

  it('earns one new request every 3 seconds', () => {
    const ip = '203.0.113.2';
    useAllTokens(ip);
    expect(isAllowed(ip)).toBe(false);

    jest.advanceTimersByTime(1500);
    expect(isAllowed(ip)).toBe(false);

    jest.advanceTimersByTime(1500);
    expect(isAllowed(ip)).toBe(true);
    expect(isAllowed(ip)).toBe(false);
  });

  it('never stores more than 10 tokens, even after a long idle period', () => {
    const ip = '203.0.113.3';
    useAllTokens(ip);

    // Five minutes would earn 100 tokens without the cap.
    jest.advanceTimersByTime(5 * 60 * 1000);

    let allowedCount = 0;
    for (let i = 0; i < 15; i++) {
      if (isAllowed(ip)) {
        allowedCount++;
      }
    }
    expect(allowedCount).toBe(10);
  });

  it('does not reset the bucket of a client that keeps sending requests', () => {
    const ip = '203.0.113.4';
    useAllTokens(ip);

    // Stay active for two hours, well past the idle-bucket cleanup time,
    // spending each token as soon as it is earned.
    for (let elapsedMs = 0; elapsedMs < 2 * 60 * 60 * 1000; elapsedMs += 3000) {
      jest.advanceTimersByTime(3000);
      expect(isAllowed(ip)).toBe(true);
    }

    expect(isAllowed(ip)).toBe(false);
  });

  it('keeps a separate bucket for each IP address', () => {
    useAllTokens('203.0.113.5');

    expect(isAllowed('203.0.113.5')).toBe(false);
    expect(isAllowed('203.0.113.6')).toBe(true);
  });

  it('still rate limits requests that have no IP address', () => {
    useAllTokens(undefined);

    expect(isAllowed(undefined)).toBe(false);
  });
});
