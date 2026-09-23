import { Router, type RequestHandler } from 'express';
import type { Db } from 'mongodb';
import type { Pool } from 'pg';
import { leafHash, merkleProof, type AuditEvent } from '../audit/merkleTree';
import { ChainError, type AuthRegistryClient } from '../chain/authRegistryClient';
import { findBatch, findBatchLeaves, findLeafByEventId } from '../db/auditBatches';
import { sendError } from '../errors';
import { asyncRoute } from './validators';

export interface AuditDependencies {
  pool: Pool;
  authDb: Db;
  chain: AuthRegistryClient;
  requireAdmin: RequestHandler;
}

const MAX_EVENTS = 100;

export function createAuditRoutes(deps: AuditDependencies): Router {
  const router = Router();

  router.use(deps.requireAdmin);

  // The auditor picks an event here, then asks for its proof (workflow W6).
  router.get(
    '/events',
    asyncRoute(async (_req, res) => {
      const events = await deps.authDb
        .collection('login_events')
        .find({ event_id: { $ne: null } })
        .sort({ timestamp: -1 })
        .limit(MAX_EVENTS)
        .toArray();

      const anchored = await Promise.all(
        events.map(async (event) => ({
          event_id: event.event_id,
          wallet_address: event.wallet_address,
          ip_address: event.ip_address,
          device_fingerprint: event.device_fingerprint,
          trust_score: event.trust_score,
          decision: event.decision,
          factors: event.factors ?? [],
          verified: event.verified ?? false,
          timestamp: event.timestamp,
          batch_id: (await findLeafByEventId(deps.pool, event.event_id))?.batchId ?? null,
        })),
      );

      res.json(anchored);
    }),
  );

  // FR-18. The leaf is recomputed from the event as it is stored right now, so
  // an altered event no longer matches the hash that was anchored (TC-07).
  router.get(
    '/proof/:eventId',
    asyncRoute(async (req, res) => {
      const anchoredLeaf = await findLeafByEventId(deps.pool, req.params.eventId);
      if (anchoredLeaf === null) {
        sendError(res, 'NOT_FOUND');
        return;
      }

      const storedEvent = await deps.authDb
        .collection('login_events')
        .findOne({ event_id: req.params.eventId });

      const leaves = await findBatchLeaves(deps.pool, anchoredLeaf.batchId);

      res.json({
        event_id: anchoredLeaf.eventId,
        batch_id: anchoredLeaf.batchId,
        leaf_index: anchoredLeaf.leafIndex,
        leaf_hash: anchoredLeaf.leafHash,
        current_leaf_hash: storedEvent ? leafHash(toAuditEvent(storedEvent)) : null,
        // The fields exactly as they are stored now, so the browser can hash
        // them itself instead of trusting current_leaf_hash (FR-29).
        event: storedEvent ? toAuditEvent(storedEvent) : null,
        siblings: merkleProof(leaves, anchoredLeaf.leafIndex),
      });
    }),
  );

  // The root comes from the chain, not from our own database: that is the whole
  // point of anchoring it (FR-17).
  router.get(
    '/root/:batchId',
    asyncRoute(async (req, res) => {
      const batchId = Number(req.params.batchId);
      if (!Number.isInteger(batchId) || batchId < 0) {
        sendError(res, 'INVALID_REQUEST');
        return;
      }

      const batch = await findBatch(deps.pool, batchId);
      if (batch === null) {
        sendError(res, 'NOT_FOUND');
        return;
      }

      try {
        res.json({
          batch_id: batchId,
          merkle_root: await deps.chain.getMerkleRoot(batchId),
          stored_root: batch.merkleRoot,
          tx_hash: batch.txHash,
          event_count: batch.eventCount,
        });
      } catch (error) {
        sendError(res, (error as ChainError).code === 'CHAIN_UNAVAILABLE' ? 'CHAIN_UNAVAILABLE' : 'NOT_FOUND');
      }
    }),
  );

  return router;
}

// The stored document, read back in the exact shape that was hashed.
function toAuditEvent(document: Record<string, unknown>): AuditEvent {
  const timestamp = document.timestamp;

  return {
    eventId: String(document.event_id),
    wallet: String(document.wallet_address),
    ip: String(document.ip_address),
    deviceFingerprint: String(document.device_fingerprint),
    trustScore: Number(document.trust_score),
    decision: document.decision as AuditEvent['decision'],
    timestamp: timestamp instanceof Date ? timestamp.toISOString() : String(timestamp),
  };
}
