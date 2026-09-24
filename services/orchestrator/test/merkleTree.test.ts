import { keccak256, concat, toUtf8Bytes } from 'ethers';
import { describe, expect, it } from 'vitest';
import {
  buildLevels,
  canonicalJson,
  leafHash,
  merkleProof,
  merkleRoot,
  verifyProof,
  type AuditEvent,
} from '../src/audit/merkleTree';

const EVENT: AuditEvent = {
  eventId: '0f3b2a8c-1111-4222-8333-444455556666',
  wallet: '0xA1b2C3d4E5f6a7B8c9D0e1F2a3B4c5D6e7F8a9B0',
  ip: '203.0.113.9',
  deviceFingerprint: 'a3f1'.repeat(16),
  trustScore: 96,
  decision: 'allow',
  timestamp: '2026-09-20T10:22:31.000Z',
};

function leaves(count: number): string[] {
  return Array.from({ length: count }, (_, index) => keccak256(toUtf8Bytes(`event-${index}`)));
}

describe('canonicalJson', () => {
  it('writes the fields in the agreed order', () => {
    expect(canonicalJson(EVENT)).toBe(
      '{"eventId":"0f3b2a8c-1111-4222-8333-444455556666",' +
        '"wallet":"0xa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",' +
        '"ip":"203.0.113.9","deviceFingerprint":"' +
        'a3f1'.repeat(16) +
        '","trustScore":96,"decision":"allow","timestamp":"2026-09-20T10:22:31.000Z"}',
    );
  });

  // The browser rebuilds this string to check a proof, so a wallet written in a
  // different case has to produce the same leaf.
  it('is unaffected by the letter case of the wallet address', () => {
    expect(leafHash({ ...EVENT, wallet: EVENT.wallet.toLowerCase() })).toBe(leafHash(EVENT));
  });

  it('changes when any field changes', () => {
    expect(leafHash({ ...EVENT, trustScore: 95 })).not.toBe(leafHash(EVENT));
  });
});

describe('buildLevels', () => {
  it('rejects an empty batch', () => {
    expect(() => buildLevels([])).toThrow(RangeError);
  });

  it('uses the single leaf as the root of a one-event batch', () => {
    const [leaf] = leaves(1);
    expect(merkleRoot([leaf])).toBe(leaf);
  });

  it('pairs leaves with keccak256 in order', () => {
    const [first, second] = leaves(2);
    expect(merkleRoot([first, second])).toBe(keccak256(concat([first, second])));
  });

  // Duplicating the odd node would let two different batches share a root, so
  // it is promoted unchanged instead (TRD §5.4).
  it('promotes an odd node unchanged instead of duplicating it', () => {
    const [first, second, third] = leaves(3);
    const pair = keccak256(concat([first, second]));

    expect(merkleRoot([first, second, third])).toBe(keccak256(concat([pair, third])));
    expect(merkleRoot([first, second, third])).not.toBe(
      keccak256(concat([pair, keccak256(concat([third, third]))])),
    );
  });

  it('builds four levels for a batch of sixteen', () => {
    expect(buildLevels(leaves(16)).map((level) => level.length)).toEqual([16, 8, 4, 2, 1]);
  });
});

describe('merkleProof', () => {
  it.each([1, 2, 3, 5, 8, 16, 17])('verifies every leaf of a batch of %i', (size) => {
    const batch = leaves(size);
    const root = merkleRoot(batch);

    for (const [index, leaf] of batch.entries()) {
      expect(verifyProof(leaf, merkleProof(batch, index), root)).toBe(true);
    }
  });

  it('keeps the proof logarithmic in the batch size', () => {
    expect(merkleProof(leaves(16), 0)).toHaveLength(4);
  });

  it('rejects a leaf index outside the batch', () => {
    expect(() => merkleProof(leaves(4), 4)).toThrow(RangeError);
    expect(() => merkleProof(leaves(4), -1)).toThrow(RangeError);
  });

  it('fails verification when the event was altered afterwards (TC-07)', () => {
    const batch = [leafHash(EVENT), ...leaves(3)];
    const root = merkleRoot(batch);
    const proof = merkleProof(batch, 0);

    expect(verifyProof(leafHash(EVENT), proof, root)).toBe(true);
    expect(verifyProof(leafHash({ ...EVENT, trustScore: 1 }), proof, root)).toBe(false);
  });

  it('fails verification when a sibling is swapped', () => {
    const batch = leaves(4);
    const root = merkleRoot(batch);
    const proof = merkleProof(batch, 0);
    const tamperedProof = [{ ...proof[0], hash: proof[1].hash }, proof[1]];

    expect(verifyProof(batch[0], tamperedProof, root)).toBe(false);
  });

  it('fails verification when the sibling order is flipped', () => {
    const batch = leaves(4);
    const root = merkleRoot(batch);
    const proof = merkleProof(batch, 0).map((step) => ({
      ...step,
      position: step.position === 'left' ? ('right' as const) : ('left' as const),
    }));

    expect(verifyProof(batch[0], proof, root)).toBe(false);
  });
});
