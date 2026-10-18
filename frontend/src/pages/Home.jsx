import { Link } from 'react-router-dom';
import { WalletConnectButton } from '../components/WalletConnectButton';
import { useAuth } from '../context/AuthContext';

const STEPS = [
  ['The server issues a challenge', 'A random, single-use message bound to your wallet. It expires after two minutes.'],
  ['Your wallet signs it', 'MetaMask signs with your private key. The key never leaves the wallet.'],
  ['The signature is verified', 'The server recovers the signer and checks that it is the wallet you claimed.'],
  ['The blockchain is consulted', 'A smart contract must list the wallet as registered and active before a session starts.'],
];

export function Home() {
  const { user, walletAddress } = useAuth();
  return (
    <div className="home">
      <section className="home-intro">
        <h1>Sign in with your wallet, not a password.</h1>
        <p className="lead">
          BlockAuth proves who you are with a signature from your blockchain wallet and an on-chain identity registry.
          There is no password to guess, reuse or steal.
        </p>
        {user ? (
          <div className="actions">
            <Link className="button button-primary" to={user.role === 'ADMIN' ? '/admin' : '/dashboard'}>
              Open dashboard
            </Link>
          </div>
        ) : (
          <>
            <WalletConnectButton />
            <div className="actions">
              <Link className={`button ${walletAddress ? 'button-primary' : ''}`} to="/login">
                Login
              </Link>
              <Link className="button" to="/register">
                Register
              </Link>
            </div>
            <p className="hint">
              You need the MetaMask browser extension. Signing in never costs gas and never moves funds. New wallets
              register once, then log in.
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="how-heading">
        <h2 id="how-heading">How a sign-in is decided</h2>
        <ol className="explain">
          {STEPS.map(([title, body]) => (
            <li key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
