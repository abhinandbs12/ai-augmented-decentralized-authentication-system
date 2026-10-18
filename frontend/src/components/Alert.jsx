import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { hintFor, messageFor } from '../utils/messages';

/** kind: error | warn | success | info */
export function Alert({ kind = 'error', children }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

// Where a refused wallet should go next.
const NEXT_PAGE = {
  WALLET_NOT_REGISTERED: { to: '/register', text: 'Register this wallet' },
  REGISTRATION_INCOMPLETE: { to: '/register', text: 'Go to registration' },
  WALLET_ALREADY_REGISTERED: { to: '/login', text: 'Log in instead' },
};

/**
 * An error in plain language, what to do about it, and the technical details (code, HTTP status and,
 * for unexpected server errors, the reference to quote) for whoever has to investigate.
 */
export function ErrorAlert({ error }) {
  if (!error) return null;
  const hint = hintFor(error);
  const next = NEXT_PAGE[error.code];
  return (
    <Alert>
      <p>
        {messageFor(error)} {next && <Link to={next.to}>{next.text}</Link>}
      </p>
      {hint && <p>{hint}</p>}
      {error instanceof ApiError && error.status > 0 && (
        <details>
          <summary>Technical details</summary>
          <dl className="details-list">
            <dt>Error code</dt>
            <dd className="mono">{error.code}</dd>
            <dt>HTTP status</dt>
            <dd className="mono">{error.status}</dd>
            {error.errorId && (
              <>
                <dt>Reference</dt>
                <dd className="mono">{error.errorId}</dd>
              </>
            )}
          </dl>
        </details>
      )}
    </Alert>
  );
}
