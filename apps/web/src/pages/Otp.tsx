import { useState, type FormEvent } from 'react';
import { Card, Steps } from '../components/CustomerFrame';
import { Button, Notice } from '../components/ui';
import { ApiError, postJson } from '../lib/api';
import { describeFactor } from '../lib/factors';
import type { Session } from '../lib/session';
import type { OtpDelivery } from '../lib/types';
import { completeWithSignature, describeFailure } from './Login';

interface OtpProps {
  walletAddress: string;
  otpChallengeId: string;
  factors: string[];
  delivery: OtpDelivery;
  onSignedIn: (session: Session) => void;
  onRestart: () => void;
}

interface CodeFailure {
  title: string;
  detail: string;
  final?: boolean;
  paused?: boolean;
}

// The middle band: a code by SMS first, and only then the wallet signature.
export default function Otp({
  walletAddress,
  otpChallengeId,
  factors,
  delivery,
  onSignedIn,
  onRestart,
}: OtpProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<CodeFailure | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const challenge = await postJson<{ nonce: string }>('/api/auth/otp/verify', {
        otp_challenge_id: otpChallengeId,
        code,
      });
      setSigning(true);
      const session = await completeWithSignature(walletAddress, challenge.nonce);
      onSignedIn({ ...session, factors, path: 'code' });
    } catch (failure) {
      setSigning(false);
      setCode('');
      setError(describeCodeFailure(failure));
      setBusy(false);
    }
  }

  return (
    <Card>
      <h1 className="text-xl font-semibold tracking-tight text-ink">One more check</h1>
      <p className="mt-2 text-sm text-ink-2">
        {delivery === 'sms'
          ? 'We have sent a 6-digit code to your registered mobile number. It expires in 5 minutes.'
          : 'A 6-digit code has been issued for this sign-in. It expires in 5 minutes.'}
      </p>

      {delivery !== 'sms' && (
        <div className="mt-4">
          <Notice tone="warning" title="No SMS provider is configured">
            {delivery === 'demo-log' ? (
              <>
                This is a demonstration, so the code was written to the orchestrator's log instead of being sent by
                text message. Read it with <code className="font-mono">docker compose logs orchestrator</code>.
              </>
            ) : (
              'The code cannot be delivered, so this sign-in cannot be completed. Configure Twilio, or set OTP_DEMO_DELIVERY=true for a demonstration.'
            )}
          </Notice>
        </div>
      )}

      {factors.length > 0 && (
        <div className="mt-4 rounded-lg bg-sunken p-3 text-sm text-ink-2">
          <p className="font-medium text-ink">Why we are asking</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {factors.map((factor) => (
              <li key={factor}>{describeFactor(factor).customer}</li>
            ))}
          </ul>
        </div>
      )}

      {signing ? (
        <Steps
          steps={[
            { label: 'Code accepted', state: 'done' },
            { label: 'Approve in your wallet', state: 'active' },
            { label: 'Signed in', state: 'waiting' },
          ]}
        />
      ) : error?.final ? null : (
        <form onSubmit={submit} className="mt-6">
          <label htmlFor="otp-code" className="block text-sm font-medium text-ink">
            Code
          </label>
          <input
            id="otp-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            autoFocus
            aria-invalid={Boolean(error) || undefined}
            className="tabular mt-1.5 h-12 w-full rounded-lg border border-line-strong bg-surface px-3 text-center text-2xl tracking-[0.5em] outline-none transition-[border-color,box-shadow] duration-150 focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)] aria-invalid:border-danger"
          />
          <Button type="submit" variant="primary" className="mt-4 w-full" busy={busy} disabled={code.length !== 6}>
            Verify code
          </Button>
        </form>
      )}

      {error && (
        <div className="mt-5 space-y-4">
          <Notice tone={error.paused ? 'incident' : 'danger'} title={error.title}>
            {error.detail}
          </Notice>
          {error.final && <Button onClick={onRestart}>Back to sign-in</Button>}
        </div>
      )}
    </Card>
  );
}

function describeCodeFailure(failure: unknown): CodeFailure {
  if (failure instanceof ApiError) {
    if (failure.code === 'OTP_INVALID') {
      const left = failure.attemptsRemaining ?? 0;
      return { title: 'That code is not correct', detail: `You have ${left} ${left === 1 ? 'try' : 'tries'} left.` };
    }
    if (failure.code === 'NONCE_EXPIRED') {
      return { title: 'This code has expired', detail: 'Start the sign-in again to get a new code.', final: true };
    }
    if (failure.code === 'RISK_BLOCKED') {
      return {
        title: 'This sign-in has been stopped',
        detail: 'Too many incorrect codes were entered. For your protection, start again.',
        final: true,
      };
    }
  }
  return { ...describeFailure(failure), final: true };
}
