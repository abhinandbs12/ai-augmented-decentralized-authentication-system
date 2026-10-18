import { useState } from 'react';
import { api } from '../api/client';
import { withProof } from '../api/stepUp';
import { useApi } from '../api/useApi';
import { Alert, ErrorAlert } from '../components/Alert';
import { DataTable } from '../components/DataTable';
import { Spinner } from '../components/Spinner';
import { StatusBadge } from '../components/StatusBadge';
import { TextField } from '../components/TextField';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/format';

/** Runs one action at a time for a section, keeping its busy flag and error. */
function useAction() {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  async function run(name, action) {
    setBusy(name);
    setError(null);
    try {
      return await action();
    } catch (e) {
      setError(e);
      return undefined;
    } finally {
      setBusy(null);
    }
  }
  return { busy, error, run };
}

const asPage = (list) => list && { items: list };

function SignInAlerts({ alerts, onChange }) {
  const { busy, error, run } = useAction();
  if (!alerts.data?.length) return null;

  async function answer(id, choice) {
    await run(id, () => api.post(`/api/users/alerts/${id}/${choice}`));
    onChange();
  }

  return (
    <section className="result" aria-labelledby="alerts-title">
      <h2 id="alerts-title">New sign-ins to check</h2>
      {alerts.data.map((alert) => (
        <Alert kind="warn" key={alert.id}>
          <p>
            Your wallet signed in on a device it had not used before: <strong>{alert.device}</strong>, from{' '}
            <span className="mono">{alert.ipAddress}</span>, at {formatDate(alert.createdAt)}.
            {!alert.sessionOpen && ' That session has already ended.'}
          </p>
          <p>If this was not you, sign that device out now, then make sure nobody else has your wallet.</p>
          <div className="actions">
            <button className="button button-small" onClick={() => answer(alert.id, 'confirm')} disabled={busy !== null}>
              This was me
            </button>
            <button
              className="button button-small button-danger"
              onClick={() => answer(alert.id, 'sign-out')}
              disabled={busy !== null}
            >
              {busy === alert.id ? <Spinner label="Signing it out…" /> : 'This was not me'}
            </button>
          </div>
        </Alert>
      ))}
      <ErrorAlert error={error} />
    </section>
  );
}

function Sessions({ sessions, onChange }) {
  const { busy, error, run } = useAction();
  const [ended, setEnded] = useState(null);
  const others = sessions.data?.filter((s) => !s.current).length ?? 0;

  async function end(id) {
    await run(id, () => api.post(`/api/users/sessions/${id}/end`));
    onChange();
  }

  async function endOthers() {
    const result = await run('others', () => api.post('/api/users/sessions/end-others'));
    if (result) setEnded(result.ended);
    onChange();
  }

  return (
    <section className="result" aria-labelledby="sessions-title">
      <div className="title-row">
        <h2 id="sessions-title">Signed-in sessions</h2>
        <button className="button button-small" onClick={endOthers} disabled={busy !== null || others === 0}>
          {busy === 'others' ? <Spinner label="Signing out…" /> : 'Sign out everywhere else'}
        </button>
      </div>
      <p className="muted">
        A session you end here is refused by the server on its very next request, wherever it is.
      </p>
      {ended !== null && <Alert kind="success">{ended === 1 ? '1 session was' : `${ended} sessions were`} signed out.</Alert>}
      <DataTable
        caption="Your signed-in sessions"
        page={asPage(sessions.data)}
        loading={sessions.loading}
        error={sessions.error}
        empty="No open sessions."
        columns={[
          {
            key: 'device',
            header: 'Device',
            render: (row) => (
              <>
                {row.device} {row.current && <StatusBadge kind="accent">This device</StatusBadge>}
              </>
            ),
          },
          { key: 'ipAddress', header: 'IP address', render: (row) => <span className="mono">{row.ipAddress}</span> },
          { key: 'createdAt', header: 'Signed in', render: (row) => formatDate(row.createdAt) },
          { key: 'lastSeenAt', header: 'Last active', render: (row) => formatDate(row.lastSeenAt) },
          { key: 'secondStep', header: 'Code used', render: (row) => (row.secondStep ? 'Yes' : 'No') },
          {
            key: 'actions',
            header: 'Actions',
            render: (row) =>
              !row.current && (
                <button className="button button-small" onClick={() => end(row.id)} disabled={busy !== null}>
                  {busy === row.id ? <Spinner label="Signing out…" /> : 'Sign out'}
                </button>
              ),
          },
        ]}
      />
      <ErrorAlert error={error} />
    </section>
  );
}

function Devices({ devices, onChange }) {
  const { busy, error, run } = useAction();

  async function forget(id) {
    await run(id, () => api.post(`/api/users/devices/${id}/remove`));
    onChange();
  }

  return (
    <section className="result" aria-labelledby="devices-title">
      <h2 id="devices-title">Devices</h2>
      <p className="muted">
        Browsers this wallet has signed in on. Forgetting one signs it out and makes its next sign-in count as new.
      </p>
      <DataTable
        caption="Devices this wallet has signed in on"
        page={asPage(devices.data)}
        loading={devices.loading}
        error={devices.error}
        empty="No devices yet."
        columns={[
          {
            key: 'label',
            header: 'Device',
            render: (row) => (
              <>
                {row.label} {row.current && <StatusBadge kind="accent">This device</StatusBadge>}
              </>
            ),
          },
          { key: 'firstSeenAt', header: 'First used', render: (row) => formatDate(row.firstSeenAt) },
          { key: 'lastSeenAt', header: 'Last used', render: (row) => formatDate(row.lastSeenAt) },
          {
            key: 'trustedUntil',
            header: 'Trusted',
            render: (row) => (row.trustedUntil ? `Until ${formatDate(row.trustedUntil)}` : 'No'),
          },
          {
            key: 'actions',
            header: 'Actions',
            render: (row) =>
              !row.current && (
                <button className="button button-small" onClick={() => forget(row.id)} disabled={busy !== null}>
                  {busy === row.id ? <Spinner label="Forgetting…" /> : 'Forget'}
                </button>
              ),
          },
        ]}
      />
      <ErrorAlert error={error} />
    </section>
  );
}

