import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signAndSubmit } from '../api/auth';
import { api, configureApi, ensureCsrfToken } from '../api/client';
import { connectWallet, onAccountsChanged } from '../wallet/metamask';

const AuthContext = createContext(null);

// The session lives in an HttpOnly cookie the page cannot read. This context mirrors /api/users/me
// in memory only: nothing about the session, role or wallet is ever written to web storage, and the
// role shown here only decides what the navigation offers. The server authorizes every request.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState(null);
  const [notice, setNotice] = useState(null);
  const navigate = useNavigate();
  const userRef = useRef(null);
  userRef.current = user;

  const refresh = useCallback(async () => {
    try {
      const me = await api.get('/api/users/me', { quiet: true });
      setUser(me);
      return me;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /** Asks MetaMask for the account to use. Proves nothing yet; ownership is proven by signing. */
  const connect = useCallback(async () => {
    const address = (await connectWallet()) ?? null;
    setWalletAddress(address);
    return address;
  }, []);

  /**
   * Signs in with the connected wallet. @returns { user } when the session started, or
   * { secondStepUntil } when the server asks for a verification code first (see completeSecondStep).
   */
  const login = useCallback(
    async (onStep) => {
      const result = await signAndSubmit('login', walletAddress, onStep);
      if (result?.status === 'SECOND_STEP_REQUIRED') return { secondStepUntil: result.expiresAt };
      setNotice(null);
      await ensureCsrfToken();
      return { user: await refresh() };
    },
    [walletAddress, refresh],
  );

  /** Finishes a sign-in that is waiting for its second step. Must run in the browser that signed. */
  const completeSecondStep = useCallback(
    async (code) => {
      await api.post('/api/auth/second-step', { code });
      setNotice(null);
      await ensureCsrfToken();
      return refresh();
    },
    [refresh],
  );

  const logout = useCallback(
    async (message = null) => {
      try {
        await api.post('/api/auth/logout');
      } catch {
        // The local state is cleared regardless; an unreachable server session expires on its own.
      }
      setUser(null);
      setNotice(message);
      ensureCsrfToken().catch(() => {});
      navigate(message ? '/login' : '/');
    },
    [navigate],
  );

  useEffect(() => {
    ensureCsrfToken().catch(() => {});
    refresh();
  }, [refresh]);

  useEffect(() => {
    configureApi({
      onSessionEnded: () => {
        if (!userRef.current) return;
        setUser(null);
        setNotice('Your session has expired or was ended. Please sign in again.');
        navigate('/login');
      },
      // The role may have changed since this page loaded: re-read it so the navigation is accurate.
      onAccessDenied: () => {
        refresh();
      },
    });
    return () => configureApi({ onSessionEnded: () => {}, onAccessDenied: () => {} });
  }, [navigate, refresh]);

  useEffect(
    () =>
      onAccountsChanged((accounts) => {
        const next = accounts[0] ?? null;
        setWalletAddress(next);
        const current = userRef.current;
        // The session belongs to one wallet. If MetaMask now shows another (or none), end it.
        if (current && next?.toLowerCase() !== current.walletAddress.toLowerCase()) {
          logout('Wallet changed — you have been signed out.');
        }
      }),
    [logout],
  );

  const value = useMemo(
    () => ({ user, loading, walletAddress, notice, connect, login, completeSecondStep, logout, refresh }),
    [user, loading, walletAddress, notice, connect, login, completeSecondStep, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
