import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, ErrorAlert } from '../components/Alert';
import { SignChallengeFlow } from '../components/SignChallengeFlow';
import { Spinner } from '../components/Spinner';
import { TextField } from '../components/TextField';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/format';

/** The verification code asked for when a sign-in does not look like this wallet's usual one. */
function SecondStepForm({ until, onDone, onRestart }) {
  const { completeSecondStep } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await completeSecondStep(code.trim()));
    } catch (e) {
      // Five wrong codes or five minutes end the attempt: the wallet has to sign again.
      if (e.code === 'SECOND_STEP_EXPIRED') onRestart(e);
      else setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="result" onSubmit={submit} noValidate>
      <h2>Enter your verification code</h2>
      <p className="muted">
        Your signature checked out, but this sign-in does not look like your usual one, for example because it is a new
        device. Enter the 6-digit code from your authenticator app, or one of your backup codes. This must be finished
        in this browser before {formatDate(until)}.
      </p>
      <TextField
        label="Verification code"
        value={code}
        onChange={setCode}
        inputMode="text"
        autoComplete="one-time-code"
        spellCheck={false}
        maxLength={20}
        hint="Six digits, or a backup code such as ABCD-EFGH."
      />
      <div className="actions">
        <button className="button button-primary" type="submit" disabled={busy || code.trim().length < 6}>
          {busy ? <Spinner label="Checking the code…" /> : 'Continue'}
        </button>
      </div>
      <ErrorAlert error={error} />
    </form>
  );
}

export function Login() {
  const { user, notice, login } = useAuth();
  const navigate = useNavigate();
  const [secondStepUntil, setSecondStepUntil] = useState(null);
  const [restartError, setRestartError] = useState(null);

  function go(me) {
    if (!me) throw new Error('The session could not be started.');
    navigate(me.role === 'ADMIN' ? '/admin' : '/dashboard');
  }

  async function signIn(onStep) {
    setRestartError(null);
    const result = await login(onStep);
    if (result.secondStepUntil) setSecondStepUntil(result.secondStepUntil);
    else go(result.user);
  }

  return (
    <div className="narrow">
      <h1>Login</h1>
      <p className="lead">Prove that you own a registered wallet to start a session. There is no password.</p>
      {notice && <Alert kind="warn">{notice}</Alert>}
      {user && <Alert kind="info">You are already signed in. Logging in again replaces the current session.</Alert>}

      {secondStepUntil ? (
        <SecondStepForm
          until={secondStepUntil}
          onDone={go}
          onRestart={(error) => {
            setSecondStepUntil(null);
            setRestartError(error);
          }}
        />
      ) : (
        <SignChallengeFlow
          heading="Sign the one-time challenge"
          explanation="MetaMask will show a short message to sign. Signing proves the wallet is yours. It is not a transaction: it costs no gas and moves no funds. BlockAuth then checks the signature and the on-chain registry and starts your session. Each message works once and expires after two minutes."
          actionLabel="Sign Challenge"
          submittingLabel="Verifying signature…"
          onSign={signIn}
        >
          <ErrorAlert error={restartError} />
        </SignChallengeFlow>
      )}

      <p className="muted">
        New here? <Link to="/register">Register</Link>
      </p>
    </div>
  );
}
