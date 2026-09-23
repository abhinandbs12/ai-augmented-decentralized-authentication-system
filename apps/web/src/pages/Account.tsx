import { Card } from '../components/CustomerFrame';
import { ActivityIcon, AlertIcon, CheckIcon, LogOutIcon } from '../components/icons';
import { Button, shortWallet } from '../components/ui';
import { describeFactor } from '../lib/factors';
import type { Session } from '../lib/session';

const CHECKS = [
  { factor: 'unrecognized_device', passed: 'A device you have used before' },
  { factor: 'unrecognized_region', passed: 'Your usual location and network' },
  { factor: 'off_hours', passed: 'Your usual time of day' },
  { factor: 'high_velocity', passed: 'Normal sign-in activity' },
  { factor: 'graph_proximity_to_flagged', passed: 'No link to suspicious accounts' },
];

interface AccountProps {
  session: Session;
  isAdmin: boolean;
  onSignOut: () => void;
  onOpenConsole: () => void;
}

// After sign-in the customer sees, in plain words, what was checked and why
// they went straight in or were asked for a code.
export default function Account({ session, isAdmin, onSignOut, onOpenConsole }: AccountProps) {
  const endsAt = new Date(session.expiresAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">You are signed in</h1>
          <p className="tabular mt-1 text-sm text-ink-3">Wallet {shortWallet(session.wallet)}</p>
        </div>
        <Button variant="ghost" onClick={onSignOut}>
          <LogOutIcon />
          Sign out
        </Button>
      </div>

      <div className="-mx-6 mt-6 border-y border-line sm:-mx-8">
        <div className="flex items-baseline justify-between gap-4 border-b border-line px-6 py-3 sm:px-8">
          <p className="text-sm font-medium text-ink">How this sign-in was checked</p>
          <p className="tabular whitespace-nowrap text-sm text-ink-2">
            Score <span className="font-semibold text-ink">{session.trustScore}</span> / 100
          </p>
        </div>
        <ul className="divide-y divide-line">
          {CHECKS.map((check) => {
            const flagged = session.factors.includes(check.factor);
            return (
              <li key={check.factor} className="flex items-center gap-3 px-6 py-2.5 text-sm sm:px-8">
                {flagged ? <AlertIcon className="shrink-0 text-warning" /> : <CheckIcon className="shrink-0 text-success" />}
                <span className={flagged ? 'text-ink' : 'text-ink-2'}>
                  {flagged ? describeFactor(check.factor).customer : check.passed}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="mt-4 text-sm text-ink-2">
        {session.path === 'code'
          ? 'Because of the items marked above, we asked for an SMS code before your wallet approval.'
          : 'Everything matched, so your wallet approval was all we needed.'}{' '}
        The bank's security ledger confirmed your approval. This session ends at {endsAt}.
      </p>

      {isAdmin && (
        <Button variant="primary" className="mt-6 w-full" onClick={onOpenConsole}>
          <ActivityIcon />
          Open operations console
        </Button>
      )}
    </Card>
  );
}
