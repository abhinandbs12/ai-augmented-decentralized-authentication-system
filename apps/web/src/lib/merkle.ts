import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

// Recomputes a Merkle proof in the browser (FR-29), with the same rules as the
// orchestrator's batcher: keccak256 leaves over a fixed-order JSON event, the
// wallet in lower case, siblings folded left or right as the proof says.

export interface AuditEvent {
  eventId: string;
  wallet: string;
  ip: string;
  deviceFingerprint: string;
  trustScore: number;
  decision: string;
  timestamp: string;
}

export interface ProofStep {
  hash: string;
  position: 'left' | 'right';
}

const keccak = (bytes: Uint8Array) => `0x${bytesToHex(keccak_256(bytes))}`;
const bytes = (hash: string) => hexToBytes(hash.replace(/^0x/, ''));

export function leafHash(event: AuditEvent): string {
  return keccak(
    utf8ToBytes(
      JSON.stringify({
        eventId: event.eventId,
        wallet: event.wallet.toLowerCase(),
        ip: event.ip,
        deviceFingerprint: event.deviceFingerprint,
        trustScore: event.trustScore,
        decision: event.decision,
        timestamp: event.timestamp,
      }),
    ),
  );
}

export function rootFromProof(leaf: string, siblings: ProofStep[]): string {
  return siblings.reduce(
    (hash, step) =>
      step.position === 'right'
        ? keccak(concatBytes(bytes(hash), bytes(step.hash)))
        : keccak(concatBytes(bytes(step.hash), bytes(hash))),
    leaf,
  );
}
