import { useState } from 'react';
import { Link } from 'react-router-dom';
import { signAndSubmit } from '../api/auth';
import { Alert } from '../components/Alert';
import { SignChallengeFlow } from '../components/SignChallengeFlow';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/format';

export function Register() {
  const { walletAddress } = useAuth();
  const [registered, setRegistered] = useState(null);

  async function register(onStep) {
    setRegistered(null);
    setRegistered(await signAndSubmit('register', walletAddress, onStep));
  }

  return (
    <div className="narrow">
      <h1>Register</h1>
      <p className="lead">
        Prove that you own a wallet. BlockAuth then adds it to the identity registry on the blockchain, and you can use
        it to log in.
      </p>

      <SignChallengeFlow
        heading="Prove ownership and register"
        explanation="MetaMask will show a short message to sign. Signing proves the wallet is yours. It is not a transaction: it costs no gas and moves no funds. After you sign, BlockAuth writes your wallet to the registry, which takes a few seconds."
        actionLabel="Sign & Register"
        submittingLabel="Registering on blockchain…"
        onSign={register}
      >
        {registered && (
          <Alert kind="success">
            <p>
              Registration complete. <Link to="/login">Log in with this wallet</Link>
            </p>
            <details>
              <summary>Registration details</summary>
              <dl className="details-list">
                <dt>Wallet</dt>
                <dd className="mono">{registered.walletAddress}</dd>
                <dt>Role</dt>
                <dd>{registered.role === 'ADMIN' ? 'Administrator' : 'User'}</dd>
                <dt>Registered on-chain</dt>
                <dd>{formatDate(registered.registeredAt)}</dd>
                {registered.transactionHash && (
                  <>
                    <dt>Transaction</dt>
                    <dd className="mono">{registered.transactionHash}</dd>
                  </>
                )}
              </dl>
            </details>
          </Alert>
        )}
      </SignChallengeFlow>

      <p className="muted">
        Already registered? <Link to="/login">Login</Link>
      </p>
    </div>
  );
}
