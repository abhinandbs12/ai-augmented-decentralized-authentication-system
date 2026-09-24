import { useState, type FormEvent } from 'react';
import { Card } from '../components/CustomerFrame';
import { WalletIcon } from '../components/icons';
import { Button, Notice } from '../components/ui';
import { ApiError, connectWallet, postJson } from '../lib/api';

interface VaultProps {
  onWallet: (walletAddress: string) => void;
}

const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

// Landing screen: sign in with an existing wallet, or open an account by
// registering one. Registration records the wallet on the bank's ledger and
// keeps the mobile number used for SMS codes.
export default function Vault({ onWallet }: VaultProps) {
  const [mode, setMode] = useState<'sign-in' | 'register'>('sign-in');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      onWallet(await connectWallet());
    } catch (walletError) {
      setError((walletError as Error).message);
      setBusy(false);
    }
  }

  async function register(event: FormEvent) {
    event.preventDefault();
    if (phone && !PHONE_PATTERN.test(phone)) {
      setError('Enter the mobile number with its country code, for example +919876543210.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const walletAddress = await connectWallet();
      try {
        await postJson('/api/auth/register', {
          wallet_address: walletAddress,
          ...(name.trim() ? { display_name: name.trim() } : {}),
          ...(phone ? { phone_number: phone } : {}),
        });
      } catch (registrationError) {
        // An existing customer simply continues to sign in.
        if (!(registrationError instanceof ApiError && registrationError.code === 'ALREADY_REGISTERED')) {
          throw registrationError;
        }
      }
      onWallet(walletAddress);
    } catch (registrationError) {
      setError((registrationError as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card>
      <h1 className="text-xl font-semibold tracking-tight text-ink">
        {mode === 'sign-in' ? 'Sign in to your account' : 'Open an account'}
      </h1>
      <p className="mt-2 text-sm text-ink-2">
        {mode === 'sign-in'
          ? 'There is no password. You approve the sign-in in your wallet, and your key never leaves this device.'
          : 'Your wallet becomes your login. We keep your name and mobile number, and nothing that could be used to sign in as you.'}
      </p>

      {mode === 'sign-in' ? (
        <div className="mt-6 space-y-3">
          <Button variant="primary" className="w-full" busy={busy} onClick={signIn}>
            <WalletIcon />
            Continue with wallet
          </Button>
          <p className="text-center text-sm text-ink-3">
            New customer?{' '}
            <button
              type="button"
              className="font-medium text-accent underline-offset-4 hover:underline"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
            >
              Open an account
            </button>
          </p>
        </div>
      ) : (
        <form onSubmit={register} className="mt-6 space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-ink">
              Full name
            </label>
            <input
              id="name"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              className="mt-1.5 h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"
            />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-ink">
              Mobile number
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+919876543210"
              value={phone}
              onChange={(event) => setPhone(event.target.value.replace(/[^\d+]/g, ''))}
              aria-describedby="phone-help"
              className="tabular mt-1.5 h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"
            />
            <p id="phone-help" className="mt-1.5 text-xs text-ink-3">
              We text a code here when a sign-in needs an extra check.
            </p>
          </div>
          <Button type="submit" variant="primary" className="w-full" busy={busy}>
            <WalletIcon />
            Connect wallet and open account
          </Button>
          <p className="text-center text-sm text-ink-3">
            Already a customer?{' '}
            <button
              type="button"
              className="font-medium text-accent underline-offset-4 hover:underline"
              onClick={() => {
                setMode('sign-in');
                setError(null);
              }}
            >
              Sign in
            </button>
          </p>
        </form>
      )}

      {error && (
        <div className="mt-5">
          <Notice tone="danger" title="That did not work">
            {error}
          </Notice>
        </div>
      )}
    </Card>
  );
}
