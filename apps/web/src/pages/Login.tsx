import { useEffect, useState } from 'react';
import { deviceFingerprint, postJson, signNonce } from '../lib/api';

interface LoginProps {
  walletAddress: string;
  onSignedIn: (sessionToken: string) => void;
  onOtpRequired: (otpChallengeId: string) => void;
}

interface LoginResponse {
  decision: 'allow' | 'otp_required' | 'blocked';
  trust_score?: number;
  nonce?: string;
  otp_challenge_id?: string;
  session_active?: boolean;
}

// Step one of the login: the attempt is scored before any signature is asked
// for, and the score decides what happens next.
export default function Login({ walletAddress, onSignedIn, onOtpRequired }: LoginProps) {
  const [status, setStatus] = useState('Checking this sign-in…');
  const [error, setError] = useState<string | null>(null);
  const [trustScore, setTrustScore] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const login = await postJson<LoginResponse>('/api/auth/login', {
          wallet_address: walletAddress,
          device_fingerprint: await deviceFingerprint(),
        });
        if (cancelled) {
          return;
        }

        setTrustScore(login.trust_score ?? null);

        if (login.decision === 'otp_required' && login.otp_challenge_id) {
          onOtpRequired(login.otp_challenge_id);
          return;
        }

        if (login.decision !== 'allow' || !login.nonce) {
          setError('We could not complete this sign-in. Please contact support.');
          return;
        }

        setStatus('Confirm the request in your wallet…');
        const signature = await signNonce(walletAddress, login.nonce);

        const verified = await postJson<{ session_token: string }>('/api/auth/verify', {
          wallet_address: walletAddress,
          nonce: login.nonce,
          signature,
        });
        onSignedIn(verified.session_token);
      } catch (loginError) {
        if (!cancelled) {
          setError((loginError as Error).message);
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [walletAddress, onSignedIn, onOtpRequired]);

  return (
    <div className="max-w-md mx-auto mt-24 p-6 bg-white rounded-lg shadow">
      <h1 className="text-xl font-bold text-gray-900">Signing in</h1>
      <p className="mt-1 font-mono text-xs text-gray-500">{walletAddress}</p>

      {error ? (
        <p className="mt-6 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : (
        <p className="mt-6 text-sm text-gray-700">{status}</p>
      )}

      {trustScore !== null && (
        <p className="mt-4 text-xs text-gray-500">Security check score: {trustScore} out of 100</p>
      )}
    </div>
  );
}
