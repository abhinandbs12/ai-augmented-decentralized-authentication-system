import { randomUUID } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import type { Pool } from 'pg';
import type { MerkleBatcher } from '../audit/batcher';
import type { AuditEvent } from '../audit/merkleTree';
import { ChainError, type AuthRegistryClient } from '../chain/authRegistryClient';
import type { EventReporter, LoginEventReport } from '../core/eventReporter';
import { handleLogin, type CachedSession } from '../core/loginStateMachine';
import type { NonceService } from '../core/nonces';
import type { RiskEngine } from '../core/riskEngineClient';
import type { SessionStore } from '../core/sessions';
import { findUserByWallet, insertUser, markLoggedIn } from '../db/users';
import type { LRUCache } from '../ds/lruCache';
import { sendError, type ErrorCode } from '../errors';
import type { OtpService } from '../otp/otpService';
import type { Realtime } from '../realtime/socket';
import {
  asyncRoute,
  clientIp,
  isHex32Bytes,
  isOtpCode,
  isSignature,
  isUuid,
  isWalletAddress,
} from './validators';

export interface AuthDependencies {
  pool: Pool;
  sessions: SessionStore;
  sessionCache: LRUCache<string, CachedSession>;
  nonces: NonceService;
  otp: OtpService;
  chain: AuthRegistryClient;
  riskEngine: RiskEngine;
  events: EventReporter;
  batcher: MerkleBatcher;
  realtime: Realtime;
  requireSession: RequestHandler;
}

const CHAIN_ERROR_RESPONSES: Record<string, ErrorCode> = {
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  NONCE_USED: 'NONCE_USED',
  AUTH_PAUSED: 'AUTH_PAUSED',
  NOT_REGISTERED: 'NOT_REGISTERED',
  ALREADY_REGISTERED: 'ALREADY_REGISTERED',
  CHAIN_UNAVAILABLE: 'CHAIN_UNAVAILABLE',
};

