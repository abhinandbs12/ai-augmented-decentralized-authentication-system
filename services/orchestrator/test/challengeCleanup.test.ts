import type { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLEANUP_INTERVAL_MS, removeExpiredChallenges, startChallengeCleanup } from '../src/core/challengeCleanup';
import { deleteExpiredRows } from '../src/db/challengeCleanup';

// Answers each DELETE with the next row count in the list, then 0.
function fakePool(rowCounts: number[]) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const pool = {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      return { rowCount: rowCounts.shift() ?? 0 };
    }),
  } as unknown as Pool;
  return { pool, queries };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('deleteExpiredRows', () => {
  it('deletes rows expired longer than the retention, a batch at a time until a short batch', async () => {
    const { pool, queries } = fakePool([1000, 1000, 3]);

    const deleted = await deleteExpiredRows(pool, 'otp_challenges', 3600, 1000);

    expect(deleted).toBe(2003);
    expect(queries).toHaveLength(3);
    expect(queries[0].sql).toMatch(/DELETE FROM otp_challenges WHERE id IN \(\s*SELECT id FROM otp_challenges WHERE expires_at < now\(\) - make_interval\(secs => \$1\) LIMIT \$2/);
    expect(queries[0].params).toEqual([3600, 1000]);
  });
});

describe('removeExpiredChallenges', () => {
  it('cleans both code challenges and nonces, keeping an hour past expiry', async () => {
    const { pool, queries } = fakePool([2, 5]);

    await expect(removeExpiredChallenges(pool)).resolves.toEqual({ codes: 2, nonces: 5 });
    expect(queries.map((query) => query.sql.match(/DELETE FROM (\w+)/)?.[1])).toEqual(['otp_challenges', 'nonces']);
    expect(queries.every((query) => query.params[0] === 3600)).toBe(true);
  });
});

describe('startChallengeCleanup', () => {
  it('runs at start-up and then every ten minutes, and reports only what it removed', async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { pool, queries } = fakePool([1, 0, 0, 0]);

    const stop = startChallengeCleanup(pool);
    await vi.advanceTimersByTimeAsync(0);
    expect(queries).toHaveLength(2);
    expect(log).toHaveBeenCalledWith('Removed 1 expired code challenges and 0 expired nonces');

    await vi.advanceTimersByTimeAsync(CLEANUP_INTERVAL_MS);
    expect(queries).toHaveLength(4);
    expect(log).toHaveBeenCalledTimes(1);

    stop();
    await vi.advanceTimersByTimeAsync(CLEANUP_INTERVAL_MS);
    expect(queries).toHaveLength(4);
  });

  it('logs a failure and tries again next time instead of stopping the service', async () => {
    vi.useFakeTimers();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const pool = {
      query: vi.fn().mockRejectedValueOnce(new Error('connection refused')).mockResolvedValue({ rowCount: 0 }),
    } as unknown as Pool;

    const stop = startChallengeCleanup(pool);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(CLEANUP_INTERVAL_MS);
    stop();

    expect(error).toHaveBeenCalledWith('Expired challenge cleanup failed: connection refused');
    expect(vi.mocked(pool.query).mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
