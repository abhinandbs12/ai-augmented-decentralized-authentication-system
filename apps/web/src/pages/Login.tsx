import { useEffect, useRef, useState } from 'react';
import { Card, Steps, type StepState } from '../components/CustomerFrame';
import { Button, Notice, shortWallet } from '../components/ui';
import { ApiError, deviceFingerprint, postJson, signNonce } from '../lib/api';
import type { Session } from '../lib/session';

export interface LoginResponse {
  decision: 'allow' | 'otp_required' | 'blocked';
  trust_score?: number;
  factors?: string[];
  nonce?: string;
  otp_challenge_id?: string;
  request_id?: string;
}

interface VerifyResponse {
  session_token: string;
  trust_score: number;
  expires_at: string;
}

interface LoginProps {
  walletAddress: string;
  onSignedIn: (session: Session) => void;
  onCodeRequired: (challenge: { otpChallengeId: string; trustScore: number; factors: string[] }) => void;
  onRestart: () => void;
}

type Stage = 'checking' | 'signing' | 'blocked' | 'error';

// Step one of a sign-in: the attempt is scored before any signature is asked
// for, and the score decides what happens next.
export default function Login({ walletAddress, onSignedIn, onCodeRequired, onRestart }: LoginProps) {
  const [stage, setStage] = useState<Stage>('checking');
  const [error, setError] = useState<{ title: string; detail: string; paused?: boolean } | null>(null);
  const [reference, setReference] = useState<string | undefined>();
  // Each attempt is scored and logged, so it must be sent exactly once, even
  // when React's development mode mounts the component twice.
  const started = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!started.current) {
      started.current = true;
      void run();
    }
    return () => {
      mounted.current = false;
    };

    async function run() {
      try {
        const login = await postJson<LoginResponse>('/api/auth/login', {
          wallet_address: walletAddress,
          device_fingerprint: await deviceFingerprint(),
        });
        if (!mounted.current) return;

        if (login.decision === 'blocked') {
          setReference(login.request_id);
          setStage('blocked');
          return;
        }
        if (login.decision === 'otp_required' && login.otp_challenge_id) {
          onCodeRequired({
            otpChallengeId: login.otp_challenge_id,
            trustScore: login.trust_score ?? 0,
            factors: login.factors ?? [],
          });
          return;
        }

        setStage('signing');
        const session = await completeWithSignature(walletAddress, login.nonce!);
        if (mounted.current) {
          onSignedIn({ ...session, factors: login.factors ?? [], path: 'signature' });
        }
      } catch (failure) {
        if (!mounted.current) return;
        setError(describeFailure(failure));
        setStage('error');
      }
    }
  }, [walletAddress, onSignedIn, onCodeRequired]);

  const steps: { label: string; state: StepState }[] = [
    { label: 'Security check', state: stage === 'checking' ? 'active' : stage === 'blocked' ? 'failed' : 'done' },
    {
      label: 'Approve in your wallet',
      state: stage === 'signing' ? 'active' : stage === 'error' ? 'failed' : 'waiting',
    },
    { label: 'Signed in', state: 'waiting' },
  ];

  return (
    <Card>
      <h1 className="text-xl font-semibold tracking-tight text-ink">
        {stage === 'blocked' ? 'We could not complete this sign-in' : 'Signing you in'}
      </h1>
      <p className="tabular mt-1 text-sm text-ink-3">Wallet {shortWallet(walletAddress)}</p>

      {stage !== 'blocked' && <Steps steps={steps} />}

      {stage === 'signing' && (
        <p className="mt-5 text-sm text-ink-2">
          Your wallet is asking you to approve this sign-in. Approving proves the request came from you.
        </p>
      )}

      {stage === 'blocked' && (
        <div className="mt-5 space-y-4">
          <Notice tone="danger" title="For your protection, this attempt was stopped">
            Several things about it did not look like you. If this was you, please contact support
            {reference ? ` and quote reference ${reference.slice(0, 8)}` : ''}.
          </Notice>
          <Button onClick={onRestart}>Back to sign-in</Button>
        </div>
      )}

      {stage === 'error' && error && (
        <div className="mt-5 space-y-4">
          <Notice tone={error.paused ? 'incident' : 'danger'} title={error.title}>
            {error.detail}
          </Notice>
          <Button onClick={onRestart}>Try again</Button>
        </div>
      )}
    </Card>
  );
}

// Shared by the signature-only path and the path that follows an SMS code.
export async function completeWithSignature(
  walletAddress: string,
  nonce: string,
): Promise<Pick<Session, 'token' | 'wallet' | 'trustScore' | 'expiresAt'>> {
  const signature = await signNonce(walletAddress, nonce);
  const verified = await postJson<VerifyResponse>('/api/auth/verify', {
    wallet_address: walletAddress,
    nonce,
    signature,
  });
  return {
    token: verified.session_token,
    wallet: walletAddress,
    trustScore: verified.trust_score,
    expiresAt: verified.expires_at,
  };
}

export function describeFailure(failure: unknown): { title: string; detail: string; paused?: boolean } {
  if (failure instanceof ApiError) {
    if (failure.code === 'AUTH_PAUSED') {
      return {
        title: 'Sign-ins are paused for a few minutes',
        detail: 'We have temporarily paused all sign-ins to protect accounts. Your account is safe. Please try again shortly.',
        paused: true,
      };
    }
    if (failure.code === 'NOT_REGISTERED') {
      return { title: 'This wallet has no account yet', detail: 'Go back and choose "Open an account" first.' };
    }
    if (failure.code === 'RATE_LIMITED') {
      return { title: 'Too many attempts', detail: 'Please wait a moment before trying again.' };
    }
    return { title: 'We could not sign you in', detail: failure.message };
  }
  return { title: 'We could not sign you in', detail: (failure as Error).message };
}
