import { shortAddress } from '../utils/format';

/** A wallet address shortened for reading, with the full address in the tooltip. */
export function Address({ value }) {
  if (!value) return <span className="muted">None</span>;
  return (
    <span className="mono" title={value}>
      {shortAddress(value)}
    </span>
  );
}
