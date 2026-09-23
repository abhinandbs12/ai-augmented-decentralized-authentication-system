import { useState } from 'react';
import { CheckIcon, CrossIcon, LedgerIcon } from '../../components/icons';
import { Button, Notice, ScoreBadge, formatTime, shortWallet } from '../../components/ui';
import { getJson, postJson } from '../../lib/api';
import { leafHash, rootFromProof, type AuditEvent, type ProofStep } from '../../lib/merkle';
import type { LoginAttempt } from '../../lib/types';

interface AuditProps {
  attempts: LoginAttempt[] | null;
  sessionToken: string;
  onChanged: () => void;
}

interface Proof {
  event_id: string;
  batch_id: number;
  leaf_index: number;
  leaf_hash: string;
  event: AuditEvent | null;
  siblings: ProofStep[];
}

interface Verification {
  eventId: string;
  batchId: number;
  sealedLeaf: string;
  recomputedLeaf: string | null;
  siblings: number;
  computedRoot: string | null;
  chainRoot: string;
}

// FR-29: an auditor picks a sealed sign-in record, the browser hashes it and
// walks its Merkle proof, and the result is compared with the root the
// contract holds. Nothing here trusts the server's own verdict.
export default function Audit({ attempts, sessionToken, onChanged }: AuditProps) {
  const sealed = (attempts ?? []).filter((attempt) => attempt.batch_id != null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<Verification | null>(null);
  const [busy, setBusy] = useState<'verify' | 'tamper' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmTamper, setConfirmTamper] = useState(false);

  async function verify(eventId: string) {
    setBusy('verify');
    setError(null);
    try {
      const proof = await getJson<Proof>(`/api/audit/proof/${eventId}`, sessionToken);
      const { merkle_root: chainRoot } = await getJson<{ merkle_root: string }>(
        `/api/audit/root/${proof.batch_id}`,
        sessionToken,
      );
      const recomputedLeaf = proof.event ? leafHash(proof.event) : null;
      setResult({
        eventId,
        batchId: proof.batch_id,
        sealedLeaf: proof.leaf_hash,
        recomputedLeaf,
        siblings: proof.siblings.length,
        computedRoot: recomputedLeaf ? rootFromProof(recomputedLeaf, proof.siblings) : null,
        chainRoot,
      });
    } catch (verifyError) {
      setError((verifyError as Error).message);
      setResult(null);
    } finally {
      setBusy(null);
    }
  }

  async function tamper(eventId: string) {
    setBusy('tamper');
    setError(null);
    try {
      await postJson(`/api/admin/tamper/${eventId}`, {}, sessionToken);
      setConfirmTamper(false);
      onChanged();
      await verify(eventId);
    } catch (tamperError) {
      setError((tamperError as Error).message);
      setBusy(null);
    }
  }

  const selected = sealed.find((attempt) => attempt.event_id === selectedId) ?? null;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <section className="min-w-0 space-y-3">
        <p className="max-w-prose text-sm text-ink-2">
          Completed sign-ins are sealed in batches: every 16 records, or every 60 seconds, the batch's Merkle root is
          written to the contract. Any later change to a sealed record changes its hash, and the proof no longer reaches
          that root.
        </p>
        <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm sm:min-w-[34rem]">
            <thead className="border-b border-line bg-sunken text-left text-xs text-ink-3">
              <tr>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Time</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Wallet</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Stored score</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Batch</th>
                <th scope="col" className="px-4 py-2.5">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sealed.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <LedgerIcon className="mx-auto text-ink-3" />
                    <p className="mt-2 font-medium">No sealed records yet</p>
                    <p className="mt-1 text-ink-3">Complete a sign-in, and within a minute its record is sealed here.</p>
                  </td>
                </tr>
              ) : (
                sealed.map((attempt) => (
                  <tr
                    key={attempt.event_id}
                    data-selected={attempt.event_id === selectedId}
                    className="border-b border-line last:border-b-0 data-[selected=true]:bg-accent-soft"
                  >
                    <td className="tabular hidden whitespace-nowrap px-4 py-2.5 text-ink-2 sm:table-cell">{formatTime(attempt.timestamp)}</td>
                    <td className="tabular px-4 py-2.5 font-medium">{shortWallet(attempt.wallet_address)}</td>
                    <td className="px-4 py-2.5">
                      <ScoreBadge score={attempt.trust_score} />
                    </td>
                    <td className="tabular hidden px-4 py-2.5 sm:table-cell">{attempt.batch_id}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        busy={busy === 'verify' && selectedId === attempt.event_id}
                        onClick={() => {
                          setSelectedId(attempt.event_id);
                          setConfirmTamper(false);
                          void verify(attempt.event_id);
                        }}
                      >
                        Verify
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <aside aria-live="polite" className="min-w-0 space-y-4">
        {error && (
          <Notice tone="danger" title="Verification could not run">
            {error}
          </Notice>
        )}
        {!result && !error && (
          <div className="rounded-xl border border-dashed border-line-strong p-5 text-sm text-ink-3">
            Choose Verify on a sealed record. Your browser recomputes its hash and proof; the root comes from the chain.
          </div>
        )}
        {result && selected && (
          <VerificationPanel
            result={result}
            busy={busy}
            confirmTamper={confirmTamper}
            onAskTamper={() => setConfirmTamper(true)}
            onCancelTamper={() => setConfirmTamper(false)}
            onTamper={() => tamper(result.eventId)}
            onReverify={() => verify(result.eventId)}
          />
        )}
      </aside>
    </div>
  );
}

function VerificationPanel({
  result,
  busy,
  confirmTamper,
  onAskTamper,
  onCancelTamper,
  onTamper,
  onReverify,
}: {
  result: Verification;
  busy: 'verify' | 'tamper' | null;
  confirmTamper: boolean;
  onAskTamper: () => void;
  onCancelTamper: () => void;
  onTamper: () => void;
  onReverify: () => void;
}) {
  const leafMatches = result.recomputedLeaf === result.sealedLeaf;
  const authentic = result.computedRoot !== null && result.computedRoot === result.chainRoot;

  const steps = [
    {
      label: 'Record hashed in this browser',
      ok: leafMatches,
      detail: leafMatches ? 'Matches the hash that was sealed' : 'Differs from the hash that was sealed',
      hash: result.recomputedLeaf ?? 'record missing',
    },
    {
      label:
        result.siblings === 0
          ? 'Only record in its batch, so its hash is the root'
          : `Proof walked through ${result.siblings} sibling ${result.siblings === 1 ? 'hash' : 'hashes'}`,
      ok: result.computedRoot !== null,
      detail: 'Root computed from this record',
      hash: result.computedRoot ?? 'not computed',
    },
    {
      label: `Root read from the contract for batch ${result.batchId}`,
      ok: authentic,
      detail: authentic ? 'Identical to the computed root' : 'Does not match the computed root',
      hash: result.chainRoot,
    },
  ];

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <Notice
        tone={authentic ? 'success' : 'danger'}
        title={authentic ? 'Authentic and unaltered' : 'This record has been altered'}
      >
        {authentic
          ? 'The record hashes to exactly the root anchored on chain when its batch was sealed.'
          : 'The stored record no longer hashes to the root anchored on chain. It was changed after it was sealed.'}
      </Notice>

      <ol className="mt-5 space-y-4">
        {steps.map((step) => (
          <li key={step.label} className="flex gap-3 text-sm">
            <span
              className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-white ${
                step.ok ? 'bg-success' : 'bg-danger'
              }`}
            >
              {step.ok ? <CheckIcon width={12} height={12} strokeWidth={2} /> : <CrossIcon width={10} height={10} strokeWidth={2} />}
            </span>
            <span className="min-w-0">
              <span className="font-medium">{step.label}</span>
              <span className="block text-xs text-ink-3">{step.detail}</span>
              <code className="mt-1 block truncate font-mono text-xs text-ink-2" title={step.hash}>
                {step.hash}
              </code>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-5 border-t border-line pt-4">
        {confirmTamper ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-2">
              This changes the stored score of this record to 1, as a dishonest insider might. The root on chain cannot
              change. Continue?
            </p>
            <div className="flex gap-2">
              <Button variant="danger" busy={busy === 'tamper'} onClick={onTamper}>
                Alter the record
              </Button>
              <Button variant="ghost" onClick={onCancelTamper}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button busy={busy === 'verify'} onClick={onReverify}>
              Verify again
            </Button>
            {authentic && (
              <Button variant="ghost" onClick={onAskTamper}>
                Simulate tampering
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
