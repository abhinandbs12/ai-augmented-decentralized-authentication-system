import type { Pool } from 'pg';
import type { AuthRegistryClient } from '../chain/authRegistryClient';
import { insertBatch } from '../db/auditBatches';
import { leafHash, merkleRoot, type AuditEvent } from './merkleTree';

export interface MerkleBatcher {
  enqueue(event: AuditEvent): void;
  flush(): Promise<void>;
  stop(): void;
  pending(): number;
}

export interface BatcherOptions {
  pool: Pool;
  chain: AuthRegistryClient;
  batchSize: number;
  intervalMs: number;
}

// Login events are anchored in batches: one on-chain write per batch instead of
// one per login (FR-17). The batcher runs beside the login path and never
// blocks it, so a slow chain cannot slow down a login.
export function createMerkleBatcher(options: BatcherOptions): MerkleBatcher {
  const queue: AuditEvent[] = [];
  let flushing = false;

  const timer = setInterval(() => {
    void flush();
  }, options.intervalMs);
  timer.unref?.();

  async function flush(): Promise<void> {
    if (flushing || queue.length === 0) {
      return;
    }

    flushing = true;
    const events = queue.splice(0, options.batchSize);
    try {
      const leaves = events.map((event) => ({ eventId: event.eventId, leafHash: leafHash(event) }));
      const root = merkleRoot(leaves.map((leaf) => leaf.leafHash));
      const { txHash, batchId } = await options.chain.submitMerkleRoot(root);

      await insertBatch(options.pool, { batchId, merkleRoot: root, txHash, leaves });
      console.log(`Anchored audit batch ${batchId} with ${leaves.length} events`);
    } catch (error) {
      // The batch is never dropped: it goes back to the front of the queue and
      // is retried on the next flush (TRD §14.5).
      queue.unshift(...events);
      console.error(`Audit batch anchoring failed, ${queue.length} events queued: ${(error as Error).message}`);
    } finally {
      flushing = false;
    }
  }

  return {
    enqueue(event: AuditEvent): void {
      queue.push(event);
      if (queue.length >= options.batchSize) {
        void flush();
      }
    },
    flush,
    stop: () => clearInterval(timer),
    pending: () => queue.length,
  };
}
