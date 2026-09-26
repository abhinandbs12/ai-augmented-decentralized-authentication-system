import type { Pool } from 'pg';
import { ChainError, type AuthRegistryClient } from '../chain/authRegistryClient';
import { listBatchRoots } from '../db/auditBatches';
import { listWalletAddresses } from '../db/users';

// The Phase 1 chain is a local Hardhat node and lives in memory (PRD L1).
// Restarting it, Docker or the computer brings back an empty contract while
// PostgreSQL keeps the customers and the anchored Merkle roots: customers would
// be told they are not registered and the audit trail could not be verified.
// At start-up the contract is given back what PostgreSQL knows: every
// registered wallet, then every root in batch order. On a chain that kept its
// state this only reads. A persistent network never needs the writes.
// ponytail: one view call per customer at start-up; check only the newest
// customer first if the table ever grows to thousands.
export async function rebuildChainState(
  pool: Pool,
  chain: AuthRegistryClient,
): Promise<{ registered: number; anchored: number }> {
  let registered = 0;
  for (const wallet of await listWalletAddresses(pool)) {
    if (!(await chain.isRegistered(wallet))) {
      await chain.registerUser(wallet);
      registered += 1;
    }
  }

  let anchored = 0;
  for (const batch of await listBatchRoots(pool)) {
    const onChain = await rootOnChain(chain, batch.batchId);
    if (onChain === null) {
      // The contract numbers roots itself, so they must go back in order.
      const { batchId } = await chain.submitMerkleRoot(batch.merkleRoot);
      if (batchId !== batch.batchId) {
        throw new Error(`batch ${batch.batchId} was anchored again as batch ${batchId}`);
      }
      anchored += 1;
    } else if (onChain.toLowerCase() !== batch.merkleRoot.toLowerCase()) {
      throw new Error(`batch ${batch.batchId} on the chain does not match the root PostgreSQL recorded`);
    }
  }

  return { registered, anchored };
}

async function rootOnChain(chain: AuthRegistryClient, batchId: number): Promise<string | null> {
  try {
    return await chain.getMerkleRoot(batchId);
  } catch (error) {
    if ((error as ChainError).code === 'UNKNOWN_BATCH') {
      return null;
    }
    throw error;
  }
}
