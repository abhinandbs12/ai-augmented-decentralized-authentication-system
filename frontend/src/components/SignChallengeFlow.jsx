import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ErrorAlert } from './Alert';
import { Spinner } from './Spinner';
import { WalletConnectButton } from './WalletConnectButton';

function secondsLeft(until) {
  return Math.max(0, Math.round((new Date(until) - Date.now()) / 1000));
}

/** Counts down to the challenge's expiry, then says what to do with a request that can no longer succeed. */
function ExpiryNote({ until }) {
  const [seconds, setSeconds] = useState(() => secondsLeft(until));
  useEffect(() => {
    const timer = setInterval(() => setSeconds(secondsLeft(until)), 1000);
    return () => clearInterval(timer);
  }, [until]);
  if (seconds === 0) {
    return <p className="hint">This request has expired. Reject it in MetaMask, then start again.</p>;
  }
  return (
    <p className="hint">
      This request expires in <span className="mono">{seconds}s</span>. MetaMask should show exactly the message below.
      If it shows anything else, reject it.
    </p>
  );
}

/**
 * The two steps registration and login share: connect the wallet, then sign a one-time message.
 * `onSign(onStep)` runs the sequence and reports its phase; this component shows progress, the exact
 * message being signed, and any error. `children` is the page's own result area.
 */
export function SignChallengeFlow({ heading, explanation, actionLabel, submittingLabel, onSign, children }) {
  const { walletAddress } = useAuth();
  const [step, setStep] = useState({ phase: 'idle' }); // idle | challenge | signing | submitting
  const [error, setError] = useState(null);
  const busy = step.phase !== 'idle';

  async function handleSign() {
    setError(null);
    try {
      await onSign(setStep);
    } catch (e) {
      setError(e);
    } finally {
      setStep({ phase: 'idle' });
    }
  }

  return (
    <div className="flow">
      <ol className="steps">
        <li className={walletAddress ? 'is-done' : 'is-current'}>
          <h2>Connect your wallet</h2>
          <p className="muted">
            MetaMask asks which account to share. BlockAuth receives the public address only, never your private key
            or recovery phrase.
          </p>
          <WalletConnectButton />
        </li>

        <li className={walletAddress ? 'is-current' : undefined}>
          <h2>{heading}</h2>
          <p className="muted">{explanation}</p>
          <button className="button button-primary" onClick={handleSign} disabled={!walletAddress || busy}>
            {step.phase === 'idle' && actionLabel}
            {step.phase === 'challenge' && <Spinner label="Preparing the message…" />}
            {step.phase === 'signing' && <Spinner label="Waiting for signature…" />}
            {step.phase === 'submitting' && <Spinner label={submittingLabel} />}
          </button>
          {!walletAddress && <p className="hint">Connect your wallet first.</p>}

          {step.phase === 'signing' && (
            <div className="signing">
              <p role="status">Check MetaMask to sign.</p>
              <ExpiryNote until={step.expiresAt} />
              <pre className="challenge" aria-label="Message to sign">
                {step.challenge}
              </pre>
            </div>
          )}
        </li>
      </ol>

      <ErrorAlert error={error} />
      {children}
    </div>
  );
}
