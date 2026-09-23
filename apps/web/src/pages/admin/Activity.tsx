import { useMemo, useState } from 'react';
import { CheckIcon, CrossIcon } from '../../components/icons';
import { Button, DecisionBadge, ScoreBadge, SkeletonRows, formatTime, shortWallet } from '../../components/ui';
import { describeFactor } from '../../lib/factors';
import type { Decision, LoginAttempt } from '../../lib/types';
import Attempts from './Attempts';

interface ActivityProps {
  attempts: LoginAttempt[] | null;
  sessionToken: string;
}

// Every attempt as it happens: what the risk engine saw, which route the score
// chose, whether the signature was verified, and whether the record is sealed.
export default function Activity({ attempts, sessionToken }: ActivityProps) {
  const [view, setView] = useState<'latest' | 'riskiest'>('latest');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = attempts?.find((attempt) => attempt.event_id === selectedId) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-prose text-sm text-ink-2">
          Every attempt is scored before any challenge exists. The score alone picks the route: 90 and above
          goes to the wallet signature, 50 to 89 needs an SMS code first, below 50 is blocked. Select a wallet to
          see how its score was reached and how far the attempt got.
        </p>
        <div role="group" aria-label="Order" className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5">
          {(['latest', 'riskiest'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => setView(option)}
              className={`h-8 rounded-md px-3 text-sm font-medium transition-colors duration-150 ${
                view === option ? 'bg-sunken text-ink' : 'text-ink-3 hover:text-ink'
              }`}
            >
              {option === 'latest' ? 'Latest' : 'Riskiest first'}
            </button>
          ))}
        </div>
      </div>

      {view === 'riskiest' ? (
        <Attempts sessionToken={sessionToken} />
      ) : (
        <>
          <RoutingSummary attempts={attempts} />
          <div className={`grid gap-5 ${selected ? 'xl:grid-cols-[minmax(0,1fr)_22rem]' : ''}`}>
            <AttemptTable attempts={attempts} selectedId={selectedId} onSelect={setSelectedId} compact={Boolean(selected)} />
            {selected && <AttemptDetail attempt={selected} onClose={() => setSelectedId(null)} />}
          </div>
        </>
      )}
    </div>
  );
}

const ROUTES: { decision: Decision; label: string; bar: string }[] = [
  { decision: 'allow', label: 'Straight to signature', bar: 'bg-success' },
  { decision: 'otp_required', label: 'SMS code first', bar: 'bg-warning' },
  { decision: 'blocked', label: 'Blocked', bar: 'bg-danger' },
];

