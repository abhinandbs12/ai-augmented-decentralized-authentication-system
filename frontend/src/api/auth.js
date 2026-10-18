import { signMessage } from '../wallet/metamask';
import { api } from './client';

const ENDPOINTS = {
  register: { challenge: '/api/auth/register/challenge', submit: '/api/auth/register' },
  login: { challenge: '/api/auth/challenge', submit: '/api/auth/verify' },
};

/**
 * The challenge-response sequence shared by registration and login: request a challenge, have the
 * wallet sign it, send the signature back. `onStep` is told which phase is running so the page can
 * show it.
 *
 * The challenge text goes to MetaMask and back to the server exactly as received. Changing a single
 * character would make the signature invalid; the server compares against its own stored copy.
 */
export async function signAndSubmit(kind, walletAddress, onStep) {
  const endpoints = ENDPOINTS[kind];
  onStep({ phase: 'challenge' });
  const issued = await api.post(endpoints.challenge, { walletAddress });
  onStep({ phase: 'signing', challenge: issued.challenge, expiresAt: issued.expiresAt });
  const signature = await signMessage(issued.challenge, walletAddress);
  onStep({ phase: 'submitting' });
  return api.post(endpoints.submit, { walletAddress, challenge: issued.challenge, signature });
}
