import { useCallback, useEffect, useState, type ComponentType, type SVGProps } from 'react';
import { ActivityIcon, LedgerIcon, LogOutIcon, PowerIcon, ShieldIcon } from '../../components/icons';
import { Badge, Button, Notice, shortWallet } from '../../components/ui';
import { ApiError, getJson } from '../../lib/api';
import type { Session } from '../../lib/session';
import type { LoginAttempt, SystemStatus } from '../../lib/types';
import { useLiveEvents, type LiveState } from '../../lib/useLiveEvents';
import Activity from './Activity';
import Audit from './Audit';
import Control from './Control';

type Section = 'activity' | 'audit' | 'controls';

const SECTIONS: { id: Section; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { id: 'activity', label: 'Sign-in activity', icon: ActivityIcon },
  { id: 'audit', label: 'Audit trail', icon: LedgerIcon },
  { id: 'controls', label: 'Controls', icon: PowerIcon },
];

const POLL_STATUS_MS = 3000;
const POLL_EVENTS_MS = 15000;

interface ConsoleProps {
  session: Session;
  onExit: () => void;
  onSignOut: () => void;
}

// The operations console for fraud analysts and auditors. Everything on it
// comes from the running system: the orchestrator's admin APIs and its live
// event stream.
export default function Console({ session, onExit, onSignOut }: ConsoleProps) {
  const [section, setSection] = useState<Section>('activity');
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [attempts, setAttempts] = useState<LoginAttempt[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await getJson<SystemStatus>('/api/admin/status', session.token));
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) setForbidden(true);
    }
  }, [session.token]);

  const refreshAttempts = useCallback(async () => {
    try {
      setAttempts(await getJson<LoginAttempt[]>('/api/audit/events', session.token));
      setLoadError(null);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) setForbidden(true);
      else setLoadError((error as Error).message);
    }
  }, [session.token]);

  useEffect(() => {
    void refreshStatus();
    void refreshAttempts();
    const statusTimer = setInterval(refreshStatus, POLL_STATUS_MS);
    // Sealing into a batch is not an event on the stream, so the list refreshes now and then.
    const eventsTimer = setInterval(refreshAttempts, POLL_EVENTS_MS);
    return () => {
      clearInterval(statusTimer);
      clearInterval(eventsTimer);
    };
  }, [refreshStatus, refreshAttempts]);

  const live = useLiveEvents(session.token, {
    onAttempt(attempt) {
      // The verified report reuses the attempt's id, so replace rather than duplicate.
      setAttempts((current) => [attempt, ...(current ?? []).filter((item) => item.event_id !== attempt.event_id)]);
    },
    onSystem() {
      void refreshStatus();
    },
  });

  if (forbidden) {
    return (
      <div className="mx-auto mt-24 max-w-md px-4">
        <Notice tone="danger" title="This console is for administrator wallets">
          Wallet {shortWallet(session.wallet)} is signed in but is not on the administrator list.
        </Notice>
        <Button className="mt-4" onClick={onExit}>
          Back to your account
        </Button>
      </div>
    );
  }

  const current = SECTIONS.find((item) => item.id === section)!;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:border-r md:border-b-0">
        <div className="flex h-14 items-center gap-2 px-4 font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-accent text-white">
            <ShieldIcon />
          </span>
          <span>
            Demo Bank <span className="font-normal text-ink-3">Operations</span>
          </span>
        </div>
        <nav aria-label="Console sections" className="flex gap-1 overflow-x-auto px-3 pb-3 [scrollbar-width:none] md:flex-col md:pb-0">
          {SECTIONS.map((item) => {
            const active = item.id === section;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => setSection(item.id)}
                className={`flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors duration-150 ${
                  active ? 'bg-accent-soft text-accent-strong' : 'text-ink-2 hover:bg-sunken hover:text-ink'
                }`}
              >
                <item.icon />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto hidden border-t border-line p-3 md:block">
          <p className="px-1 text-xs text-ink-3">Signed in as administrator</p>
          <p className="tabular px-1 text-sm font-medium">{shortWallet(session.wallet)}</p>
          <div className="mt-2 flex gap-1">
            <Button variant="ghost" className="flex-1" onClick={onExit}>
              Account
            </Button>
            <Button variant="ghost" className="flex-1" onClick={onSignOut}>
              <LogOutIcon />
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
          <h1 className="text-base font-semibold">{current.label}</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="md:hidden" onClick={onSignOut} aria-label="Sign out">
              <LogOutIcon />
            </Button>
            <LivePill state={live} />
            {status && (
              <Badge tone={status.paused ? 'incident' : 'success'}>
                {status.paused ? 'Authentication paused' : 'Authentication running'}
              </Badge>
            )}
          </div>
        </header>

        {status?.paused && section !== 'controls' && (
          <div className="border-b border-line bg-incident-soft px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-incident">
              <p>
                <span className="font-semibold">Authentication is paused.</span> The contract refuses every signature,
                whatever its score, until an administrator resumes it.
              </p>
              <Button onClick={() => setSection('controls')}>Go to controls</Button>
            </div>
          </div>
        )}

        <div className="px-4 py-6 sm:px-6">
          {loadError && (
            <div className="mb-4">
              <Notice tone="danger" title="Could not load sign-in activity">
                {loadError}
              </Notice>
            </div>
          )}
          {section === 'activity' && <Activity attempts={attempts} sessionToken={session.token} />}
          {section === 'audit' && (
            <Audit attempts={attempts} sessionToken={session.token} onChanged={refreshAttempts} />
          )}
          {section === 'controls' && (
            <Control status={status} sessionToken={session.token} onChanged={refreshStatus} />
          )}
        </div>
      </main>
    </div>
  );
}

function LivePill({ state }: { state: LiveState }) {
  const label = state === 'live' ? 'Live' : state === 'connecting' ? 'Connecting' : 'Live updates off';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-3" title="Real-time event stream from the orchestrator">
      <span
        className={`size-2 rounded-full ${
          state === 'live' ? 'bg-success' : state === 'connecting' ? 'bg-warning' : 'bg-line-strong'
        }`}
      />
      {label}
    </span>
  );
}
