import type { Pool } from 'pg';

export interface StoredSession {
  walletAddress: string;
  userId: string;
  expiresAt: Date;
}

export async function insertSession(
  pool: Pool,
  session: { userId: string; tokenHash: string; trustScore: number; expiresAt: Date },
): Promise<void> {
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, trust_score, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [session.userId, session.tokenHash, session.trustScore, session.expiresAt],
  );
}

// The cache misses on a restart or an eviction, so Postgres stays the source of
// truth for which sessions are still valid (TRD §11.3).
export async function findActiveSession(pool: Pool, tokenHash: string): Promise<StoredSession | null> {
  const result = await pool.query<{ wallet_address: string; user_id: string; expires_at: Date }>(
    `SELECT u.wallet_address, s.user_id, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [tokenHash],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return { walletAddress: row.wallet_address, userId: row.user_id, expiresAt: row.expires_at };
}

export async function revokeSession(pool: Pool, tokenHash: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE sessions SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash],
  );

  return result.rowCount === 1;
}

// Pausing authentication ends every session except the administrators', who
// must stay signed in to resume it (TRD §11.3, §12.3). Wallets are stored and
// configured in lower case.
export async function revokeSessionsExcept(pool: Pool, walletAddresses: string[]): Promise<number> {
  const result = await pool.query(
    `UPDATE sessions s SET revoked_at = now()
     FROM users u
     WHERE u.id = s.user_id AND s.revoked_at IS NULL AND u.wallet_address <> ALL($1::text[])`,
    [walletAddresses],
  );

  return result.rowCount ?? 0;
}
