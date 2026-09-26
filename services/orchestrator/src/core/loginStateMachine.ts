import type { LRUCache } from '../ds/lruCache';
import type { RiskEngine, RiskScore } from './riskEngineClient';

// Trust Score bands (PRD FR-10 to FR-12): 90-100 allow, 50-89 OTP, 0-49 blocked.
const ALLOW_MIN_SCORE = 90;
const OTP_MIN_SCORE = 50;

// NFR-10: if the risk engine cannot answer, treat the login as medium risk. Never fail open.
const FALLBACK_TRUST_SCORE = 70;

export interface CachedSession {
  walletAddress: string;
  expiresAt: number;
}

export interface IssuedNonce {
  challengeId: string;
  nonce: string;
  expiresAt: Date;
}

export interface LoginRequest {
  walletAddress: string;
  deviceFingerprint: string;
  ipAddress: string;
  sessionToken?: string;
}

// Collaborators are passed in, so this module never talks to a database, the
// risk engine or a teammate's module directly, and tests can use simple fakes.
export interface LoginDependencies {
  // Keyed by session token (TRD §11.3).
  sessionCache: LRUCache<string, CachedSession>;
  riskEngine: RiskEngine;
  // The score and its reasons are passed on, because the challenge belongs to a
  // scored attempt and the event written after verification reports them.
  issueNonce(walletAddress: string, score: RiskScore): Promise<IssuedNonce>;
  startOtpChallenge(walletAddress: string, score: RiskScore): Promise<string>;
}

export type LoginResult =
  | { state: 'SESSION_ACTIVE' }
  | { state: 'CHALLENGE_ISSUED'; trustScore: number; reasons: string[]; nonce: IssuedNonce }
  | { state: 'OTP_PENDING'; trustScore: number; reasons: string[]; otpChallengeId: string }
  | { state: 'BLOCKED'; trustScore: number; reasons: string[] };

// First step of a login (POST /api/auth/login). The Trust Score picks the path before any
// signature challenge exists; the signature is checked later by POST /api/auth/verify.
export async function handleLogin(
  request: LoginRequest,
  deps: LoginDependencies,
): Promise<LoginResult> {
  if (hasActiveSession(request, deps.sessionCache)) {
    return { state: 'SESSION_ACTIVE' };
  }

  const { trustScore, reasons } = await scoreLogin(request, deps.riskEngine);

  if (trustScore >= ALLOW_MIN_SCORE) {
    const nonce = await deps.issueNonce(request.walletAddress, { trustScore, reasons });
    return { state: 'CHALLENGE_ISSUED', trustScore, reasons, nonce };
  }

  if (trustScore >= OTP_MIN_SCORE) {
    const otpChallengeId = await deps.startOtpChallenge(request.walletAddress, { trustScore, reasons });
    return { state: 'OTP_PENDING', trustScore, reasons, otpChallengeId };
  }

  // No challenge of any kind is created. The /login route still reports the
  // attempt, with decision "blocked", so it is recorded in login_events.
  return { state: 'BLOCKED', trustScore, reasons };
}

// A session is reused only when the caller presents its token. Looking sessions up by
// wallet address alone would hand a session to anyone who knows a public address.
function hasActiveSession(
  request: LoginRequest,
  sessionCache: LRUCache<string, CachedSession>,
): boolean {
  if (!request.sessionToken) {
    return false;
  }

  const session = sessionCache.get(request.sessionToken);
  return (
    session !== undefined &&
    session.walletAddress.toLowerCase() === request.walletAddress.toLowerCase() &&
    session.expiresAt > Date.now()
  );
}

async function scoreLogin(request: LoginRequest, riskEngine: RiskEngine): Promise<RiskScore> {
  try {
    return await riskEngine.score({
      walletAddress: request.walletAddress,
      ipAddress: request.ipAddress,
      deviceFingerprint: request.deviceFingerprint,
      timestamp: new Date(),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`Risk engine unavailable, routing login to OTP step-up: ${reason}`);
    return { trustScore: FALLBACK_TRUST_SCORE, reasons: [] };
  }
}
