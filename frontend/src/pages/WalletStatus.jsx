import { useApi } from '../api/useApi';
import { ErrorAlert } from '../components/Alert';
import { Spinner } from '../components/Spinner';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate } from '../utils/format';

const MEANING = {
  ACTIVE: 'This wallet is registered and active. It can be used to log in.',
  REVOKED: 'An administrator has revoked this wallet. It cannot log in until it is reactivated.',
  NOT_REGISTERED: 'This wallet is not in the registry. Register it before logging in.',
};

export function WalletStatus() {
  const status = useApi('/api/users/wallet-status');
  const data = status.data;
  return (
    <>
      <h1>Wallet status</h1>
      <p className="lead">
        Read directly from the WalletRegistry smart contract. This on-chain record, not the BlockAuth database, decides
        whether a wallet may log in.
      </p>
      <ErrorAlert error={status.error} />
      {status.loading && !data && <Spinner label="Reading the blockchain…" />}
      {data && (
        <dl className="facts">
          <div>
            <dt>Wallet address</dt>
            <dd className="mono address-full">{data.walletAddress}</dd>
          </div>
          <div>
            <dt>On-chain status</dt>
            <dd>
              <StatusBadge value={data.status} /> {MEANING[data.status]}
            </dd>
          </div>
          <div>
            <dt>Registered</dt>
            <dd>{data.registered ? 'Yes' : 'No'}</dd>
          </div>
          <div>
            <dt>Active</dt>
            <dd>{data.active ? 'Yes' : 'No'}</dd>
          </div>
          <div>
            <dt>Revoked</dt>
            <dd>{data.registered && !data.active ? 'Yes' : 'No'}</dd>
          </div>
          <div>
            <dt>Registered on-chain at</dt>
            <dd>{formatDate(data.registeredAt) || 'Not registered'}</dd>
          </div>
        </dl>
      )}
      <div className="actions">
        <button className="button" onClick={status.reload} disabled={status.loading}>
          {status.loading && data ? <Spinner label="Refreshing…" /> : 'Refresh from blockchain'}
        </button>
      </div>
    </>
  );
}
