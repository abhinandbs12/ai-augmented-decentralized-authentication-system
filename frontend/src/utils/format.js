const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Convenience check only; the server validates every address again. */
export function isValidAddress(value) {
  return ADDRESS.test(value);
}

/** True while the text could still become an address, so a half-typed one is not flagged as wrong. */
export function isPartialAddress(value) {
  return /^(0|0x[0-9a-fA-F]{0,40})$/.test(value);
}

/** 0x1234567890abcdef... -> 0x1234…cdef */
export function shortAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** WALLET_REVOKED -> "Wallet revoked". The acronyms CSRF and IP stay upper-case. */
export function label(value) {
  if (!value) return '';
  const text = String(value).replaceAll('_', ' ').toLowerCase();
  return (text.charAt(0).toUpperCase() + text.slice(1)).replace(/\b(csrf|ip)\b/gi, (word) => word.toUpperCase());
}

export function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' }) : '';
}
