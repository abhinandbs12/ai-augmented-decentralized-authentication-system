import { useState } from 'react';
import { connectWallet, postJson } from '../lib/api';

interface VaultProps {
  onConnected: (walletAddress: string) => void;
}

// Landing screen: connect a wallet and register it. A wallet that is already
// registered simply moves on to the login screen.
export default function Vault({ onConnected }: VaultProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const walletAddress = await connectWallet();
      try {
        await postJson('/api/auth/register', { wallet_address: walletAddress });
      } catch (registrationError) {
        if ((registrationError as { code?: string }).code !== 'ALREADY_REGISTERED') {
          throw registrationError;
        }
      }
      onConnected(walletAddress);
    } catch (connectionError) {
      setError((connectionError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-24 p-6 bg-white rounded-lg shadow">
      <h1 className="text-2xl font-bold text-gray-900">Sign in to your account</h1>
      <p className="mt-2 text-sm text-gray-600">
        There is no password. Your account is your wallet, and it never leaves your device.
      </p>

      <button
        onClick={connect}
        disabled={busy}
        className="mt-6 w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {busy ? 'Waiting for your wallet…' : 'Connect wallet'}
      </button>

      {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
