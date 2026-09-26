import type { HDNodeWallet, Wallet } from 'ethers';
import type { EthereumProvider } from './api';

// FR-01: a customer without a wallet extension creates a key pair in this
// browser. The private key never leaves the browser. It is kept only as a
// standard Ethereum keystore (scrypt and AES), encrypted with a passphrase that
// is never sent anywhere, and it signs exactly what MetaMask would sign, so the
// bank handles both the same way. ethers loads only when this path is used.

const STORAGE_KEY = 'demo-bank-browser-key';
export const MIN_PASSPHRASE_LENGTH = 10;

export interface SavedKey {
  address: string;
  keystore: string;
}

export function savedBrowserKey(): SavedKey | null {
  try {
    const keystore = localStorage.getItem(STORAGE_KEY);
    if (!keystore) return null;
    // A keystore names its account in lower case, without the 0x.
    const address: unknown = JSON.parse(keystore).address;
    return typeof address === 'string' ? { address: `0x${address}`, keystore } : null;
  } catch {
    return null;
  }
}

export async function createBrowserKey(passphrase: string): Promise<{ saved: SavedKey; signer: EthereumProvider }> {
  if (!window.crypto?.getRandomValues) {
    throw new Error('This browser cannot create keys safely. Use a current browser, or a wallet extension.');
  }
  const { Wallet } = await import('ethers');
  const wallet = Wallet.createRandom();
  const keystore = await wallet.encrypt(passphrase);
  try {
    localStorage.setItem(STORAGE_KEY, keystore);
  } catch {
    throw new Error('This browser would not save the key (private windows can block it). Use a normal window.');
  }
  return { saved: { address: wallet.address, keystore }, signer: await signerFor(wallet) };
}

// Decrypts the key for one sign-in. App drops the signer when the sign-in ends.
export async function unlockBrowserKey(passphrase: string): Promise<EthereumProvider> {
  const saved = savedBrowserKey();
  if (!saved) {
    throw new Error('There is no key in this browser.');
  }
  const { Wallet } = await import('ethers');
  let wallet: Wallet | HDNodeWallet;
  try {
    wallet = await Wallet.fromEncryptedJson(saved.keystore, passphrase);
  } catch {
    throw new Error('That passphrase does not unlock the key in this browser.');
  }
  return signerFor(wallet);
}

export function forgetBrowserKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing was saved.
  }
}

// The backup is the encrypted keystore itself: useless without the passphrase,
// and importable into MetaMask (Import account, JSON file).
export function downloadBackup(saved: SavedKey): void {
  const url = URL.createObjectURL(new Blob([saved.keystore], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `demo-bank-key-${saved.address.slice(2, 10).toLowerCase()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The same request interface a wallet extension offers (EIP-1193), limited to
// what sign-in needs: the account, and a personal_sign over the nonce bytes.
async function signerFor(wallet: Wallet | HDNodeWallet): Promise<EthereumProvider> {
  const { getBytes } = await import('ethers');
  return {
    async request({ method, params }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
        return [wallet.address];
      }
      if (method === 'personal_sign') {
        const [message, account] = (params ?? []) as [string, string];
        if (account?.toLowerCase() !== wallet.address.toLowerCase()) {
          throw new Error('The key in this browser cannot sign for that account.');
        }
        return wallet.signMessage(getBytes(message));
      }
      throw new Error(`The key in this browser does not support ${method}.`);
    },
  };
}
