import { useState, type FormEvent } from 'react';
import { Card } from '../components/CustomerFrame';
import { WalletIcon } from '../components/icons';
import { Button, Notice, shortWallet } from '../components/ui';
import { ApiError, connectWallet, postJson, setBrowserSigner, type EthereumProvider } from '../lib/api';
import {
  MIN_PASSPHRASE_LENGTH,
  createBrowserKey,
  downloadBackup,
  forgetBrowserKey,
  savedBrowserKey,
  unlockBrowserKey,
  type SavedKey,
} from '../lib/browserKey';

interface VaultProps {
  onWallet: (walletAddress: string) => void;
  notice?: string;
}

// Loose on purpose, like the server's check: one @ and a dot in the domain.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INPUT =
  'mt-1.5 h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]';
const LINK = 'font-medium text-accent underline-offset-4 hover:underline';

// Landing screen: sign in with an existing wallet, or open an account by
// registering one. Registration records the wallet on the bank's ledger and
// keeps the email address used for sign-in codes. A customer without a wallet
// extension can create a key in this browser instead (FR-01).
export default function Vault({ onWallet, notice }: VaultProps) {
  const [mode, setMode] = useState<'sign-in' | 'register'>('sign-in');
  const [keyMode, setKeyMode] = useState<'wallet' | 'browser'>('wallet');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saved, setSaved] = useState<SavedKey | null>(savedBrowserKey);
  // A key that was just created, with its signer, until the backup step ends.
  const [created, setCreated] = useState<{ saved: SavedKey; signer: EthereumProvider } | null>(null);
  const [confirmForget, setConfirmForget] = useState(false);
  const [busy, setBusy] = useState(false);
  // Which sign-in button is working, so the spinner shows on the one pressed.
  const [pending, setPending] = useState<'wallet' | 'key' | null>(null);
  const [error, setError] = useState<string | null>(null);

  function switchMode(next: 'sign-in' | 'register') {
    setMode(next);
    setError(null);
    setPassphrase('');
    setRepeat('');
  }

  async function signIn() {
    setPending('wallet');
    setError(null);
    setBrowserSigner(null);
    try {
      onWallet(await connectWallet());
    } catch (walletError) {
      setError((walletError as Error).message);
      setPending(null);
    }
  }

  async function signInWithBrowserKey(event: FormEvent) {
    event.preventDefault();
    if (!saved) return;
    setPending('key');
    setError(null);
    try {
      setBrowserSigner(await unlockBrowserKey(passphrase));
      onWallet(saved.address);
    } catch (unlockError) {
      setError((unlockError as Error).message);
      setPending(null);
    }
  }

  async function register(event: FormEvent) {
    event.preventDefault();
    // The address is required: a sign-in that needs an extra check can only be
    // finished with the code emailed to it.
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('Enter your email address, for example asha@example.com.');
      return;
    }
    if (keyMode === 'browser') {
      if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
        setError(`Choose a passphrase of at least ${MIN_PASSPHRASE_LENGTH} characters.`);
        return;
      }
      if (passphrase !== repeat) {
        setError('The two passphrases are not the same.');
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      let walletAddress: string;
      let browserKey: { saved: SavedKey; signer: EthereumProvider } | null = null;
      if (keyMode === 'browser') {
        browserKey = await createBrowserKey(passphrase);
        walletAddress = browserKey.saved.address;
      } else {
        setBrowserSigner(null);
        walletAddress = await connectWallet();
      }

      try {
        await postJson('/api/auth/register', {
          wallet_address: walletAddress,
          ...(name.trim() ? { display_name: name.trim() } : {}),
          email: email.trim(),
        });
      } catch (registrationError) {
        // An existing customer simply continues to sign in.
        if (!(registrationError instanceof ApiError && registrationError.code === 'ALREADY_REGISTERED')) {
          throw registrationError;
        }
      }

      if (browserKey) {
        // The key exists only here: the backup step comes before anything else.
        setSaved(browserKey.saved);
        setCreated(browserKey);
        setBusy(false);
        return;
      }
      onWallet(walletAddress);
    } catch (registrationError) {
      setError((registrationError as Error).message);
      setBusy(false);
    }
  }

  function continueWithCreatedKey() {
    if (!created) return;
    setBrowserSigner(created.signer);
    onWallet(created.saved.address);
  }

  function forget() {
    forgetBrowserKey();
    setSaved(null);
    setConfirmForget(false);
    setPassphrase('');
    setError(null);
  }

  if (created) {
    return (
      <Card>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Your key is ready</h1>
        <p className="mt-2 text-sm text-ink-2">
          Account <span className="font-mono">{shortWallet(created.saved.address)}</span> is registered with the bank.
          Its key was created in this browser and is stored here, encrypted with your passphrase.
        </p>
        <div className="mt-4">
          <Notice tone="warning" title="Save a backup now">
            The key exists only in this browser. Without the backup file and your passphrase, nobody can restore it,
            the bank included. The file is encrypted, so it is safe to keep.
          </Notice>
        </div>
        <div className="mt-6 space-y-3">
          <Button className="w-full" onClick={() => downloadBackup(created.saved)}>
            Download backup file
          </Button>
          <Button variant="primary" className="w-full" onClick={continueWithCreatedKey}>
            Continue to sign in
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="text-xl font-semibold tracking-tight text-ink">
        {mode === 'sign-in' ? 'Sign in to your account' : 'Open an account'}
      </h1>
      <p className="mt-2 text-sm text-ink-2">
        {mode === 'sign-in'
          ? 'There is no password. You approve the sign-in in your wallet, and your key never leaves this device.'
          : 'Your wallet becomes your login. We keep your name and email address, and nothing that could be used to sign in as you.'}
      </p>

      {notice && (
        <div className="mt-4">
          <Notice tone="warning" title="Sign-in stopped">
            {notice}
          </Notice>
        </div>
      )}

      {mode === 'sign-in' ? (
        <div className="mt-6 space-y-3">
          <Button variant="primary" className="w-full" busy={pending === 'wallet'} onClick={signIn}>
            <WalletIcon />
            Continue with wallet
          </Button>

          {saved && (
            <form onSubmit={signInWithBrowserKey} className="space-y-3 border-t border-line pt-4">
              <p className="text-sm text-ink-2">
                Or use the key saved in this browser for{' '}
                <span className="font-mono text-ink">{shortWallet(saved.address)}</span>.
              </p>
              <div>
                <label htmlFor="unlock-passphrase" className="block text-sm font-medium text-ink">
                  Passphrase
                </label>
                <input
                  id="unlock-passphrase"
                  type="password"
                  autoComplete="current-password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  className={INPUT}
                />
              </div>
              <Button type="submit" className="w-full" busy={pending === 'key'} disabled={!passphrase}>
                Unlock key and sign in
              </Button>
              {confirmForget ? (
                <div className="space-y-2 text-sm text-ink-2">
                  <p>This deletes the key from this browser. Only the backup file can bring it back.</p>
                  <div className="flex gap-2">
                    <Button variant="danger" onClick={forget}>
                      Remove key
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmForget(false)}>
                      Keep it
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-center text-sm text-ink-3">
                  <button type="button" className={LINK} onClick={() => setConfirmForget(true)}>
                    Remove this key from this browser
                  </button>
                </p>
              )}
            </form>
          )}

          <p className="text-center text-sm text-ink-3">
            New customer?{' '}
            <button type="button" className={LINK} onClick={() => switchMode('register')}>
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
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-ink">
              Email address
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="asha@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
              aria-required="true"
              aria-describedby="email-help"
              className={INPUT}
            />
            <p id="email-help" className="mt-1.5 text-xs text-ink-3">
              We email a code here when a sign-in needs an extra check.
            </p>
          </div>

          {keyMode === 'browser' ? (
            <>
              <div>
                <label htmlFor="new-passphrase" className="block text-sm font-medium text-ink">
                  Passphrase for the key
                </label>
                <input
                  id="new-passphrase"
                  type="password"
                  autoComplete="new-password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  aria-required="true"
                  aria-describedby="passphrase-help"
                  className={INPUT}
                />
                <p id="passphrase-help" className="mt-1.5 text-xs text-ink-3">
                  At least {MIN_PASSPHRASE_LENGTH} characters. It encrypts the key in this browser and is never sent
                  to the bank, so the bank cannot reset it.
                </p>
              </div>
              <div>
                <label htmlFor="repeat-passphrase" className="block text-sm font-medium text-ink">
                  Repeat the passphrase
                </label>
                <input
                  id="repeat-passphrase"
                  type="password"
                  autoComplete="new-password"
                  value={repeat}
                  onChange={(event) => setRepeat(event.target.value)}
                  aria-required="true"
                  className={INPUT}
                />
              </div>
              <Button type="submit" variant="primary" className="w-full" busy={busy}>
                Create key and open account
              </Button>
              <p className="text-center text-sm text-ink-3">
                <button type="button" className={LINK} onClick={() => setKeyMode('wallet')}>
                  Use a wallet extension instead
                </button>
              </p>
            </>
          ) : (
            <>
              <Button type="submit" variant="primary" className="w-full" busy={busy}>
                <WalletIcon />
                Connect wallet and open account
              </Button>
              <p className="text-center text-sm text-ink-3">
                No wallet?{' '}
                <button type="button" className={LINK} onClick={() => setKeyMode('browser')}>
                  Create a key in this browser
                </button>
              </p>
            </>
          )}

          <p className="text-center text-sm text-ink-3">
            Already a customer?{' '}
            <button type="button" className={LINK} onClick={() => switchMode('sign-in')}>
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
