import type { Pool } from 'pg';

// What was scored for the attempt a challenge belongs to.
export interface AttemptContext {
  trustScore: number;
  deviceFingerprint: string;
  factors: string[];
  route: 'allow' | 'otp_required';
}

export type NonceConsumption =
  | ({ status: 'consumed'; nonceId: string } & AttemptContext)
  | { status: 'unknown' }
  | { status: 'used' }
  | { status: 'expired' };

// `id` is given only when the nonce continues an attempt that already has an
// id (the code challenge on the step-up route); otherwise one is generated.
export async function insertNonce(
  pool: Pool,
  nonce: { id?: string; walletAddress: string; value: string; expiresAt: Date } & AttemptContext,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO nonces (id, wallet_address, nonce_value, trust_score, device_fingerprint, factors, route, expires_at)
     VALUES (COALESCE($1::uuid, gen_random_uuid()), lower($2), $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      nonce.id ?? null,
      nonce.walletAddress,
      nonce.value,
      nonce.trustScore,
      nonce.deviceFingerprint,
      nonce.factors,
      nonce.route,
      nonce.expiresAt,
    ],
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
  const consumed = await pool.query<{
    id: string;
    trust_score: number;
    device_fingerprint: string;
    factors: string[];
    route: AttemptContext['route'];
  }>(
    `UPDATE nonces SET used = true
     WHERE wallet_address = lower($1) AND nonce_value = $2
       AND used = false AND expires_at > now()
     RETURNING id, trust_score, device_fingerprint, factors, route`,
    [walletAddress, value],
  );

  if (consumed.rowCount === 1) {
    const row = consumed.rows[0];
    return {
      status: 'consumed',
      nonceId: row.id,
      trustScore: row.trust_score,
      deviceFingerprint: row.device_fingerprint,
      factors: row.factors,
      route: row.route,
    };
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
