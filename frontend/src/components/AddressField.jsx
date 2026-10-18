import { useId } from 'react';

/**
 * A text field for a wallet address. `error` is shown under the field and announced with it.
 * Validation here is a convenience; the server checks every address again.
 */
export function AddressField({ label, value, onChange, onBlur, error }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        className="mono"
        value={value}
        onChange={(event) => onChange(event.target.value.trim())}
        onBlur={onBlur}
        placeholder="0x…"
        spellCheck={false}
        autoComplete="off"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
