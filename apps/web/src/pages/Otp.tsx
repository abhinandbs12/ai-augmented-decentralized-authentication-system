import { useState, type FormEvent } from 'react';
import { postJson, signNonce } from '../lib/api';

interface OtpProps {
  walletAddress: string;
  otpChallengeId: string;
  onSignedIn: (sessionToken: string) => void;
}

interface OtpResponse {
  nonce: string;
}

// The middle band: a code by SMS first, and only then the signature request.
export default function Otp({ walletAddress, otpChallengeId, onSignedIn }: OtpProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const challenge = await postJson<OtpResponse>('/api/auth/otp/verify', {
        otp_challenge_id: otpChallengeId,
        code,
      });

      const signature = await signNonce(walletAddress, challenge.nonce);
      const verified = await postJson<{ session_token: string }>('/api/auth/verify', {
        wallet_address: walletAddress,
        nonce: challenge.nonce,
        signature,
      });
      onSignedIn(verified.session_token);
    } catch (otpError) {
      const remaining = (otpError as { attempts_remaining?: number }).attempts_remaining;
      setError(
        remaining === undefined
          ? (otpError as Error).message
          : `${(otpError as Error).message} ${remaining} attempts left.`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-md mx-auto mt-24 p-6 bg-white rounded-lg shadow">
      <h1 className="text-xl font-bold text-gray-900">Enter your code</h1>
      <p className="mt-2 text-sm text-gray-600">
        We sent a six-digit code to the phone number on your account.
      </p>

      <label htmlFor="otp-code" className="mt-6 block text-sm font-medium text-gray-700">
        Six-digit code
      </label>
      <input
        id="otp-code"
        inputMode="numeric"
        pattern="\d{6}"
        maxLength={6}
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
        className="mt-1 w-full rounded border px-3 py-2 tracking-widest"
        autoFocus
      />

      <button
        type="submit"
        disabled={busy || code.length !== 6}
        className="mt-4 w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {busy ? 'Checking…' : 'Verify'}
      </button>

      {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </form>
  );
}
