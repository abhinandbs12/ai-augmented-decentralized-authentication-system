import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Address } from './Address';

/**
 * Admin links are shown only to admins, but that is a convenience: the server decides what each
 * session may do, whatever this menu shows.
 */
export function NavBar() {
  const { user, logout } = useAuth();
  return (
    <header className={user?.role === 'ADMIN' ? 'site-header site-header-admin' : 'site-header'}>
      <div className="container header-inner">
        <Link className="brand" to="/">
          BlockAuth
        </Link>
        <nav className="nav" aria-label="Main">
          {user ? (
            <>
              <NavLink to="/dashboard">Dashboard</NavLink>
              <NavLink to="/history">History</NavLink>
              <NavLink to="/wallet-status">Wallet status</NavLink>
              <NavLink to="/security">Account security</NavLink>
              {user.role === 'ADMIN' && (
                <>
                  <span className="nav-divider" aria-hidden="true" />
                  <NavLink to="/admin" end>
                    Admin
                  </NavLink>
                  <NavLink to="/admin/wallets">Wallets</NavLink>
                  <NavLink to="/admin/security">Security</NavLink>
                  <NavLink to="/admin/controls">Controls</NavLink>
                </>
              )}
            </>
          ) : (
            <>
              <NavLink to="/register">Register</NavLink>
              <NavLink to="/login">Login</NavLink>
            </>
          )}
        </nav>
        {user && (
          <div className="header-user">
            <Address value={user.walletAddress} />
            <button className="button button-small" onClick={() => logout()}>
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
