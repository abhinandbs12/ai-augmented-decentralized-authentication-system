// The browser talks only to the gateway on /api, which rate-limits, validates
// and forwards to the orchestrator.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    readonly attemptsRemaining?: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

async function send<T>(path: string, init: RequestInit, sessionToken?: string | null): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'We could not reach the bank. Check that the service is running and try again.');
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    // A blocked login answers 403 with a decision rather than an error envelope.
    if (payload.decision) {
      return payload as T;
    }
    const error = payload.error ?? {};
    throw new ApiError(
      response.status,
      error.code ?? 'UNKNOWN',
      error.message ?? 'Something went wrong. Please try again.',
      error.request_id,
      error.attempts_remaining,
      error.retry_after_seconds,
    );
  }
  return payload as T;
}

export const postJson = <T>(path: string, body: unknown, sessionToken?: string | null) =>
  send<T>(path, { method: 'POST', body: JSON.stringify(body) }, sessionToken);

export const getJson = <T>(path: string, sessionToken?: string | null) =>
  send<T>(path, { method: 'GET' }, sessionToken);

// A stable identifier for this browser in the 64-hex format the backend expects.
export async function deviceFingerprint(): Promise<string> {
  const material = `${navigator.userAgent}|${screen.width}x${screen.height}|${screen.colorDepth}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

// A key created in this browser (FR-01) signs for the current sign-in in place
// of the wallet extension. null means the extension.
let browserSigner: EthereumProvider | null = null;

export function setBrowserSigner(signer: EthereumProvider | null): void {
  browserSigner = signer;
}

export const usingBrowserSigner = (): boolean => browserSigner !== null;

function wallet(): EthereumProvider {
  if (browserSigner) {
    return browserSigner;
  }
  const provider = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  if (!provider) {
    throw new Error(
      'No wallet extension found. Install MetaMask and reload this page, or open an account with a key created in this browser.',
    );
  }
  return provider;
}

export async function connectWallet(): Promise<string> {
  try {
    const accounts = (await wallet().request({ method: 'eth_requestAccounts' })) as string[];
    if (!accounts?.length) {
      throw new Error('Your wallet did not share an account.');
    }
    return accounts[0];
  } catch (error) {
    throw walletError(error);
  }
}

// The contract hashes the raw 32 nonce bytes, so the wallet signs the bytes,
// not the text of the nonce.
export async function signNonce(walletAddress: string, nonce: string): Promise<string> {
  try {
    return (await wallet().request({ method: 'personal_sign', params: [`0x${nonce}`, walletAddress] })) as string;
  } catch (error) {
    throw walletError(error);
  }
}

function walletError(error: unknown): Error {
  if ((error as { code?: number })?.code === 4001) {
    return new Error('You declined the request in your wallet. Nothing was signed.');
  }
  return error instanceof Error ? error : new Error('Your wallet could not complete the request.');
}
