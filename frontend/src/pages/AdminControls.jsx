import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { withProof } from '../api/stepUp';
import { query, useApi } from '../api/useApi';
import { Address } from '../components/Address';
import { AddressField } from '../components/AddressField';
import { Alert, ErrorAlert } from '../components/Alert';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DataTable } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { SelectFilter } from '../components/SelectFilter';
import { Spinner } from '../components/Spinner';
import { StatusBadge } from '../components/StatusBadge';
import { TextField } from '../components/TextField';
import { useAuth } from '../context/AuthContext';
import { formatDate, isValidAddress, label } from '../utils/format';

const SCOPES = [
  { value: 'users:read', text: 'Read the user list' },
  { value: 'audit:read', text: 'Read audit logs, statistics and sign-in risk' },
  { value: 'wallet-status:read', text: 'Read on-chain wallet status' },
];

/** One action at a time per panel: its busy flag, its error, and its last result. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  async function run(action) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const value = await action();
      setResult(value ?? true);
      return value ?? true;
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, result, run };
}

function Scheduled({ action }) {
  return (
    <Alert kind="info">
      Requested. It takes effect at {formatDate(action.executeAfter)} unless an administrator cancels it under Waiting
      actions.
    </Alert>
  );
}

function EmergencyStop({ onChange }) {
  const { user } = useAuth();
  const state = useApi('/api/admin/emergency-stop');
  const { busy, error, result, run } = useAction();
  const [reason, setReason] = useState('');
  const [blockLogins, setBlockLogins] = useState(true);
  const [endUserSessions, setEndUserSessions] = useState(false);
  const active = state.data?.active;

  async function switchOn() {
    const settings = { blockLogins, endUserSessions };
    const done = await run(async () =>
      api.post('/api/admin/emergency-stop/activate', {
        reason: reason.trim(),
        ...settings,
        ...(await withProof(user.walletAddress, 'START_EMERGENCY_STOP', settings)),
      }),
    );
    if (done) {
      setReason('');
      state.reload();
    }
  }

  async function lift() {
    if (await run(async () => api.post('/api/admin/emergency-stop/lift', await withProof(user.walletAddress, 'LIFT_EMERGENCY_STOP')))) {
      onChange();
    }
  }

  return (
    <section className="result" aria-labelledby="stop-title">
      <h2 id="stop-title">Emergency stop</h2>
      <p className="muted">
        Takes effect at once. While it is on, BlockAuth refuses new registrations, wallet reactivations, second-step
        resets, removing a suspicious flag and new API keys, and optionally new sign-ins by users. Administrators can
        always sign in and revoking a wallet still works. Lifting it waits like any other access-restoring action. It
        controls this application only: the contract can still be called directly with the operator key.
      </p>
      {state.loading && !state.data && <Spinner label="Loading…" />}
      <ErrorAlert error={state.error} />
      {active && (
        <Alert kind="warn">
          <p>
            <strong>The emergency stop is on</strong> since {formatDate(state.data.changedAt)}: {state.data.reason}
          </p>
          <p>New sign-ins by users are {state.data.blockLogins ? 'blocked' : 'allowed'}.</p>
          <div className="actions">
            <button className="button" onClick={lift} disabled={busy}>
              {busy ? <Spinner label="Requesting…" /> : 'Request to lift it'}
            </button>
          </div>
        </Alert>
      )}
      {state.data && !active && (
        <div className="result">
          <TextField label="Reason" value={reason} onChange={setReason} maxLength={200} hint="3–200 characters, shown to administrators." />
          <label className="check">
            <input type="checkbox" checked={blockLogins} onChange={(e) => setBlockLogins(e.target.checked)} />
            Also refuse new sign-ins by users
          </label>
          <label className="check">
            <input type="checkbox" checked={endUserSessions} onChange={(e) => setEndUserSessions(e.target.checked)} />
            Also sign out every user now
          </label>
          <div className="actions">
            <button className="button button-danger" onClick={switchOn} disabled={busy || reason.trim().length < 3}>
              {busy ? <Spinner label="Switching on…" /> : 'Switch on the emergency stop'}
            </button>
          </div>
        </div>
      )}
      {result?.action && <Scheduled action={result} />}
      <ErrorAlert error={error} />
    </section>
  );
}

function WaitingActions({ version }) {
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(0);
  const actions = useApi(`/api/admin/actions${query({ status, page, size: 20 })}`);
  const { busy, error, run } = useAction();
  const { reload } = actions;
  // Another panel requested an action: show it.
  useEffect(() => {
    if (version) reload();
  }, [version, reload]);

  async function cancel(id) {
    await run(() => api.post(`/api/admin/actions/${id}/cancel`));
    actions.reload();
  }

  return (
    <section className="result" aria-labelledby="actions-title">
      <h2 id="actions-title">Waiting actions</h2>
      <p className="muted">
        Reactivating a wallet, resetting a second step and lifting the emergency stop wait before the server carries them
        out. Any administrator can cancel them meanwhile. A request still fails if its requester is no longer an active
        administrator when the time comes.
      </p>
      <div className="filters">
        <SelectFilter
          label="Status"
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(0);
          }}
          options={['PENDING', 'EXECUTED', 'CANCELLED', 'FAILED']}
          allLabel="Any status"
        />
      </div>
      <DataTable
        caption="Delayed administrator actions"
        page={actions.data}
        loading={actions.loading}
        error={actions.error}
        empty="Nothing here."
        columns={[
          { key: 'action', header: 'Action', render: (row) => label(row.action) },
          { key: 'targetWallet', header: 'Wallet', render: (row) => row.targetWallet && <Address value={row.targetWallet} /> },
          { key: 'requestedBy', header: 'Requested by', render: (row) => <Address value={row.requestedBy} /> },
          { key: 'executeAfter', header: 'Takes effect', render: (row) => formatDate(row.executeAfter) },
          {
            key: 'status',
            header: 'Status',
            render: (row) => (
              <>
                <StatusBadge value={row.status} /> {row.failureReason && <span className="muted">{label(row.failureReason)}</span>}
              </>
            ),
          },
          {
            key: 'cancel',
            header: 'Actions',
            render: (row) =>
              row.status === 'PENDING' && (
                <button className="button button-small" onClick={() => cancel(row.id)} disabled={busy}>
                  Cancel
                </button>
              ),
          },
        ]}
      />
      <Pagination page={actions.data} onChange={setPage} />
      <ErrorAlert error={error} />
    </section>
  );
}

function FlaggedWallets() {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const flags = useApi(`/api/admin/wallet-flags${query({ page, size: 20 })}`);
  const { busy, error, run } = useAction();
  const [wallet, setWallet] = useState('');
  const [reason, setReason] = useState('');
  const invalid = wallet !== '' && !isValidAddress(wallet);
  const rows = flags.data && { ...flags.data, items: flags.data.items.map((f) => ({ ...f, id: f.walletAddress })) };

  async function flag(event) {
    event.preventDefault();
    const done = await run(async () =>
      api.post('/api/admin/wallet-flags', {
        walletAddress: wallet,
        reason: reason.trim(),
        ...(await withProof(user.walletAddress, 'FLAG_WALLET', { walletAddress: wallet })),
      }),
    );
    if (done) {
      setWallet('');
      setReason('');
      flags.reload();
    }
  }

  async function unflag(address) {
    await run(async () =>
      api.post(`/api/admin/wallet-flags/${address}/remove`, await withProof(user.walletAddress, 'UNFLAG_WALLET', { walletAddress: address })),
    );
    flags.reload();
  }

  return (
    <section className="result" aria-labelledby="flags-title">
      <h2 id="flags-title">Suspicious wallets</h2>
      <p className="muted">
        A flag lowers the trust score of the wallet's sign-ins, and of wallets that share a device with it. It does not
        revoke anything.
      </p>
      <form className="lookup" onSubmit={flag} noValidate>
        <AddressField label="Wallet" value={wallet} onChange={setWallet} error={invalid ? 'Not a valid Ethereum address' : null} />
        <TextField label="Reason" value={reason} onChange={setReason} maxLength={200} />
        <button className="button" type="submit" disabled={busy || !isValidAddress(wallet) || reason.trim().length < 3}>
          {busy ? <Spinner label="Flagging…" /> : 'Flag wallet'}
        </button>
      </form>
      <DataTable
        caption="Wallets flagged as suspicious"
        page={rows}
        loading={flags.loading}
        error={flags.error}
        empty="No wallets are flagged."
        columns={[
          { key: 'walletAddress', header: 'Wallet', render: (row) => <Address value={row.walletAddress} /> },
          { key: 'reason', header: 'Reason', wrap: true },
          { key: 'flaggedAt', header: 'Flagged', render: (row) => formatDate(row.flaggedAt) },
          {
            key: 'remove',
            header: 'Actions',
            render: (row) => (
              <button className="button button-small" onClick={() => unflag(row.walletAddress)} disabled={busy}>
                Remove flag
              </button>
            ),
          },
        ]}
      />
      <Pagination page={flags.data} onChange={setPage} />
      <ErrorAlert error={error} />
    </section>
  );
}

function SecondStepReset({ onChange }) {
  const { user } = useAuth();
  const { busy, error, result, run } = useAction();
  const [wallet, setWallet] = useState('');
  const invalid = wallet !== '' && !isValidAddress(wallet);

  async function reset(event) {
    event.preventDefault();
    const done = await run(async () =>
      api.post(`/api/admin/wallet/${wallet}/second-step/reset`, await withProof(user.walletAddress, 'RESET_SECOND_STEP', { walletAddress: wallet })),
    );
    if (done) onChange();
  }

  return (
    <section className="result" aria-labelledby="reset-title">
      <h2 id="reset-title">Reset a user's second step</h2>
      <p className="muted">
        For a user who lost both their authenticator and their backup codes. Confirm who they are outside BlockAuth
        first. The reset waits before it takes effect.
      </p>
      <form className="lookup" onSubmit={reset} noValidate>
        <AddressField label="Wallet" value={wallet} onChange={setWallet} error={invalid ? 'Not a valid Ethereum address' : null} />
        <button className="button" type="submit" disabled={busy || !isValidAddress(wallet)}>
          {busy ? <Spinner label="Requesting…" /> : 'Request reset'}
        </button>
      </form>
      {result?.action && <Scheduled action={result} />}
      <ErrorAlert error={error} />
    </section>
  );
}

function ApiKeys() {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const keys = useApi(`/api/admin/api-keys${query({ page, size: 20 })}`);
  const { busy, error, result, run } = useAction();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState([]);
  const [days, setDays] = useState('30');
  const [revoking, setRevoking] = useState(null);
  // The same range the server enforces by default (blockauth.security.api-key-max-days); the server checks again.
  const daysValid = /^\d+$/.test(days) && Number(days) >= 1 && Number(days) <= 90;

  function toggle(scope) {
    setScopes((current) => (current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope]));
  }

  async function create(event) {
    event.preventDefault();
    const spec = { name: name.trim(), scopes, days: Number(days) };
    const created = await run(async () =>
      api.post('/api/admin/api-keys', { ...spec, ...(await withProof(user.walletAddress, 'CREATE_API_KEY', spec)) }),
    );
    if (created) {
      setName('');
      setScopes([]);
      keys.reload();
    }
  }

  async function revoke() {
    await run(() => api.post(`/api/admin/api-keys/${revoking.id}/revoke`));
    setRevoking(null);
    keys.reload();
  }

  return (
    <section className="result" aria-labelledby="keys-title">
      <h2 id="keys-title">API keys</h2>
      <p className="muted">
        Read-only keys for scripts and reports, sent in the <span className="mono">X-API-Key</span> header. A key can
        only read what its scopes allow, expires on its own, and stops working if its owner is no longer an active
        administrator.
      </p>
      <form className="result" onSubmit={create} noValidate>
        <TextField label="Name" value={name} onChange={setName} maxLength={60} hint="Letters, digits, spaces, dots, dashes or underscores." />
        <fieldset className="field">
          <legend>Scopes</legend>
          {SCOPES.map((scope) => (
            <label className="check" key={scope.value}>
              <input type="checkbox" checked={scopes.includes(scope.value)} onChange={() => toggle(scope.value)} />
              <span className="mono">{scope.value}</span> {scope.text}
            </label>
          ))}
        </fieldset>
        <TextField
          label="Valid for (days)"
          value={days}
          onChange={setDays}
          inputMode="numeric"
          maxLength={3}
          hint="1 to 90."
          error={days !== '' && !daysValid ? 'Enter a whole number from 1 to 90.' : null}
        />
        <div className="actions">
          <button className="button" type="submit" disabled={busy || !name.trim() || scopes.length === 0 || !daysValid}>
            {busy ? <Spinner label="Creating…" /> : 'Create key'}
          </button>
        </div>
      </form>
      {result?.token && (
        <Alert kind="success">
          <p>
            <strong>Copy this key now.</strong> It is shown only once; BlockAuth keeps only a hash of it.
          </p>
          <p className="mono address-full">{result.token}</p>
        </Alert>
      )}
      <DataTable
        caption="API keys"
        page={keys.data}
        loading={keys.loading}
        error={keys.error}
        empty="No API keys."
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'scopes', header: 'Scopes', render: (row) => <span className="mono">{row.scopes.join(', ')}</span> },
          { key: 'status', header: 'Status', render: (row) => <StatusBadge value={row.status} /> },
          { key: 'expiresAt', header: 'Expires', render: (row) => formatDate(row.expiresAt) },
          { key: 'lastUsedAt', header: 'Last used', render: (row) => formatDate(row.lastUsedAt) || 'Never' },
          {
            key: 'revoke',
            header: 'Actions',
            render: (row) =>
              row.status === 'ACTIVE' && (
                <button className="button button-small button-danger" onClick={() => setRevoking(row)} disabled={busy}>
                  Revoke
                </button>
              ),
          },
        ]}
      />
      <Pagination page={keys.data} onChange={setPage} />
      <ErrorAlert error={error} />
      <ConfirmDialog
        open={revoking !== null}
        title="Revoke this API key?"
        confirmLabel="Revoke key"
        danger
        busy={busy}
        onConfirm={revoke}
        onCancel={() => setRevoking(null)}
      >
        <p>
          <strong>{revoking?.name}</strong> stops working at once. This cannot be undone: a script that uses it needs a
          new key.
        </p>
      </ConfirmDialog>
    </section>
  );
}

export function AdminControls() {
  const [version, setVersion] = useState(0);
  const changed = () => setVersion((v) => v + 1);
  return (
    <>
      <h1>Controls</h1>
      <p className="lead">
        Every change here needs a fresh signature from your wallet in MetaMask, on top of your session.
      </p>
      <EmergencyStop onChange={changed} />
      <WaitingActions version={version} />
      <SecondStepReset onChange={changed} />
      <FlaggedWallets />
      <ApiKeys />
    </>
  );
}