function RoutingSummary({ attempts }: { attempts: LoginAttempt[] | null }) {
  const counts = useMemo(() => {
    const tally = { allow: 0, otp_required: 0, blocked: 0 };
    attempts?.forEach((attempt) => (tally[attempt.decision] += 1));
    return tally;
  }, [attempts]);
  const total = attempts?.length ?? 0;
  const completed = attempts?.filter((attempt) => attempt.verified).length ?? 0;

  return (
    <section aria-label="How recent attempts were routed" className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">Routing of the last {total} attempts</h2>
        <p className="tabular text-xs text-ink-3">
          {completed} completed sign-in{completed === 1 ? '' : 's'}
        </p>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-sunken">
        {total > 0 &&
          ROUTES.map((route) => (
            <span
              key={route.decision}
              className={`${route.bar} transition-[flex-grow] duration-300 ease-(--ease-out)`}
              style={{ flexGrow: counts[route.decision] }}
            />
          ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {ROUTES.map((route) => (
          <li key={route.decision} className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${route.bar}`} />
            <span className="text-ink-2">{route.label}</span>
            <span className="tabular font-medium">{counts[route.decision]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AttemptTable({
  attempts,
  selectedId,
  onSelect,
  compact,
}: {
  attempts: LoginAttempt[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  // While an attempt is open beside the table, its reasons live in the detail
  // panel, so the table drops that column instead of scrolling sideways.
  compact: boolean;
}) {
  const columns = compact ? 5 : 6;
  return (
    <div className="relative min-w-0 self-start overflow-x-auto rounded-xl border border-line bg-surface">
      <table className={`w-full text-sm ${compact ? 'min-w-[32rem]' : 'min-w-[52rem]'}`}>
        <thead className="border-b border-line bg-sunken text-left text-xs font-medium text-ink-3">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">Time</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Wallet</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Score</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Route</th>
            {!compact && <th scope="col" className="px-4 py-2.5 font-medium">Why</th>}
            <th scope="col" className="px-4 py-2.5 font-medium">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {attempts === null ? (
            <SkeletonRows cols={columns} />
          ) : attempts.length === 0 ? (
            <tr>
              <td colSpan={columns} className="px-4 py-12 text-center">
                <p className="font-medium">No sign-in attempts yet</p>
                <p className="mt-1 text-ink-3">Sign in from the customer screen, or run npm run seed, and attempts appear here live.</p>
              </td>
            </tr>
          ) : (
            attempts.map((attempt) => (
              <tr
                key={attempt.event_id}
                onClick={() => onSelect(attempt.event_id)}
                aria-selected={attempt.event_id === selectedId}
                className="cursor-pointer border-b border-line transition-[opacity,translate,background-color] duration-200 ease-(--ease-out) last:border-b-0 hover:bg-canvas aria-selected:bg-accent-soft starting:-translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0"
              >
                <td className="tabular whitespace-nowrap px-4 py-2.5 text-ink-2">{formatTime(attempt.timestamp)}</td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  <button
                    type="button"
                    aria-label={`Details for ${attempt.wallet_address}`}
                    className="tabular font-medium text-ink underline-offset-4 hover:underline"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(attempt.event_id);
                    }}
                  >
                    {shortWallet(attempt.wallet_address)}
                  </button>
                </td>
                <td className="px-4 py-2.5">
                  <ScoreBadge score={attempt.trust_score} />
                </td>
                <td className="px-4 py-2.5">
                  <DecisionBadge decision={attempt.decision} />
                </td>
                {!compact && (
                  <td className="min-w-80 px-4 py-2.5 text-ink-2">
                    <FactorList factors={attempt.factors ?? []} />
                  </td>
                )}
                <td className="whitespace-nowrap px-4 py-2.5">
                  <Outcome attempt={attempt} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function FactorList({ factors }: { factors: string[] }) {
  if (factors.length === 0) return <span className="text-ink-3">Nothing unusual</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {factors.map((factor) => {
        const { analyst, penalty } = describeFactor(factor);
        return (
          <span key={factor} className="whitespace-nowrap rounded border border-line px-1.5 py-px text-xs">
            {analyst} <span className="tabular text-danger">−{penalty}</span>
          </span>
        );
      })}
    </span>
  );
}

function Outcome({ attempt }: { attempt: LoginAttempt }) {
  if (attempt.decision === 'blocked') return <span className="text-ink-3">No challenge issued</span>;
  if (!attempt.verified) return <span className="text-ink-3">Not completed</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-success">
      <CheckIcon />
      Signed in{attempt.batch_id != null && <span className="text-ink-3">· batch {attempt.batch_id}</span>}
    </span>
  );
}

// What happened behind the scenes for one attempt, station by station.
function AttemptDetail({ attempt, onClose }: { attempt: LoginAttempt; onClose: () => void }) {
  const factors = attempt.factors ?? [];
  const penalties = factors.map((factor) => describeFactor(factor));
  const arithmetic = Math.max(0, 100 - penalties.reduce((sum, factor) => sum + factor.penalty, 0));
  const scoreExplained = arithmetic === attempt.trust_score;
  const challenge =
    attempt.decision === 'blocked' ? 'None: blocked before any challenge' : attempt.decision === 'otp_required' ? 'SMS code, then wallet signature' : 'Wallet signature';

  const stations = [
    { label: 'Scored by the risk engine', done: true, detail: `${attempt.trust_score} / 100` },
    { label: 'Challenge issued', done: attempt.decision !== 'blocked', detail: challenge },
    { label: 'Signature verified on chain', done: Boolean(attempt.verified), detail: attempt.verified ? 'AuthRegistry.verifySignature' : 'Not reached' },
    {
      label: 'Sealed in the audit trail',
      done: attempt.batch_id != null,
      detail:
        attempt.batch_id != null
          ? `Merkle batch ${attempt.batch_id}`
          : attempt.verified
            ? 'Waiting for the next batch (16 events or 60 s)'
            : 'Only completed sign-ins are sealed',
    },
  ];

  return (
    <aside aria-label="Attempt details" className="rounded-xl border border-line bg-surface p-5 text-sm xl:sticky xl:top-4 xl:self-start">
      <div className="flex items-start justify-between gap-3">
        <p className="tabular break-all font-mono text-xs font-medium">{attempt.wallet_address}</p>
        <Button variant="ghost" className="-mt-1.5 -mr-2 shrink-0" onClick={onClose} aria-label="Close details">
          <CrossIcon />
        </Button>
      </div>
      <p className="tabular mt-0.5 text-xs text-ink-3">{new Date(attempt.timestamp).toLocaleString()}</p>

      <h3 className="mt-5 text-xs font-medium text-ink-3">How the score was reached</h3>
      <div className="tabular mt-2 space-y-1">
        <div className="flex justify-between">
          <span className="text-ink-2">Starting score</span>
          <span>100</span>
        </div>
        {penalties.map((factor) => (
          <div key={factor.analyst} className="flex justify-between">
            <span className="text-ink-2">{factor.analyst}</span>
            <span className="text-danger">−{factor.penalty}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-line pt-1 font-medium">
          <span>Trust score</span>
          <span>{attempt.trust_score}</span>
        </div>
      </div>
      {!scoreExplained && (
        <p className="mt-2 text-xs text-ink-3">
          {factors.length === 0 && attempt.trust_score === 70
            ? 'No factors: the risk engine was unreachable, so the attempt was routed to an SMS code (never allowed).'
            : 'Score as returned by the risk engine.'}
        </p>
      )}

      <h3 className="mt-5 text-xs font-medium text-ink-3">How far it got</h3>
      <ol className="mt-2 space-y-3">
        {stations.map((station) => (
          <li key={station.label} className="flex gap-3">
            <span
              className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${
                station.done ? 'bg-success text-white' : 'border border-dashed border-line-strong'
              }`}
            >
              {station.done && <CheckIcon width={12} height={12} strokeWidth={2} />}
            </span>
            <span>
              <span className={station.done ? 'font-medium' : 'text-ink-3'}>{station.label}</span>
              <span className="block text-xs text-ink-3">{station.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      <dl className="mt-5 space-y-1 border-t border-line pt-3 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-3">IP address</dt>
          <dd className="tabular">{attempt.ip_address ?? 'unknown'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-3">Device</dt>
          <dd className="tabular">{attempt.device_fingerprint?.slice(0, 16) ?? 'unknown'}…</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-3">Event</dt>
          <dd className="tabular">{attempt.event_id.slice(0, 13)}…</dd>
        </div>
      </dl>
    </aside>
  );
}
