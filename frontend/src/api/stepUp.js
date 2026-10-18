import { signMessage } from '../wallet/metamask';
import { api } from './client';

/**
 * Dangerous actions need a fresh signature on top of the session. The server issues a one-time message
 * naming the action and its parameters; the session's wallet signs it in MetaMask, where the person
 * can read exactly what they confirm. `parameters` must be the same values the action is sent with.
 */
export async function withProof(walletAddress, action, parameters = {}) {
  const issued = await api.post('/api/auth/step-up', { action, ...parameters });
  const signature = await signMessage(issued.challenge, walletAddress);
  return { proof: { challenge: issued.challenge, signature } };
}
