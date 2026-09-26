import type { Pool } from 'pg';

export interface AnchoredLeaf {
  batchId: number;
  leafIndex: number;
  eventId: string;
  leafHash: string;
}

export interface AnchoredBatch {
  batchId: number;
  merkleRoot: string;
  txHash: string | null;
  eventCount: number;
}

export async function insertBatch(
  pool: Pool,
  batch: {
    batchId: number;
    merkleRoot: string;
    txHash: string | null;
    leaves: { eventId: string; leafHash: string }[];
  },
): Promise<number> {
  const batchId = batch.batchId;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO audit_batches (batch_id, merkle_root, tx_hash, event_count)
       VALUES ($1, $2, $3, $4)`,
      [batchId, batch.merkleRoot, batch.txHash, batch.leaves.length],
    );

    for (const [leafIndex, leaf] of batch.leaves.entries()) {
      await client.query(
        `INSERT INTO audit_leaves (batch_id, leaf_index, event_id, leaf_hash)
         VALUES ($1, $2, $3, $4)`,
        [batchId, leafIndex, leaf.eventId, leaf.leafHash],
      );
    }

    await client.query('COMMIT');
    return batchId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function findLeafByEventId(pool: Pool, eventId: string): Promise<AnchoredLeaf | null> {
  const result = await pool.query<{
    batch_id: string;
    leaf_index: number;
    event_id: string;
    leaf_hash: string;
  }>(
    `SELECT batch_id, leaf_index, event_id, leaf_hash FROM audit_leaves WHERE event_id = $1`,
    [eventId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    batchId: Number(row.batch_id),
    leafIndex: row.leaf_index,
    eventId: row.event_id,
    leafHash: row.leaf_hash,
  };
}

export async function findBatchLeaves(pool: Pool, batchId: number): Promise<string[]> {
  const result = await pool.query<{ leaf_hash: string }>(
    'SELECT leaf_hash FROM audit_leaves WHERE batch_id = $1 ORDER BY leaf_index',
    [batchId],
  );

  return result.rows.map((row) => row.leaf_hash);
}

export async function listBatchRoots(pool: Pool): Promise<{ batchId: number; merkleRoot: string }[]> {
  const result = await pool.query<{ batch_id: string; merkle_root: string }>(
    'SELECT batch_id, merkle_root FROM audit_batches ORDER BY batch_id',
  );
  return result.rows.map((row) => ({ batchId: Number(row.batch_id), merkleRoot: row.merkle_root }));
}

export async function findBatch(pool: Pool, batchId: number): Promise<AnchoredBatch | null> {
  const result = await pool.query<{
    batch_id: string;
    merkle_root: string;
    tx_hash: string | null;
    event_count: number;
  }>(
    'SELECT batch_id, merkle_root, tx_hash, event_count FROM audit_batches WHERE batch_id = $1',
    [batchId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    batchId: Number(row.batch_id),
    merkleRoot: row.merkle_root,
    txHash: row.tx_hash,
    eventCount: row.event_count,
  };
}
