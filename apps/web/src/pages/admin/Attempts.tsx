/**
 * Attempts.tsx — riskiest attempts first
 *
 * The top-N riskiest recent attempts (FR-24), ranked by trust score, lowest
 * first, with members of a flagged fraud cluster marked. Phase 1 serves this
 * from a sorted database query; the live min-heap is Phase 2.
 *
 * Owner: Abhinand Baiju Smitha
 */

import { useCallback, useEffect, useState } from 'react';
import { RefreshIcon } from '../../components/icons';
import { Badge, Button, DecisionBadge, Notice, ScoreBadge, SkeletonRows, formatTime, shortWallet } from '../../components/ui';
import { getJson } from '../../lib/api';
import type { LoginAttempt } from '../../lib/types';

const SIZES = [10, 20, 50];

export default function Attempts({ sessionToken }: { sessionToken: string }) {
  const [attempts, setAttempts] = useState<LoginAttempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topN, setTopN] = useState(20);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getJson<{ attempts: LoginAttempt[] }>(`/api/admin/attempts/top?n=${topN}`, sessionToken);
      setAttempts(data.attempts);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [topN, sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          The {topN} lowest-scoring recent attempts. A cluster tag means the wallet belongs to a ring the fraud graph flagged.
        </p>
        <div className="flex items-center gap-2">
          <label htmlFor="top-n" className="text-sm text-ink-3">
            Show
          </label>
          <select
            id="top-n"
            value={topN}
            onChange={(event) => setTopN(Number(event.target.value))}
            className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm"
          >
            {SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <Button onClick={load} busy={loading} aria-label="Refresh">
            <RefreshIcon />
          </Button>
        </div>
      </div>

      {error && (
        <Notice tone="danger" title="Could not load the riskiest attempts">
          {error}
        </Notice>
      )}

      <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-b border-line bg-sunken text-left text-xs text-ink-3">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Rank</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Wallet</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Score</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Route</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Fraud cluster</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {attempts === null ? (
              <SkeletonRows cols={6} />
            ) : attempts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-ink-3">
                  No attempts recorded yet.
                </td>
              </tr>
            ) : (
              attempts.map((attempt, index) => (
                <tr key={attempt.event_id} className="border-b border-line last:border-b-0">
                  <td className="tabular px-4 py-2.5 text-ink-3">{index + 1}</td>
                  <td className="tabular px-4 py-2.5 font-medium">{shortWallet(attempt.wallet_address)}</td>
                  <td className="px-4 py-2.5">
                    <ScoreBadge score={attempt.trust_score} />
                  </td>
                  <td className="px-4 py-2.5">
                    <DecisionBadge decision={attempt.decision} />
                  </td>
                  <td className="px-4 py-2.5">
                    {attempt.cluster_id ? <Badge tone="danger">{attempt.cluster_id}</Badge> : <span className="text-ink-3">None</span>}
                  </td>
                  <td className="tabular whitespace-nowrap px-4 py-2.5 text-ink-2">{formatTime(attempt.timestamp)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
