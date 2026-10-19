import { useEffect, useRef, useState } from 'react';
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

const TITLES = {
  '/': 'Sign in with your wallet',
  '/register': 'Register',
  '/login': 'Login',
  '/dashboard': 'Dashboard',
  '/history': 'Authentication history',
  '/wallet-status': 'Wallet status',
  '/security': 'Account security',
  '/admin': 'Admin dashboard',
  '/admin/wallets': 'Wallet management',
  '/admin/security': 'Security monitoring',
  '/admin/controls': 'Controls',
};

/**
 * Names each page in the browser tab, and after a page change moves focus to the top of the new page,
 * so keyboard and screen-reader users start there instead of on the link they used.
 */
function usePageChange(mainRef) {
  const { pathname } = useLocation();
  const shown = useRef(pathname);
  useEffect(() => {
    document.title = `${TITLES[pathname] ?? 'Page not found'} · BlockAuth`;
    if (shown.current === pathname) return;
    shown.current = pathname;
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname, mainRef]);
}

/**
 * When an action removes the control that had focus (a "Sign out" or "Revoke" button whose row goes
 * away), the browser drops focus to the page itself. This puts it on the heading of the section the
 * control was in, or on the main region, so keyboard users keep their place.
 */
function useFocusRecovery(mainRef) {
  useEffect(() => {
    const main = mainRef.current;
    let focused = null; // { element, section } of the last element that received focus
    const track = (event) => {
      focused = { element: event.target, section: event.target.closest('section') };
    };
    const observer = new MutationObserver(() => {
      if (!focused || focused.element.isConnected || document.activeElement !== document.body) return;
      const heading = focused.section?.isConnected ? focused.section.querySelector('h2') : null;
      if (heading) heading.tabIndex = -1;
      (heading ?? main).focus({ preventScroll: true });
    });
    document.addEventListener('focusin', track);
    observer.observe(main, { childList: true, subtree: true });
    return () => {
      document.removeEventListener('focusin', track);
      observer.disconnect();
    };
  }, [mainRef]);
}

export function Layout() {
  const mainRef = useRef(null);
  usePageChange(mainRef);
  useFocusRecovery(mainRef);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <NavBar />
      <main id="main" className="container main" ref={mainRef} tabIndex={-1}>
        <SignInAlertBanner />
        <Outlet />
      </main>
    </>
  );
}