function BackupCodes({ codes }) {
  return (
    <Alert kind="success">
      <p>
        <strong>Your backup codes.</strong> Each works once if you cannot use your authenticator app. Store them somewhere
        safe now: they are not shown again.
      </p>
      <ul className="codes" aria-label="Backup codes">
        {codes.map((code) => (
          <li key={code} className="mono">
            {code}
          </li>
        ))}
      </ul>
    </Alert>
  );
}

function SecondStep({ onChange }) {
  const { user } = useAuth();
  const status = useApi('/api/users/second-step');
  const { busy, error, run } = useAction();
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState(null);
  const enabled = status.data?.enabled;

  async function withCode(name, path, action) {
    const result = await run(name, async () =>
      api.post(path, { code: code.trim(), ...(await withProof(user.walletAddress, action)) }),
    );
    if (result !== undefined) {
      setCode('');
      setSetup(null);
      setCodes(result?.backupCodes ?? null);
      status.reload();
      onChange();
    }
  }

  const codeField = (
    <TextField
      label={enabled ? 'Current code from your app, or a backup code' : 'Code shown in your app'}
      value={code}
      onChange={setCode}
      autoComplete="one-time-code"
      spellCheck={false}
      maxLength={20}
    />
  );

  return (
    <section className="result" aria-labelledby="second-step-title">
      <h2 id="second-step-title">Second step</h2>
      <p className="muted">
        With the second step on, a sign-in that does not look like your usual ones (a new device, a new network, or a
        wallet flagged as suspicious) also asks for a code from an authenticator app. Without it, such sign-ins are
        either allowed on the signature alone or refused. A device you pass it on becomes trusted for a while; the
        Devices list shows until when.
      </p>
      {status.loading && !status.data && <Spinner label="Loading…" />}
      <ErrorAlert error={status.error} />
      {codes && <BackupCodes codes={codes} />}

      {status.data && !enabled && !setup && (
        <div className="actions">
          <button
            className="button button-primary"
            onClick={async () => {
              const created = await run('setup', () => api.post('/api/users/second-step/setup'));
              if (created) setSetup(created);
            }}
            disabled={busy !== null}
          >
            {busy === 'setup' ? <Spinner label="Preparing…" /> : 'Set up the second step'}
          </button>
        </div>
      )}

      {setup && (
        <div className="result">
          <p>
            In your authenticator app, add an account with this key (time-based, 6 digits, every 30 seconds). Anyone who
            sees this key can make codes, so do not share it.
          </p>
          <dl className="facts">
            <div>
              <dt>Key</dt>
              <dd className="mono address-full">{setup.secret}</dd>
            </div>
            <div>
              <dt>Setup link</dt>
              <dd className="mono address-full">{setup.otpauthUri}</dd>
            </div>
          </dl>
          {codeField}
          <p className="hint">MetaMask then asks you to sign a confirmation.</p>
          <div className="actions">
            <button
              className="button button-primary"
              onClick={() => withCode('enable', '/api/users/second-step/enable', 'ENABLE_SECOND_STEP')}
              disabled={busy !== null || code.trim().length < 6}
            >
              {busy === 'enable' ? <Spinner label="Turning on…" /> : 'Turn on'}
            </button>
          </div>
        </div>
      )}

      {enabled && (
        <div className="result">
          <p>
            <StatusBadge kind="ok">On</StatusBadge> {status.data.backupCodesLeft} of 10 backup codes left.
          </p>
          {codeField}
          <p className="hint">Both actions also ask you to sign a confirmation in MetaMask.</p>
          <div className="actions">
            <button
              className="button"
              onClick={() => withCode('renew', '/api/users/second-step/backup-codes', 'RENEW_BACKUP_CODES')}
              disabled={busy !== null || code.trim().length < 6}
            >
              {busy === 'renew' ? <Spinner label="Replacing…" /> : 'Replace backup codes'}
            </button>
            <button
              className="button button-danger"
              onClick={() => withCode('disable', '/api/users/second-step/disable', 'DISABLE_SECOND_STEP')}
              disabled={busy !== null || code.trim().length < 6}
            >
              {busy === 'disable' ? <Spinner label="Turning off…" /> : 'Turn off'}
            </button>
          </div>
        </div>
      )}
      <ErrorAlert error={error} />
    </section>
  );
}

export function AccountSecurity() {
  const sessions = useApi('/api/users/sessions');
  const devices = useApi('/api/users/devices');
  const alerts = useApi('/api/users/alerts');
  const reloadAll = () => {
    sessions.reload();
    devices.reload();
    alerts.reload();
  };

  return (
    <>
      <h1>Account security</h1>
      <p className="lead">
        Where your wallet is signed in, the devices it has used, and the optional second step. Anyone who has your
        wallet can sign in as you: keep the recovery phrase offline, and act on any sign-in you do not recognise.
      </p>
      <SignInAlerts alerts={alerts} onChange={reloadAll} />
      <Sessions sessions={sessions} onChange={reloadAll} />
      <Devices devices={devices} onChange={reloadAll} />
      <SecondStep onChange={reloadAll} />
    </>
  );
}
