import { useEffect, useState, type FormEvent } from 'react';
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
  resendInSeconds: number;
  onSignedIn: (session: Session) => void;
  onRestart: () => void;
}

interface CodeFailure {
  title: string;
  detail: string;
  final?: boolean;
  paused?: boolean;
}

// The middle band: a code by email first, and only then the wallet signature.
export default function Otp({
  walletAddress,
  otpChallengeId,
  factors,
  delivery: firstDelivery,
  resendInSeconds,
  onSignedIn,
  onRestart,
}: OtpProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<CodeFailure | null>(null);
  const [delivery, setDelivery] = useState(firstDelivery);
  // Seconds until the server accepts a request for a new code.
  const [wait, setWait] = useState(resendInSeconds);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  // No email address on the account, or no mail server: the code was never
  // sent, so asking for it would be a dead end.
  const undeliverable = delivery === 'none';

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

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

  async function resend() {
    setResending(true);
    try {
      const sent = await postJson<{ otp_delivery: OtpDelivery; resend_in_seconds: number }>('/api/auth/otp/resend', {
        otp_challenge_id: otpChallengeId,
      });
      setDelivery(sent.otp_delivery);
      setWait(sent.resend_in_seconds);
      setResent(sent.otp_delivery === 'email');
      setError(null);
      setCode('');
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'OTP_RESEND_TOO_SOON') {
        setWait(failure.retryAfterSeconds ?? resendInSeconds);
      } else {
        setResent(false);
        setError(describeResendFailure(failure));
      }
    } finally {
      setResending(false);
    }
  }

  return (
    <Card>
      <h1 className="text-xl font-semibold tracking-tight text-ink">One more check</h1>
      <p className="mt-2 text-sm text-ink-2">
        {delivery === 'email'
          ? 'We have emailed a 6-digit code to the address on your account. It expires in 5 minutes.'
          : delivery === 'failed'
            ? 'This sign-in needs a 6-digit code, but the email could not be sent.'
            : 'This sign-in needs a 6-digit code, but we could not send one.'}
      </p>

      {resent && delivery === 'email' && !error && (
        <div className="mt-4">
          <Notice tone="success" title="We have sent a new code">
            Only the newest code works. It expires in 5 minutes.
          </Notice>
        </div>
      )}

      {delivery === 'failed' && !error && (
        <div className="mt-4">
          <Notice tone="warning" title="We could not send your code">
            The email service did not accept the message. Ask for a new code below, or try again later.
          </Notice>
        </div>
      )}

      {undeliverable && (
        <div className="mt-4 space-y-4">
          <Notice tone="danger" title="We could not send your code">
            There is no email address on this account, or no email service is set up, so this sign-in cannot be
            finished here.
          </Notice>
          <Button onClick={onRestart}>Back to sign-in</Button>
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
      ) : error?.final || undeliverable ? null : (
        <>
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
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-3">
            <span>No email? Check your spam folder.</span>
            <Button variant="ghost" busy={resending} disabled={wait > 0} onClick={resend}>
              {wait > 0 ? `Send a new code in ${wait} s` : 'Send a new code'}
            </Button>
          </div>
        </>
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
    if (failure.code === 'OTP_EXPIRED') {
      return { title: 'This code has expired', detail: 'Ask for a new code below, then enter it here.' };
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

function describeResendFailure(failure: unknown): CodeFailure {
  if (failure instanceof ApiError) {
    if (failure.code === 'OTP_RESEND_LIMIT') {
      return { title: 'No more codes for this sign-in', detail: 'For your protection, start again.', final: true };
    }
    if (failure.code === 'RISK_BLOCKED') {
      return { title: 'This sign-in has ended', detail: 'Start again to get a new code.', final: true };
    }
  }
  return { ...describeFailure(failure), final: true };
}
