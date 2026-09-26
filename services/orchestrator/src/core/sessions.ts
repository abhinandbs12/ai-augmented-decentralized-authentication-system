import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { findActiveSession, insertSession, revokeSession, revokeSessionsExcept } from '../db/sessions';
import type { LRUCache } from '../ds/lruCache';
import type { CachedSession } from './loginStateMachine';

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

// Only this hash is stored, so a leaked database cannot be replayed as a login.
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Opaque 32-byte tokens rather than JWTs, because logout and the circuit
// breaker have to revoke a session on the spot (TRD §11.3).
export class SessionStore {
  constructor(
    private readonly pool: Pool,
    private readonly cache: LRUCache<string, CachedSession>,
    private readonly ttlMs: number,
  ) {}

  async issue(user: { id: string; walletAddress: string }, trustScore: number): Promise<IssuedSession> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.ttlMs);

    await insertSession(this.pool, {
      userId: user.id,
      tokenHash: hashSessionToken(token),
      trustScore,
      expiresAt,
    });
    this.cache.put(token, { walletAddress: user.walletAddress, expiresAt: expiresAt.getTime() });

    return { token, expiresAt };
  }

  // Cache hit first, then Postgres, which also repopulates the cache after a
  // restart or an eviction.
  async find(token: string): Promise<CachedSession | null> {
    const cached = this.cache.get(token);
    if (cached !== undefined) {
      if (cached.expiresAt > Date.now()) {
        return cached;
      }
      this.cache.delete(token);
    }

    const stored = await findActiveSession(this.pool, hashSessionToken(token));
    if (stored === null) {
      return null;
    }

    const session = { walletAddress: stored.walletAddress, expiresAt: stored.expiresAt.getTime() };
    this.cache.put(token, session);
    return session;
  }

  async revoke(token: string): Promise<boolean> {
    this.cache.delete(token);
    return revokeSession(this.pool, hashSessionToken(token));
  }

  // Postgres first, then the cache, so a lookup that misses the emptied cache
  // already finds the session revoked. The kept sessions reload from Postgres.
  async revokeAllExcept(walletAddresses: string[]): Promise<number> {
    const revoked = await revokeSessionsExcept(this.pool, walletAddresses);
    this.cache.clear();
    return revoked;
  }
}
