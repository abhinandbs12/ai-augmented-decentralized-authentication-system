import { useEffect, useRef } from 'react';
import { Spinner } from './Spinner';

/**
 * Asks before an action that is hard to undo. Built on the native <dialog>: focus trapping, Escape
 * and the backdrop come from the browser.
 */
export function ConfirmDialog({ open, title, children, confirmLabel, danger, busy, onConfirm, onCancel }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Escape would close the dialog on its own; closing is left to the `open` prop so that the dialog
  // and the page state cannot disagree, and so that it stays open while the action is running.
  function handleEscape(event) {
    event.preventDefault();
    if (!busy) onCancel();
  }

  return (
    <dialog ref={ref} className="dialog" onCancel={handleEscape} aria-labelledby="dialog-title">
      <h2 id="dialog-title">{title}</h2>
      <div className="dialog-body">{children}</div>
      <div className="actions">
        <button className="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className={`button ${danger ? 'button-danger' : 'button-primary'}`} onClick={onConfirm} disabled={busy}>
          {busy ? <Spinner label="Working…" /> : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
