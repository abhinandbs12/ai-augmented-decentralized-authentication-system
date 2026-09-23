import { useCallback, useEffect, useState } from 'react';
import { CustomerFrame } from './components/CustomerFrame';
import { getJson, postJson } from './lib/api';
import { loadSession, saveSession, type Session } from './lib/session';
import type { OtpDelivery } from './lib/types';
import Account from './pages/Account';
import Console from './pages/admin/Console';
import Login from './pages/Login';
import Otp from './pages/Otp';
import Vault from './pages/Vault';

type Screen =
  | { name: 'welcome' }
  | { name: 'signing'; wallet: string; attempt: number }
  | { name: 'code'; wallet: string; otpChallengeId: string; factors: string[]; delivery: OtpDelivery }
  | { name: 'account' }
  | { name: 'console' };

// Two audiences, kept apart: the customer sign-in (plain words only) and the
// operations console for administrator wallets. A router would add a
// dependency for five screens, so navigation is this small state machine.
export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [isAdmin, setIsAdmin] = useState(false);
  const [screen, setScreen] = useState<Screen>(() =>
    loadSession() ? { name: location.hash === '#console' ? 'console' : 'account' } : { name: 'welcome' },
  );

  useEffect(() => {
    if (!session) {
      setIsAdmin(false);
      return;
    }
    getJson('/api/admin/status', session.token)
      .then(() => setIsAdmin(true))
      .catch(() => setIsAdmin(false));
  }, [session]);

  useEffect(() => {
    history.replaceState(null, '', screen.name === 'console' ? '#console' : location.pathname);
  }, [screen.name]);

  const restart = useCallback(() => setScreen({ name: 'welcome' }), []);

  const signedIn = useCallback((next: Session) => {
    saveSession(next);
    setSession(next);
    setScreen({ name: 'account' });
  }, []);

  const codeRequired = useCallback(
    (wallet: string) => (challenge: { otpChallengeId: string; factors: string[]; delivery: OtpDelivery }) =>
      setScreen({
        name: 'code',
        wallet,
        otpChallengeId: challenge.otpChallengeId,
        factors: challenge.factors,
        delivery: challenge.delivery,
      }),
    [],
  );

  async function signOut() {
    if (session) {
      await postJson('/api/auth/logout', {}, session.token).catch(() => undefined);
    }
    saveSession(null);
    setSession(null);
    setScreen({ name: 'welcome' });
  }

  if (screen.name === 'console' && session) {
    return <Console session={session} onExit={() => setScreen({ name: 'account' })} onSignOut={signOut} />;
  }

  return (
    <CustomerFrame>
      {screen.name === 'welcome' && (
        <Vault onWallet={(wallet) => setScreen({ name: 'signing', wallet, attempt: Date.now() })} />
      )}
      {screen.name === 'signing' && (
        <Login
          key={screen.attempt}
          walletAddress={screen.wallet}
          onSignedIn={signedIn}
          onCodeRequired={codeRequired(screen.wallet)}
          onRestart={restart}
        />
      )}
      {screen.name === 'code' && (
        <Otp
          walletAddress={screen.wallet}
          otpChallengeId={screen.otpChallengeId}
          factors={screen.factors}
          delivery={screen.delivery}
          onSignedIn={signedIn}
          onRestart={restart}
        />
      )}
      {(screen.name === 'account' || screen.name === 'console') && session && (
        <Account
          session={session}
          isAdmin={isAdmin}
          onSignOut={signOut}
          onOpenConsole={() => setScreen({ name: 'console' })}
        />
      )}
    </CustomerFrame>
  );
}
