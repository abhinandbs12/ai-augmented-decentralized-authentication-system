/** A small busy indicator with the action it stands for, e.g. "Waiting for signature…". */
export function Spinner({ label }) {
  return (
    <span className="spinner-row" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </span>
  );
}
