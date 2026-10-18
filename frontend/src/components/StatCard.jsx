/** One number with its label. Must be placed inside a <dl>. tone: ok | danger */
export function StatCard({ label, value, tone }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd className={tone ? `tone-${tone}` : undefined}>{value}</dd>
    </div>
  );
}
