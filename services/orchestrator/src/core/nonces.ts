import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { consumeNonce, insertNonce, type NonceConsumption } from '../db/nonces';
import type { IssuedNonce } from './loginStateMachine';

// 32 random bytes, hex encoded, valid for five minutes (TRD §11.2): long enough
// to read a wallet prompt, short enough to keep the replay window small.
export class NonceService {
  constructor(
    private readonly pool: Pool,
    private readonly ttlMs: number,
  ) {}

  async issue(walletAddress: string, trustScore: number, deviceFingerprint: string): Promise<IssuedNonce> {
    const nonce = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.ttlMs);
    const challengeId = await insertNonce(this.pool, {
      walletAddress,
      value: nonce,
      trustScore,
      deviceFingerprint,
      expiresAt,
    });

    return { challengeId, nonce, expiresAt };
  }

  // Postgres is the first enforcement point for single use; the contract is the
  // second, and neither one trusts the other.
  async consume(walletAddress: string, nonce: string): Promise<NonceConsumption> {
    return consumeNonce(this.pool, walletAddress, nonce);
  }
}
