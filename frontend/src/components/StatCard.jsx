/** One number with its label. Must be placed inside a <dl>. */
export function StatCard({ label, value }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
