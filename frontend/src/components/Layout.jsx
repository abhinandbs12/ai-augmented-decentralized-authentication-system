import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Alert } from './Alert';
import { NavBar } from './NavBar';

/** Tells a signed-in user, on any page, that their wallet signed in on a device it had not used before. */
function SignInAlertBanner() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let current = true;
    if (!user) {
      setCount(0);
      return undefined;
    }
    api.get('/api/users/alerts', { quiet: true }).then(
      (alerts) => current && setCount(alerts.length),
      () => current && setCount(0),
    );
    return () => {
      current = false;
    };
  }, [user, pathname]);

  if (!count || pathname === '/security') return null;
  return (
    <Alert kind="warn">
      Your wallet signed in on a new device. <Link to="/security">Check whether it was you</Link>.
    </Alert>
  );
}

export function Layout() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <NavBar />
      <main id="main" className="container main">
        <SignInAlertBanner />
        <Outlet />
      </main>
    </>
  );
}
