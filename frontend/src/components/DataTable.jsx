import { ErrorAlert } from './Alert';
import { Spinner } from './Spinner';

/**
 * columns: [{ key, header, render?(row), wrap? }], where `wrap` marks free text that may wrap; page: a paged
 * API response. Loading, error and empty states are shown in place, so a page never has to branch on them.
 */
export function DataTable({ columns, page, loading, error, empty, caption }) {
  const rows = page?.items ?? [];
  return (
    <div className="table-wrap" aria-busy={loading}>
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={loading && rows.length ? 'is-stale' : undefined}>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.key} className={column.wrap ? 'cell-wrap' : undefined}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <ErrorAlert error={error} />
      {!error && loading && !rows.length && (
        <p className="table-note">
          <Spinner label="Loading…" />
        </p>
      )}
      {!error && !loading && !rows.length && <p className="table-note muted">{empty}</p>}
    </div>
  );
}
