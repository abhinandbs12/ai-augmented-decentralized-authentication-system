import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CachedSession } from '../src/core/loginStateMachine';
import { SessionStore, hashSessionToken } from '../src/core/sessions';
import { LRUCache } from '../src/ds/lruCache';

const rows = vi.hoisted(() => new Map<string, { walletAddress: string; userId: string; expiresAt: Date; revoked: boolean }>());
const calls = vi.hoisted(() => ({ lookups: 0 }));

vi.mock('../src/db/sessions', () => ({
  insertSession: async (_pool: Pool, session: { userId: string; tokenHash: string; expiresAt: Date }) => {
    rows.set(session.tokenHash, {
      walletAddress: 'wallet-of-' + session.userId,
      userId: session.userId,
      expiresAt: session.expiresAt,
      revoked: false,
    });
  },
  findActiveSession: async (_pool: Pool, tokenHash: string) => {
    calls.lookups += 1;
    const row = rows.get(tokenHash);
    if (!row || row.revoked || row.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return { walletAddress: row.walletAddress, userId: row.userId, expiresAt: row.expiresAt };
  },
  revokeSession: async (_pool: Pool, tokenHash: string) => {
    const row = rows.get(tokenHash);
    if (!row || row.revoked) {
      return false;
    }
    row.revoked = true;
    return true;
  },
  revokeSessionsExcept: async (_pool: Pool, walletAddresses: string[]) => {
    const ending = [...rows.values()].filter((row) => !row.revoked && !walletAddresses.includes(row.walletAddress));
    for (const row of ending) {
      row.revoked = true;
    }
    return ending.length;
  },
}));

const pool = {} as Pool;
const USER = { id: 'user-1', walletAddress: '0xab12ab12ab12ab12ab12ab12ab12ab12ab12ab12' };

function createStore(capacity = 10, ttlMs = 30 * 60_000) {
  const cache = new LRUCache<string, CachedSession>(capacity);
  return { cache, store: new SessionStore(pool, cache, ttlMs) };
}

describe('SessionStore', () => {
  beforeEach(() => {
    rows.clear();
    calls.lookups = 0;
  });

  it('stores only the hash of the token', async () => {
    const { store } = createStore();

    const session = await store.issue(USER, 96);

    expect(session.token).toMatch(/^[0-9a-f]{64}$/);
    expect(rows.has(session.token)).toBe(false);
    expect(rows.has(createHash('sha256').update(session.token).digest('hex'))).toBe(true);
    expect(hashSessionToken(session.token)).toBe(createHash('sha256').update(session.token).digest('hex'));
  });

  it('answers from the cache without touching the database', async () => {
    const { store } = createStore();
    const session = await store.issue(USER, 96);

    await store.find(session.token);
    await store.find(session.token);

    expect(calls.lookups).toBe(0);
  });

  // The cache is bounded, so a busy service evicts sessions that are still
  // valid; Postgres stays the source of truth (TRD §11.3).
  it('falls back to the database after an eviction and repopulates the cache', async () => {
    const { cache, store } = createStore(1);
    const session = await store.issue(USER, 96);
    await store.issue({ id: 'user-2', walletAddress: '0xcd34cd34cd34cd34cd34cd34cd34cd34cd34cd34' }, 96);

    const found = await store.find(session.token);

    expect(found?.walletAddress).toBe('wallet-of-user-1');
    expect(calls.lookups).toBe(1);
    expect(cache.get(session.token)).toBeDefined();
  });

  it('refuses an unknown token', async () => {
    const { store } = createStore();

    await expect(store.find('f'.repeat(64))).resolves.toBeNull();
  });

  it('refuses a token whose session has expired, in the cache and in the database', async () => {
    const { store } = createStore(10, -1_000);
    const session = await store.issue(USER, 96);

    await expect(store.find(session.token)).resolves.toBeNull();
  });

  it('stops accepting a token the moment it is revoked', async () => {
    const { store } = createStore();
    const session = await store.issue(USER, 96);

    await expect(store.revoke(session.token)).resolves.toBe(true);

    await expect(store.find(session.token)).resolves.toBeNull();
    await expect(store.revoke(session.token)).resolves.toBe(false);
  });

  // A pause ends every session but the administrators' (TRD §11.3). The cached
  // copy must go too, or the revoked token would keep working from memory.
  it('revokes every session except the listed wallets, in the cache as well', async () => {
    const { store } = createStore();
    const customer = await store.issue(USER, 96);
    const admin = await store.issue({ id: 'admin-1', walletAddress: '0xad00ad00ad00ad00ad00ad00ad00ad00ad00ad00' }, 96);

    await expect(store.revokeAllExcept(['wallet-of-admin-1'])).resolves.toBe(1);

    await expect(store.find(customer.token)).resolves.toBeNull();
    await expect(store.find(admin.token)).resolves.toMatchObject({ walletAddress: 'wallet-of-admin-1' });
  });
});
