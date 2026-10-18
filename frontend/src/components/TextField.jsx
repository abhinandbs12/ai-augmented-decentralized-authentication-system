import { useId } from 'react';

/** A labelled text input with an optional hint and error, both announced with the field. */
export function TextField({ label, value, onChange, error, hint, ...input }) {
  const id = useId();
  const described = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={described}
        {...input}
      />
      {hint && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
