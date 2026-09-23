import { useState } from 'react';
import { postJson } from './lib/api';
import Attempts from './pages/admin/Attempts';
import Login from './pages/Login';
import Otp from './pages/Otp';
import Vault from './pages/Vault';

type Screen =
  | { name: 'vault' }
  | { name: 'login' }
  | { name: 'otp'; otpChallengeId: string }
  | { name: 'signed-in' };

// Phase 1 navigation is a plain state machine: three customer screens plus the
// admin table. A router would add a dependency for four screens.
function App() {
  const [walletAddress, setWalletAddress] = useState('');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'vault' });
  const [showDashboard, setShowDashboard] = useState(false);

  async function signOut() {
    if (sessionToken) {
      await postJson('/api/auth/logout', {}, sessionToken).catch(() => undefined);
    }
    setSessionToken(null);
    setWalletAddress('');
    setShowDashboard(false);
    setScreen({ name: 'vault' });
  }

  function signedIn(token: string) {
    setSessionToken(token);
    setScreen({ name: 'signed-in' });
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {screen.name === 'vault' && (
        <Vault
          onConnected={(address) => {
            setWalletAddress(address);
            setScreen({ name: 'login' });
          }}
        />
      )}

      {screen.name === 'login' && (
        <Login
          walletAddress={walletAddress}
          onSignedIn={signedIn}
          onOtpRequired={(otpChallengeId) => setScreen({ name: 'otp', otpChallengeId })}
        />
      )}

      {screen.name === 'otp' && (
        <Otp
          walletAddress={walletAddress}
          otpChallengeId={screen.otpChallengeId}
          onSignedIn={signedIn}
        />
      )}

      {screen.name === 'signed-in' && (
        <div>
          <header className="flex items-center justify-between bg-white px-6 py-3 shadow">
            <div>
              <p className="text-sm font-medium text-gray-900">Signed in</p>
              <p className="font-mono text-xs text-gray-500">{walletAddress}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDashboard((visible) => !visible)}
                className="rounded border px-3 py-1 text-sm"
              >
                {showDashboard ? 'Hide dashboard' : 'Admin dashboard'}
              </button>
              <button onClick={signOut} className="rounded border px-3 py-1 text-sm">
                Log out
              </button>
            </div>
          </header>

          {showDashboard ? (
            <Attempts sessionToken={sessionToken} />
          ) : (
            <p className="mx-auto mt-24 max-w-md rounded-lg bg-white p-6 text-sm text-gray-700 shadow">
              You are signed in. Nothing was typed, stored or sent that could be stolen later.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
