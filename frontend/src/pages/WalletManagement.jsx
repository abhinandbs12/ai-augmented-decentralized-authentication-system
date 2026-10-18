import { useState } from 'react';
import { Link } from 'react-router-dom';
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
import { useAuth } from '../context/AuthContext';
import { formatDate, isValidAddress } from '../utils/format';

const CHAIN_STATUS = {
  ACTIVE: 'Registered and active: this wallet can log in.',
  REVOKED: 'Registered but revoked: this wallet cannot log in.',
  NOT_REGISTERED: 'Not registered on the blockchain.',
};

export function WalletManagement() {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const users = useApi(`/api/admin/users${query({ page, size: 20, status, role })}`);
  // Reactivations already waiting, so the page does not offer (and ask MetaMask for) a second one.
  const waiting = useApi('/api/admin/actions?status=PENDING&size=100');
  const pendingFor = (wallet) =>
    waiting.data?.items.find(
      (a) => a.action === 'ACTIVATE_WALLET' && a.targetWallet?.toLowerCase() === wallet.toLowerCase(),
    );

  const [lookup, setLookup] = useState('');
  const [lookupInvalid, setLookupInvalid] = useState(false);
  const [checking, setChecking] = useState(false);
  const [chain, setChain] = useState(null);

  const [pending, setPending] = useState(null); // { wallet, action: 'revoke' | 'activate' }
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(null);
  const [scheduled, setScheduled] = useState(null);
  const [error, setError] = useState(null);

  const isOwnWallet = (wallet) => wallet.toLowerCase() === user.walletAddress.toLowerCase();

  function filter(setter) {
    return (value) => {
      setter(value);
      setPage(0);
    };
  }

  async function checkOnChain(wallet) {
    setError(null);
    setChanged(null);
    setScheduled(null);
    setChecking(true);
    try {
      setChain(await api.get(`/api/blockchain/wallet/${wallet}`));
      // Reading the chain also corrects the stored status, so the list may have changed.
      users.reload();
    } catch (e) {
      setChain(null);
      setError(e);
    } finally {
      setChecking(false);
    }
  }

  function submitLookup(event) {
    event.preventDefault();
    const valid = isValidAddress(lookup);
    setLookupInvalid(!valid);
    if (valid) checkOnChain(lookup);
  }

  async function confirmChange() {
    setBusy(true);
    setError(null);
    setChanged(null);
    setScheduled(null);
    try {
      const { wallet, action } = pending;
      const proof = await withProof(user.walletAddress, action === 'revoke' ? 'REVOKE_WALLET' : 'ACTIVATE_WALLET', {
        walletAddress: wallet,
      });
      const result = await api.post(`/api/admin/wallet/${wallet}/${action}`, proof);
      // A revocation happens at once; a reactivation is a request that waits.
      if (action === 'revoke') setChanged(result);
      else setScheduled(result);
      setChain(null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      setPending(null);
      users.reload();
      waiting.reload();
    }
  }

  function changeButton(wallet, active) {
    const action = active ? 'revoke' : 'activate';
    const own = isOwnWallet(wallet);
    const pending = !active && pendingFor(wallet);
    if (pending) {
      return (
        <span className="muted">
          Reactivation at {formatDate(pending.executeAfter)} (<Link to="/admin/controls">cancel</Link>)
        </span>
      );
    }
    return (
      <button
        className={`button button-small ${active ? 'button-danger' : ''}`}
        disabled={own}
        title={own ? 'You cannot change the status of your own wallet' : undefined}
        onClick={() => setPending({ wallet, action })}
      >
        {active ? 'Revoke' : 'Activate'}
      </button>
    );
  }

  return (
    <>
      <h1>Wallet management</h1>
      <p className="lead">
        Revoking a wallet is written to the blockchain at once. The wallet is signed out on its next request and cannot
        log in again until it is reactivated. Reactivating waits before it takes effect, so a mistaken or forced
        request can still be cancelled. Both ask you to sign a confirmation in MetaMask.
      </p>

      <form className="lookup" onSubmit={submitLookup} noValidate>
        <AddressField
          label="Check any wallet on the blockchain"
          value={lookup}
          onChange={(value) => {
            setLookup(value);
            setLookupInvalid(false);
          }}
          error={lookupInvalid ? 'Not a valid Ethereum address' : null}
        />
        <button className="button" type="submit" disabled={checking}>
          {checking ? <Spinner label="Reading the blockchain…" /> : 'Check on-chain'}
        </button>
      </form>

      <ErrorAlert error={error} />
      {changed && (
        <Alert kind="success">
          <p>
            Wallet <Address value={changed.walletAddress} /> is now {changed.status.toLowerCase()}.
          </p>
          <details>
            <summary>Transaction details</summary>
            <dl className="details-list">
              <dt>Wallet</dt>
              <dd className="mono">{changed.walletAddress}</dd>
              <dt>Transaction</dt>
              <dd className="mono">{changed.transactionHash}</dd>
            </dl>
          </details>
        </Alert>
      )}
      {scheduled && (
        <Alert kind="info">
          <p>
            Reactivation of <Address value={scheduled.targetWallet} /> is requested. The server carries it out at{' '}
            {formatDate(scheduled.executeAfter)} unless an administrator cancels it under{' '}
            <Link to="/admin/controls">Controls</Link>.
          </p>
        </Alert>
      )}
      {chain && (
        <section className="result" aria-label="On-chain status">
          <dl className="facts">
            <div>
              <dt>Wallet address</dt>
              <dd className="mono address-full">{chain.walletAddress}</dd>
            </div>
            <div>
              <dt>On-chain status</dt>
              <dd>
                <StatusBadge value={chain.status} /> {CHAIN_STATUS[chain.status]}
              </dd>
            </div>
            <div>
              <dt>Registered on-chain at</dt>
              <dd>{formatDate(chain.registeredAt) || 'Never'}</dd>
            </div>
          </dl>
          {chain.registered && <div className="actions">{changeButton(chain.walletAddress, chain.active)}</div>}
        </section>
      )}

      <h2>Registered users</h2>
      <div className="filters">
        <SelectFilter label="Status" value={status} onChange={filter(setStatus)} options={['ACTIVE', 'REVOKED']} allLabel="Any status" />
        <SelectFilter label="Role" value={role} onChange={filter(setRole)} options={['USER', 'ADMIN']} allLabel="Any role" />
      </div>
      <DataTable
        caption="Registered users and their wallets"
        page={users.data}
        loading={users.loading}
        error={users.error}
        empty="No wallets match these filters."
        columns={[
          { key: 'walletAddress', header: 'Wallet', render: (row) => <Address value={row.walletAddress} /> },
          { key: 'role', header: 'Role', render: (row) => <StatusBadge value={row.role} /> },
          { key: 'status', header: 'Status', render: (row) => <StatusBadge value={row.status} /> },
          { key: 'createdAt', header: 'Registered', render: (row) => formatDate(row.createdAt) },
          { key: 'updatedAt', header: 'Last change', render: (row) => formatDate(row.updatedAt) },
          {
            key: 'actions',
            header: 'Actions',
            render: (row) => (
              <div className="row-actions">
                <button className="button button-small" onClick={() => checkOnChain(row.walletAddress)}>
                  Check on-chain
                </button>
                {changeButton(row.walletAddress, row.status === 'ACTIVE')}
              </div>
            ),
          },
        ]}
      />
      <Pagination page={users.data} onChange={setPage} />

      <ConfirmDialog
        open={pending !== null}
        title={pending?.action === 'revoke' ? 'Revoke this wallet?' : 'Reactivate this wallet?'}
        confirmLabel={pending?.action === 'revoke' ? 'Revoke wallet' : 'Request reactivation'}
        danger={pending?.action === 'revoke'}
        busy={busy}
        onConfirm={confirmChange}
        onCancel={() => setPending(null)}
      >
        <p className="mono address-full">{pending?.wallet}</p>
        <p>
          {pending?.action === 'revoke'
            ? 'The wallet will be signed out on its next request and cannot log in until it is reactivated. This is recorded on the blockchain and in the audit log.'
            : 'After the waiting period the server reactivates the wallet on the blockchain and it can log in again. Any administrator can cancel the request until then.'}
        </p>
        <p className="hint">
          MetaMask then asks you to sign a confirmation naming this wallet. Check it before you approve.
        </p>
      </ConfirmDialog>
    </>
  );
}
