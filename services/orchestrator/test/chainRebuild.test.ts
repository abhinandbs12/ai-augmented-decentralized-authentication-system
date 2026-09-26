import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChainError, type AuthRegistryClient } from '../src/chain/authRegistryClient';
import { rebuildChainState } from '../src/core/chainRebuild';

const stored = vi.hoisted(() => ({
  wallets: [] as string[],
  batches: [] as { batchId: number; merkleRoot: string }[],
}));

vi.mock('../src/db/users', () => ({ listWalletAddresses: async () => stored.wallets }));
vi.mock('../src/db/auditBatches', () => ({ listBatchRoots: async () => stored.batches }));

const pool = {} as Pool;
const ROOT = (n: number) => `0x${String(n).repeat(64)}`;

// A contract that holds `registered` wallets and `roots` in batch order.
function fakeChain(registered: string[], roots: string[]) {
  const onChain = { registered: new Set(registered), roots: [...roots] };
  const chain = {
    isRegistered: vi.fn(async (wallet: string) => onChain.registered.has(wallet)),
    registerUser: vi.fn(async (wallet: string) => {
      onChain.registered.add(wallet);
      return { txHash: '0xregister' };
    }),
    getMerkleRoot: vi.fn(async (batchId: number) => {
      if (batchId >= onChain.roots.length) {
        throw new ChainError('UNKNOWN_BATCH', 'AuthRegistry: invalid batch id');
      }
      return onChain.roots[batchId];
    }),
    submitMerkleRoot: vi.fn(async (root: string) => {
      onChain.roots.push(root);
      return { txHash: '0xanchor', batchId: onChain.roots.length - 1 };
    }),
  } as unknown as AuthRegistryClient;
  return { chain, onChain };
}

describe('rebuildChainState', () => {
  beforeEach(() => {
    stored.wallets = ['0xa1', '0xb2', '0xc3'];
    stored.batches = [
      { batchId: 0, merkleRoot: ROOT(1) },
      { batchId: 1, merkleRoot: ROOT(2) },
    ];
  });

  it('gives an emptied chain back every wallet and every root, in batch order', async () => {
    const { chain, onChain } = fakeChain([], []);

    await expect(rebuildChainState(pool, chain)).resolves.toEqual({ registered: 3, anchored: 2 });

    expect([...onChain.registered]).toEqual(['0xa1', '0xb2', '0xc3']);
    expect(onChain.roots).toEqual([ROOT(1), ROOT(2)]);
  });

  it('only reads a chain that kept its state', async () => {
    const { chain } = fakeChain(['0xa1', '0xb2', '0xc3'], [ROOT(1), ROOT(2)]);

    await expect(rebuildChainState(pool, chain)).resolves.toEqual({ registered: 0, anchored: 0 });

    expect(chain.registerUser).not.toHaveBeenCalled();
    expect(chain.submitMerkleRoot).not.toHaveBeenCalled();
  });

  it('adds only what is missing', async () => {
    const { chain, onChain } = fakeChain(['0xa1'], [ROOT(1)]);

    await expect(rebuildChainState(pool, chain)).resolves.toEqual({ registered: 2, anchored: 1 });
    expect(onChain.roots).toEqual([ROOT(1), ROOT(2)]);
  });

  // Never overwrite history: a different root under the same batch id means
  // this chain and the database disagree, and a person has to look.
  it('refuses to continue when a root on the chain differs from the stored one', async () => {
    const { chain } = fakeChain(['0xa1', '0xb2', '0xc3'], [ROOT(9)]);

    await expect(rebuildChainState(pool, chain)).rejects.toThrow(/batch 0 on the chain does not match/);
    expect(chain.submitMerkleRoot).not.toHaveBeenCalled();
  });

  it('stops when a root would land under a different batch id', async () => {
    stored.batches = [{ batchId: 3, merkleRoot: ROOT(4) }];
    const { chain } = fakeChain(['0xa1', '0xb2', '0xc3'], []);

    await expect(rebuildChainState(pool, chain)).rejects.toThrow(/anchored again as batch 0/);
  });

  it('passes an unreachable chain on to the caller', async () => {
    const { chain } = fakeChain([], []);
    vi.mocked(chain.isRegistered).mockRejectedValue(new ChainError('CHAIN_UNAVAILABLE', 'no rpc'));

    await expect(rebuildChainState(pool, chain)).rejects.toThrow('no rpc');
    expect(chain.registerUser).not.toHaveBeenCalled();
  });
});
