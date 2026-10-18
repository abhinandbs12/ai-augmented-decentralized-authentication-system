import { label } from '../utils/format';

const KIND = {
  ACTIVE: 'ok',
  SUCCESS: 'ok',
  REVOKED: 'danger',
  FAILURE: 'danger',
  BLOCKED: 'warn',
  ADMIN: 'accent',
};

/** A status as a word, colored by meaning. The word always carries the meaning; color only supports it. */
export function StatusBadge({ value, kind, children }) {
  return <span className={`badge badge-${kind ?? KIND[value] ?? 'neutral'}`}>{children ?? label(value)}</span>;
}
