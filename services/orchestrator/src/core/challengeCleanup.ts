import type { Pool } from 'pg';
import { deleteExpiredRows } from '../db/challengeCleanup';

// Maintenance, not security: an expired code or nonce is already refused,
// because every check compares expires_at with now(). This only reclaims the
// rows. A code challenge whose code expired can still be sent a new one, so
// rows are kept for an hour past their expiry.
export const CLEANUP_INTERVAL_MS = 10 * 60_000;
export const RETENTION_SECONDS = 60 * 60;
const BATCH_SIZE = 1000;

export async function removeExpiredChallenges(pool: Pool): Promise<{ codes: number; nonces: number }> {
  return {
    codes: await deleteExpiredRows(pool, 'otp_challenges', RETENTION_SECONDS, BATCH_SIZE),
    nonces: await deleteExpiredRows(pool, 'nonces', RETENTION_SECONDS, BATCH_SIZE),
  };
}

// Runs once at start-up, then every ten minutes. A failure (the database is
// down) is logged and simply tried again next time. Returns a stop function.
export function startChallengeCleanup(pool: Pool, intervalMs = CLEANUP_INTERVAL_MS): () => void {
  const run = async (): Promise<void> => {
    try {
      const removed = await removeExpiredChallenges(pool);
      if (removed.codes + removed.nonces > 0) {
        console.log(`Removed ${removed.codes} expired code challenges and ${removed.nonces} expired nonces`);
      }
    } catch (error) {
      console.error(`Expired challenge cleanup failed: ${(error as Error).message}`);
    }
  };

  void run();
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
