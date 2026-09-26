import type { Pool } from 'pg';

export type ExpiringTable = 'otp_challenges' | 'nonces';

// Deletes rows that expired more than `retentionSeconds` ago, a batch at a
// time, so a large backlog never holds one long lock. The table name is one of
// two constants, never input.
export async function deleteExpiredRows(
  pool: Pool,
  table: ExpiringTable,
  retentionSeconds: number,
  batchSize: number,
): Promise<number> {
  let deleted = 0;
  for (;;) {
    const result = await pool.query(
      `DELETE FROM ${table} WHERE id IN (
         SELECT id FROM ${table} WHERE expires_at < now() - make_interval(secs => $1) LIMIT $2
       )`,
      [retentionSeconds, batchSize],
    );
    const count = result.rowCount ?? 0;
    deleted += count;
    if (count < batchSize) {
      return deleted;
    }
  }
}
