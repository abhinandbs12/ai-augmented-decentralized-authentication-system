import { useState } from 'react';
import { PowerIcon } from '../../components/icons';
import { Badge, Button, Notice } from '../../components/ui';
import { postJson } from '../../lib/api';
import type { SystemStatus } from '../../lib/types';

interface ControlProps {
  status: SystemStatus | null;
  sessionToken: string;
  onChanged: () => void;
}

// The circuit breaker (FR-19). Pausing is a transaction on the contract, so it
// stops every sign-in at verification, whatever its score. Phase 1 keeps this a
// plain working panel; the polished control room is Phase 2.
export default function Control({ status, sessionToken, onChanged }: ControlProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);

  async function run(action: 'pause' | 'resume') {
    setBusy(true);
    setError(null);
    try {
      const result = await postJson<{ tx_hash: string }>(`/api/admin/${action}`, {}, sessionToken);
      setLastTx(result.tx_hash);
      setConfirming(false);
      onChanged();
    } catch (actionError) {
      setError((actionError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return <div className="h-48 animate-pulse rounded-xl bg-sunken motion-reduce:animate-none" />;
  }

  const { anomalous_in_window: count, threshold, window_ms: windowMs } = status.breaker;
  const fill = Math.min(100, (count / (threshold + 1)) * 100);

  return (
    <div className="grid max-w-4xl gap-5 lg:grid-cols-2">
      <section className="rounded-xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Authentication</h2>
          <Badge tone={status.paused ? 'incident' : 'success'}>{status.paused ? 'Paused' : 'Running'}</Badge>
        </div>
        <p className="mt-3 text-sm text-ink-2">
          {status.paused
            ? 'Every sign-in is refused at the contract until you resume. Scoring still runs, so attempts keep appearing in the activity list.'
            : 'Sign-ins are routed by their trust score. Pausing stops all of them at the contract, whatever the score.'}
        </p>

        <div className="mt-5">
          {status.paused ? (
            <Button variant="primary" busy={busy} onClick={() => run('resume')}>
              <PowerIcon />
              Resume authentication
            </Button>
          ) : confirming ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">Pause every sign-in for all customers?</p>
              <div className="flex gap-2">
                <Button variant="danger" busy={busy} onClick={() => run('pause')}>
                  Pause now
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setConfirming(true)}>
              <PowerIcon />
              Pause authentication
            </Button>
          )}
        </div>

        {lastTx && (
          <p className="mt-4 truncate text-xs text-ink-3" title={lastTx}>
            Contract transaction <code className="font-mono">{lastTx}</code>
          </p>
        )}
        {error && (
          <div className="mt-4">
            <Notice tone="danger" title="The contract did not accept the change">
              {error}
            </Notice>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-sm font-medium">Automatic circuit breaker</h2>
        <p className="mt-3 text-sm text-ink-2">
          When more than {threshold} attempts score below 50 within {windowMs / 1000} seconds, the orchestrator pauses
          authentication on the contract by itself, and an administrator has to resume it.
        </p>
        <div className="mt-5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ink-2">Blocked attempts in the last {windowMs / 1000} s</span>
            <span className="tabular font-medium">
              {count} <span className="font-normal text-ink-3">/ {threshold + 1} to trip</span>
            </span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-sunken"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={threshold + 1}
            aria-valuenow={count}
            aria-label="Blocked attempts toward the breaker threshold"
          >
            <span
              className={`block h-full rounded-full transition-[width] duration-300 ease-(--ease-out) ${
                fill >= 100 ? 'bg-incident' : fill >= 60 ? 'bg-warning' : 'bg-accent'
              }`}
              style={{ width: `${fill}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-ink-3">Run npm run s5 to simulate a credential-stuffing attack and trip it.</p>
        </div>
      </section>
    </div>
  );
}
