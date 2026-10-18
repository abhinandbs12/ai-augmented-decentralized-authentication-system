// The only place that talks to the wallet. Users sign messages; they never send transactions,
// and the private key never leaves MetaMask.

export function isMetaMaskAvailable() {
  return typeof window.ethereum !== 'undefined';
}

export async function connectWallet() {
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  return accounts[0];
}

function toHexUtf8(text) {
  const bytes = new TextEncoder().encode(text);
  return '0x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signMessage(message, address) {
  // message must be the exact challenge text returned by the backend
  return window.ethereum.request({ method: 'personal_sign', params: [toHexUtf8(message), address] });
}

export function onAccountsChanged(callback) {
  window.ethereum?.on?.('accountsChanged', callback);
  return () => window.ethereum?.removeListener?.('accountsChanged', callback);
}
