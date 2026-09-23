import type { Pool } from 'pg';

export interface OtpChallenge {
  id: string;
  walletAddress: string;
  codeHash: string;
  trustScore: number;
  deviceFingerprint: string;
  attempts: number;
  verified: boolean;
  expired: boolean;
}

export async function insertOtpChallenge(
  pool: Pool,
  challenge: {
    walletAddress: string;
    codeHash: string;
    trustScore: number;
    deviceFingerprint: string;
    expiresAt: Date;
  },
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO otp_challenges (wallet_address, code_hash, trust_score, device_fingerprint, expires_at)
     VALUES (lower($1), $2, $3, $4, $5)
     RETURNING id`,
    [
      challenge.walletAddress,
      challenge.codeHash,
      challenge.trustScore,
      challenge.deviceFingerprint,
      challenge.expiresAt,
    ],
  );

  return result.rows[0].id;
}

export async function findOtpChallenge(pool: Pool, id: string): Promise<OtpChallenge | null> {
  const result = await pool.query<{
    id: string;
    wallet_address: string;
    code_hash: string;
    trust_score: number;
    device_fingerprint: string;
    attempts: number;
    verified: boolean;
    expired: boolean;
  }>(
    `SELECT id, wallet_address, code_hash, trust_score, device_fingerprint, attempts, verified,
            expires_at <= now() AS expired
     FROM otp_challenges WHERE id = $1`,
    [id],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    codeHash: row.code_hash,
    trustScore: row.trust_score,
    deviceFingerprint: row.device_fingerprint,
    attempts: row.attempts,
    verified: row.verified,
    expired: row.expired,
  };
}

export async function countFailedAttempt(pool: Pool, id: string): Promise<number> {
  const result = await pool.query<{ attempts: number }>(
    'UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts',
    [id],
  );

  return result.rows[0]?.attempts ?? 0;
}

export async function markOtpVerified(pool: Pool, id: string): Promise<boolean> {
  const result = await pool.query(
    'UPDATE otp_challenges SET verified = true WHERE id = $1 AND verified = false',
    [id],
  );

  return result.rowCount === 1;
}

// Used once the attempt limit is reached: the challenge is destroyed, so even
// the correct code cannot revive it (TRD §5.5).
export async function deleteOtpChallenge(pool: Pool, id: string): Promise<void> {
  await pool.query('DELETE FROM otp_challenges WHERE id = $1', [id]);
}
