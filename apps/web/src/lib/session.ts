// The signed-in session lives for the tab only (sessionStorage): the token is a
// bearer credential, so it never outlives the window that earned it.
export interface Session {
  token: string;
  wallet: string;
  trustScore: number;
  factors: string[];
  path: 'signature' | 'code';
  expiresAt: string;
}

const KEY = 'demo-bank-session';

export function loadSession(): Session | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Session | null;
    return stored && new Date(stored.expiresAt).getTime() > Date.now() ? stored : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  try {
    if (session) {
      sessionStorage.setItem(KEY, JSON.stringify(session));
    } else {
      sessionStorage.removeItem(KEY);
    }
  } catch {
    // Storage can be unavailable (private mode); the session then lasts for this page only.
  }
}
