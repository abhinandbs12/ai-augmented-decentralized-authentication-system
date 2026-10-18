import { label as readable } from '../utils/format';

/** A labelled dropdown over a fixed list of server enum values, with an "all" choice first. */
export function SelectFilter({ label, value, onChange, options, allLabel }) {
  return (
    <label className="field">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {readable(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
