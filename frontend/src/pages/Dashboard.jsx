import { Link } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/format';

export function Dashboard() {
  const { user, logout } = useAuth();
  return (
    <>
      <h1>Dashboard</h1>
      <dl className="facts">
        <div>
          <dt>Wallet address</dt>
          <dd className="mono address-full">{user.walletAddress}</dd>
        </div>
        <div>
          <dt>Session</dt>
          <dd>
            <StatusBadge kind="ok">Authenticated</StatusBadge> by wallet signature
          </dd>
        </div>
        <div>
          <dt>Account status</dt>
          <dd>
            <StatusBadge value={user.status} />
          </dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>
            <StatusBadge value={user.role} />
          </dd>
        </div>
        <div>
          <dt>Registered</dt>
          <dd>{formatDate(user.createdAt)}</dd>
        </div>
      </dl>
      <p className="hint">
        Your session ends when you log out, after a period of inactivity, if you switch accounts in MetaMask, if an
        administrator revokes this wallet, or if you end it from another device under Account security.
      </p>
      <div className="actions">
        <Link className="button" to="/history">
          Authentication history
        </Link>
        <Link className="button" to="/wallet-status">
          Wallet status
        </Link>
        <Link className="button" to="/security">
          Account security
        </Link>
        <button className="button" onClick={() => logout()}>
          Logout
        </button>
      </div>
    </>
  );
}
