import type { Pool } from 'pg';

export type NonceConsumption =
  | { status: 'consumed'; nonceId: string; trustScore: number }
  | { status: 'unknown' }
  | { status: 'used' }
  | { status: 'expired' };

export async function insertNonce(
  pool: Pool,
  nonce: { walletAddress: string; value: string; trustScore: number; expiresAt: Date },
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO nonces (wallet_address, nonce_value, trust_score, expires_at)
     VALUES (lower($1), $2, $3, $4)
     RETURNING id`,
    [nonce.walletAddress, nonce.value, nonce.trustScore, nonce.expiresAt],
  );

  return result.rows[0].id;
}

// Marks the nonce used in a single statement, so two requests racing with the
// same nonce cannot both win: only the first UPDATE matches a row.
export async function consumeNonce(
  pool: Pool,
  walletAddress: string,
  value: string,
): Promise<NonceConsumption> {
  const consumed = await pool.query<{ id: string; trust_score: number }>(
    `UPDATE nonces SET used = true
     WHERE wallet_address = lower($1) AND nonce_value = $2
       AND used = false AND expires_at > now()
     RETURNING id, trust_score`,
    [walletAddress, value],
  );

  if (consumed.rowCount === 1) {
    const row = consumed.rows[0];
    return { status: 'consumed', nonceId: row.id, trustScore: row.trust_score };
  }

  const existing = await pool.query<{ used: boolean; expired: boolean }>(
    `SELECT used, expires_at <= now() AS expired
     FROM nonces WHERE wallet_address = lower($1) AND nonce_value = $2`,
    [walletAddress, value],
  );

  if (existing.rows.length === 0) {
    return { status: 'unknown' };
  }
  return existing.rows[0].used ? { status: 'used' } : { status: 'expired' };
}
