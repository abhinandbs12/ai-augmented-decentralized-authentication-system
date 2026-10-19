import { label } from '../utils/format';

const KIND = {
  ACTIVE: 'ok',
  SUCCESS: 'ok',
  EXECUTED: 'ok',
  REVOKED: 'danger',
  FAILURE: 'danger',
  FAILED: 'danger',
  BLOCKED: 'warn',
  PENDING: 'warn',
  ADMIN: 'accent',
};

/** A status as a word, shaped by meaning (see .badge in global.css). The word always carries the meaning. */
export function StatusBadge({ value, kind, children }) {
  return <span className={`badge badge-${kind ?? KIND[value] ?? 'neutral'}`}>{children ?? label(value)}</span>;
}