export function createAuthRoutes(deps: AuthDependencies): Router {
  const router = Router();

  // FR-01 to FR-04. The wallet is registered on-chain by the admin account and
  // the off-chain profile is created alongside it.
  router.post(
    '/register',
    asyncRoute(async (req, res) => {
      const { wallet_address: walletAddress, display_name: displayName, phone_number: phoneNumber } = req.body ?? {};
      if (!isWalletAddress(walletAddress)) {
        sendError(res, 'INVALID_REQUEST');
        return;
      }

      if (await findUserByWallet(deps.pool, walletAddress)) {
        sendError(res, 'ALREADY_REGISTERED');
        return;
      }

      let txHash: string | null = null;
      try {
        ({ txHash } = await deps.chain.registerUser(walletAddress));
      } catch (error) {
        const chainError = error as ChainError;
        // Already on-chain but with no profile: a previous attempt stopped
        // half way, so finish it instead of refusing forever.
        if (chainError.code !== 'ALREADY_REGISTERED') {
          sendError(res, CHAIN_ERROR_RESPONSES[chainError.code] ?? 'CHAIN_UNAVAILABLE');
          return;
        }
      }

      const user = await insertUser(deps.pool, {
        walletAddress,
        displayName: typeof displayName === 'string' ? displayName : undefined,
        phoneNumber: typeof phoneNumber === 'string' ? phoneNumber : undefined,
      });

      if (user === null) {
        sendError(res, 'ALREADY_REGISTERED');
        return;
      }

      res.status(201).json({ wallet_address: user.walletAddress, registered: true, tx_hash: txHash });
    }),
  );

  // A nonce on its own grants nothing, so this endpoint does not reveal whether
  // the wallet is registered; the signature check decides that later.
  router.post(
    '/nonce',
    asyncRoute(async (req, res) => {
      const walletAddress = req.body?.wallet_address;
      if (!isWalletAddress(walletAddress)) {
        sendError(res, 'INVALID_REQUEST');
        return;
      }

      const nonce = await deps.nonces.issue(walletAddress, 0);
      res.json({
        wallet_address: walletAddress,
        nonce: nonce.nonce,
        challenge_id: nonce.challengeId,
        expires_at: nonce.expiresAt.toISOString(),
      });
    }),
  );

  // Step one of a login: score the attempt and route it. No signature challenge
  // exists before this decision (FR-09, TRD §6.3).
  router.post(
    '/login',
    asyncRoute(async (req, res) => {
      const { wallet_address: walletAddress, device_fingerprint: deviceFingerprint } = req.body ?? {};
      if (!isWalletAddress(walletAddress) || !isHex32Bytes(deviceFingerprint)) {
        sendError(res, 'INVALID_REQUEST');
        return;
      }

      const ipAddress = clientIp(req);
      const user = await findUserByWallet(deps.pool, walletAddress);

      const result = await handleLogin(
        {
          walletAddress,
          deviceFingerprint,
          ipAddress,
          sessionToken: bearerToken(req.headers.authorization),
        },
        {
          sessionCache: deps.sessionCache,
          riskEngine: deps.riskEngine,
          issueNonce: (wallet, trustScore) => deps.nonces.issue(wallet, trustScore),
          startOtpChallenge: (wallet, trustScore) =>
            deps.otp.start(wallet, user?.phoneNumber ?? null, trustScore),
        },
      );

      if (result.state === 'SESSION_ACTIVE') {
        res.json({ decision: 'allow', session_active: true });
        return;
      }

      const decision = DECISIONS[result.state];
      await reportAttempt(deps, {
        eventId: eventIdOf(result),
        walletAddress,
        ipAddress,
        deviceFingerprint,
        trustScore: result.trustScore,
        decision,
        timestamp: new Date(),
        verified: false,
      });

      if (result.state === 'CHALLENGE_ISSUED') {
        res.json({
          decision,
          trust_score: result.trustScore,
          factors: result.reasons,
          nonce: result.nonce.nonce,
          challenge_id: result.nonce.challengeId,
          expires_at: result.nonce.expiresAt.toISOString(),
        });
        return;
      }

      if (result.state === 'OTP_PENDING') {
        res.json({
          decision,
          trust_score: result.trustScore,
          factors: result.reasons,
          otp_challenge_id: result.otpChallengeId,
        });
        return;
      }

      res.status(403).json({
        decision,
        trust_score: result.trustScore,
        reason: 'risk_threshold',
        request_id: res.locals.requestId,
      });
    }),
  );

  // Step two: the signature is checked on-chain, which is also where the nonce
  // is consumed for the second time (FR-06, FR-07).
  router.post(
    '/verify',
    asyncRoute(async (req, res) => {
      const { wallet_address: walletAddress, nonce, signature } = req.body ?? {};
      if (!isWalletAddress(walletAddress) || !isHex32Bytes(nonce) || !isSignature(signature)) {
        sendError(res, 'INVALID_REQUEST');
        return;
      }

      const consumption = await deps.nonces.consume(walletAddress, nonce);
      if (consumption.status !== 'consumed') {
        sendError(res, consumption.status === 'expired' ? 'NONCE_EXPIRED' : 'NONCE_USED');
        return;
      }

      try {
        await deps.chain.verifySignature(walletAddress, nonce, signature);
      } catch (error) {
        const chainError = error as ChainError;
        sendError(res, CHAIN_ERROR_RESPONSES[chainError.code] ?? 'CHAIN_UNAVAILABLE');
        return;
      }

      const user = await findUserByWallet(deps.pool, walletAddress);
      if (user === null) {
        sendError(res, 'NOT_REGISTERED');
        return;
      }

      const session = await deps.sessions.issue(user, consumption.trustScore);
      await markLoggedIn(deps.pool, user.id);

      await reportAttempt(deps, {
        eventId: consumption.nonceId,
        walletAddress: user.walletAddress,
        ipAddress: clientIp(req),
        deviceFingerprint: typeof req.body?.device_fingerprint === 'string' ? req.body.device_fingerprint : '',
        trustScore: consumption.trustScore,
        decision: 'allow',
        timestamp: new Date(),
        verified: true,
      });

      res.json({
        decision: 'allow',
        trust_score: consumption.trustScore,
        session_token: session.token,
        expires_at: session.expiresAt.toISOString(),
      });
    }),
  );

  // The medium band: only a correct code issues the signature challenge.
  router.post(
    '/otp/verify',
    asyncRoute(async (req, res) => {
      const { otp_challenge_id: challengeId, code } = req.body ?? {};
      if (!isUuid(challengeId) || !isOtpCode(code)) {
        sendError(res, 'INVALID_REQUEST');
        return;
      }

      const verification = await deps.otp.verify(challengeId, code);

      if (verification.status === 'verified') {
        const nonce = await deps.nonces.issue(verification.walletAddress, verification.trustScore);
        res.json({
          decision: 'allow',
          trust_score: verification.trustScore,
          nonce: nonce.nonce,
          challenge_id: nonce.challengeId,
          expires_at: nonce.expiresAt.toISOString(),
        });
        return;
      }

      if (verification.status === 'invalid') {
        sendError(res, 'OTP_INVALID', { attempts_remaining: verification.attemptsRemaining });
        return;
      }

      if (verification.status === 'expired') {
        sendError(res, 'NONCE_EXPIRED');
        return;
      }

      // Destroyed after three failures, already used, or never existed: the
      // attempt is over and the same challenge can never succeed again.
      sendError(res, 'RISK_BLOCKED');
    }),
  );

  router.post(
    '/logout',
    deps.requireSession,
    asyncRoute(async (_req, res) => {
      await deps.sessions.revoke(res.locals.session.token);
      res.json({ logged_out: true });
    }),
  );

  return router;
}

const DECISIONS = {
  CHALLENGE_ISSUED: 'allow',
  OTP_PENDING: 'otp_required',
  BLOCKED: 'blocked',
} as const;

function bearerToken(header: string | undefined): string | undefined {
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined;
}

// The challenge created for this attempt is its event id, so the event written
// now and the one written after verification are the same record.
function eventIdOf(result: { state: string; nonce?: { challengeId: string }; otpChallengeId?: string }): string {
  return result.nonce?.challengeId ?? result.otpChallengeId ?? randomUUID();
}

// Telemetry never blocks a login: a risk engine that is down loses events, it
// does not stop customers logging in (TRD §14.4).
async function reportAttempt(deps: AuthDependencies, event: LoginEventReport): Promise<void> {
  try {
    await deps.events.report(event);
  } catch (error) {
    console.error(`Could not record login event ${event.eventId}: ${(error as Error).message}`);
  }

  deps.realtime.emitLoginEvent({
    event_id: event.eventId,
    wallet_address: event.walletAddress,
    ip_address: event.ipAddress,
    device_fingerprint: event.deviceFingerprint,
    trust_score: event.trustScore,
    decision: event.decision,
    timestamp: event.timestamp.toISOString(),
  });

  if (event.verified) {
    const auditEvent: AuditEvent = {
      eventId: event.eventId,
      wallet: event.walletAddress,
      ip: event.ipAddress,
      deviceFingerprint: event.deviceFingerprint,
      trustScore: event.trustScore,
      decision: event.decision,
      timestamp: event.timestamp.toISOString(),
    };
    deps.batcher.enqueue(auditEvent);
  }
}
