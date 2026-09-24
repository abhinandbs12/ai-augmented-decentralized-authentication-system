import type { Pool } from 'pg';

export interface UserRecord {
  id: string;
  walletAddress: string;
  displayName: string | null;
  phoneNumber: string | null;
}

interface UserRow {
  id: string;
  wallet_address: string;
  display_name: string | null;
  phone_number: string | null;
}

// Wallet addresses are compared in lower case so a checksummed and an
// unchecksummed spelling of the same wallet are one customer.
export async function insertUser(
  pool: Pool,
  user: { walletAddress: string; displayName?: string; phoneNumber?: string },
): Promise<UserRecord | null> {
  const result = await pool.query<UserRow>(
    `INSERT INTO users (wallet_address, display_name, phone_number)
     VALUES (lower($1), $2, $3)
     ON CONFLICT (wallet_address) DO NOTHING
     RETURNING id, wallet_address, display_name, phone_number`,
    [user.walletAddress, user.displayName ?? null, user.phoneNumber ?? null],
  );

  return result.rows.length === 0 ? null : toRecord(result.rows[0]);
}

export async function findUserByWallet(pool: Pool, walletAddress: string): Promise<UserRecord | null> {
  const result = await pool.query<UserRow>(
    `SELECT id, wallet_address, display_name, phone_number
     FROM users WHERE wallet_address = lower($1)`,
    [walletAddress],
  );

  return result.rows.length === 0 ? null : toRecord(result.rows[0]);
}

export async function markLoggedIn(pool: Pool, userId: string): Promise<void> {
  await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [userId]);
}

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    displayName: row.display_name,
    phoneNumber: row.phone_number,
  };
}
