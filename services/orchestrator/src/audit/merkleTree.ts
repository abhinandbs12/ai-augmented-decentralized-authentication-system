import { concat, keccak256, toUtf8Bytes } from 'ethers';

export interface AuditEvent {
  eventId: string;
  wallet: string;
  ip: string;
  deviceFingerprint: string;
  trustScore: number;
  decision: 'allow' | 'otp_required' | 'blocked';
  timestamp: string;
}

export interface ProofStep {
  hash: string;
  position: 'left' | 'right';
}

// The field order is fixed and the wallet is lower-cased, because the browser
// has to rebuild exactly this string months later to check a proof (TRD §5.4).
export function canonicalJson(event: AuditEvent): string {
  return JSON.stringify({
    eventId: event.eventId,
    wallet: event.wallet.toLowerCase(),
    ip: event.ip,
    deviceFingerprint: event.deviceFingerprint,
    trustScore: event.trustScore,
    decision: event.decision,
    timestamp: event.timestamp,
  });
}

export function leafHash(event: AuditEvent): string {
  return keccak256(toUtf8Bytes(canonicalJson(event)));
}

// Levels from the leaves upwards; the last level holds the single root.
// An odd node is promoted unchanged rather than paired with itself: duplicating
// it would let two different batches produce the same root.
export function buildLevels(leaves: string[]): string[][] {
  if (leaves.length === 0) {
    throw new RangeError('A Merkle tree needs at least one leaf');
  }

  const levels = [leaves];
  let level = leaves;

  while (level.length > 1) {
    const parents: string[] = [];
    for (let index = 0; index < level.length; index += 2) {
      parents.push(
        index + 1 < level.length ? keccak256(concat([level[index], level[index + 1]])) : level[index],
      );
    }
    levels.push(parents);
    level = parents;
  }

  return levels;
}

export function merkleRoot(leaves: string[]): string {
  const levels = buildLevels(leaves);
  return levels[levels.length - 1][0];
}

// The sibling hashes on the path from one leaf to the root: O(log n) of them.
export function merkleProof(leaves: string[], leafIndex: number): ProofStep[] {
  if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= leaves.length) {
    throw new RangeError(`No leaf at index ${leafIndex}`);
  }

  const levels = buildLevels(leaves);
  const proof: ProofStep[] = [];
  let index = leafIndex;

  for (const level of levels.slice(0, -1)) {
    const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
    if (siblingIndex < level.length) {
      proof.push({
        hash: level[siblingIndex],
        position: index % 2 === 0 ? 'right' : 'left',
      });
    }
    index = Math.floor(index / 2);
  }

  return proof;
}

// Recomputes the root from one leaf and its siblings. Any change to the stored
// event changes its leaf hash and therefore the root, which is what makes
// tampering detectable.
export function verifyProof(leaf: string, proof: ProofStep[], expectedRoot: string): boolean {
  const computedRoot = proof.reduce(
    (hash, step) =>
      step.position === 'right' ? keccak256(concat([hash, step.hash])) : keccak256(concat([step.hash, hash])),
    leaf,
  );

  return computedRoot === expectedRoot;
}
