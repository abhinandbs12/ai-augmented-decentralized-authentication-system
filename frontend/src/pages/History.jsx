import { useState } from 'react';
import { query, useApi } from '../api/useApi';
import { DataTable } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { SelectFilter } from '../components/SelectFilter';
import { StatusBadge } from '../components/StatusBadge';
import { USER_EVENT_TYPES } from '../utils/events';
import { formatDate, label } from '../utils/format';


export function History() {
  const [page, setPage] = useState(0);
  const [eventType, setEventType] = useState('');
  const history = useApi(`/api/users/authentication-history${query({ page, size: 20, eventType })}`);

  return (
    <>
      <h1>Authentication history</h1>
      <p className="lead">
        Every attempt made with your wallet, including ones that were refused. Failed attempts you do not recognize
        mean someone else tried to use your address; without your key they cannot sign in.
      </p>
      <div className="filters">
        <SelectFilter
          label="Event"
          value={eventType}
          onChange={(value) => {
            setEventType(value);
            setPage(0);
          }}
          options={USER_EVENT_TYPES}
          allLabel="All events"
        />
      </div>
      <DataTable
        caption="Your authentication events, newest first"
        page={history.data}
        loading={history.loading}
        error={history.error}
        empty="No authentication events yet."
        columns={[
          { key: 'occurredAt', header: 'Date', render: (row) => formatDate(row.occurredAt) },
          { key: 'eventType', header: 'Event', render: (row) => label(row.eventType) },
          { key: 'eventStatus', header: 'Status', render: (row) => <StatusBadge value={row.eventStatus} /> },
          { key: 'failureReason', header: 'Reason', render: (row) => label(row.failureReason) },
          { key: 'ipAddress', header: 'IP address', render: (row) => <span className="mono">{row.ipAddress}</span> },
        ]}
      />
      <Pagination page={history.data} onChange={setPage} />
    </>
  );
}
