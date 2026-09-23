// Small helpers shared by the customer screens. Everything goes through the
// gateway on /api, which is the only backend the browser is allowed to call.

export interface ApiError {
  code: string;
  message: string;
  request_id?: string;
  attempts_remaining?: number;
}

export async function postJson<T>(path: string, body: unknown, sessionToken?: string): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok && payload.error) {
    throw Object.assign(new Error(payload.error.message), payload.error as ApiError);
  }
  return payload as T;
}

// A stable-enough identifier for this browser: the same value every visit, and
// the 64 hex characters the backend expects.
export async function deviceFingerprint(): Promise<string> {
  const material = `${navigator.userAgent}|${screen.width}x${screen.height}|${screen.colorDepth}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

function wallet(): EthereumProvider {
  const provider = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  if (!provider) {
    throw new Error('No wallet extension found. Install MetaMask to continue.');
  }
  return provider;
}

export async function connectWallet(): Promise<string> {
  const accounts = (await wallet().request({ method: 'eth_requestAccounts' })) as string[];
  if (!accounts?.length) {
    throw new Error('No account was shared by the wallet.');
  }
  return accounts[0];
}

// The contract hashes the raw 32 nonce bytes, so the wallet has to sign the
// bytes and not the text of the nonce.
export async function signNonce(walletAddress: string, nonce: string): Promise<string> {
  return (await wallet().request({
    method: 'personal_sign',
    params: [`0x${nonce}`, walletAddress],
  })) as string;
}
