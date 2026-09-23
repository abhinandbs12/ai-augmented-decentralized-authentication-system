import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LRUCache } from '../src/ds/lruCache';
import { createRiskEngineClient, type RiskEngine } from '../src/core/riskEngineClient';
import { handleLogin, type CachedSession, type LoginDependencies } from '../src/core/loginStateMachine';

const WALLET = '0xab12ab12ab12ab12ab12ab12ab12ab12ab12ab12';
const OTHER_WALLET = '0xcd34cd34cd34cd34cd34cd34cd34cd34cd34cd34';
const LOGIN = {
  walletAddress: WALLET,
  deviceFingerprint: 'a1b2'.repeat(16),
  ipAddress: '203.0.113.9',
};
const ISSUED_NONCE = {
  challengeId: 'challenge-1',
  nonce: '8f2c'.repeat(16),
  expiresAt: new Date('2026-09-08T10:27:31.000Z'),
};

function riskEngineReturning(trustScore: number, reasons: string[] = []): RiskEngine {
  return { score: vi.fn().mockResolvedValue({ trustScore, reasons }) };
}

function createDependencies(riskEngine: RiskEngine): LoginDependencies {
  return {
    sessionCache: new LRUCache<string, CachedSession>(10),
    riskEngine,
    issueNonce: vi.fn().mockResolvedValue(ISSUED_NONCE),
    startOtpChallenge: vi.fn().mockResolvedValue('otp-challenge-1'),
  };
}

describe('handleLogin', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('existing sessions', () => {
    it('returns SESSION_ACTIVE without scoring when a valid token for this wallet is presented', async () => {
      const deps = createDependencies(riskEngineReturning(100));
      deps.sessionCache.put('token-1', { walletAddress: WALLET, expiresAt: Date.now() + 60_000 });

      const result = await handleLogin({ ...LOGIN, sessionToken: 'token-1' }, deps);

      expect(result).toEqual({ state: 'SESSION_ACTIVE' });
      expect(deps.riskEngine.score).not.toHaveBeenCalled();
    });

    it('matches the wallet address regardless of letter case', async () => {
      const deps = createDependencies(riskEngineReturning(100));
      deps.sessionCache.put('token-1', { walletAddress: WALLET.toUpperCase(), expiresAt: Date.now() + 60_000 });

      const result = await handleLogin({ ...LOGIN, sessionToken: 'token-1' }, deps);

      expect(result).toEqual({ state: 'SESSION_ACTIVE' });
    });

    it("scores the login when the token belongs to a different wallet", async () => {
      const deps = createDependencies(riskEngineReturning(95));
      deps.sessionCache.put('token-1', { walletAddress: OTHER_WALLET, expiresAt: Date.now() + 60_000 });

      const result = await handleLogin({ ...LOGIN, sessionToken: 'token-1' }, deps);

      expect(result.state).toBe('CHALLENGE_ISSUED');
      expect(deps.riskEngine.score).toHaveBeenCalledOnce();
    });

    it('scores the login when the session has expired', async () => {
      const deps = createDependencies(riskEngineReturning(95));
      deps.sessionCache.put('token-1', { walletAddress: WALLET, expiresAt: Date.now() - 1 });

      const result = await handleLogin({ ...LOGIN, sessionToken: 'token-1' }, deps);

      expect(result.state).toBe('CHALLENGE_ISSUED');
    });

    it('scores the login when no token is presented, even if the wallet has a cached session', async () => {
      const deps = createDependencies(riskEngineReturning(95));
      deps.sessionCache.put('token-1', { walletAddress: WALLET, expiresAt: Date.now() + 60_000 });
      deps.sessionCache.put(WALLET, { walletAddress: WALLET, expiresAt: Date.now() + 60_000 });

      const result = await handleLogin(LOGIN, deps);

      expect(result.state).toBe('CHALLENGE_ISSUED');
      expect(deps.riskEngine.score).toHaveBeenCalledOnce();
    });

    it('scores the login when the token is unknown', async () => {
      const deps = createDependencies(riskEngineReturning(95));

      const result = await handleLogin({ ...LOGIN, sessionToken: 'unknown-token' }, deps);

      expect(result.state).toBe('CHALLENGE_ISSUED');
    });
  });

  describe('score bands', () => {
    it('sends the login details to the risk engine', async () => {
      const deps = createDependencies(riskEngineReturning(95));

      await handleLogin(LOGIN, deps);

      expect(deps.riskEngine.score).toHaveBeenCalledWith({
        walletAddress: WALLET,
        deviceFingerprint: LOGIN.deviceFingerprint,
        ipAddress: LOGIN.ipAddress,
        timestamp: expect.any(Date),
      });
    });

    it('issues a signature challenge for a score of 95', async () => {
      const deps = createDependencies(riskEngineReturning(95));

      const result = await handleLogin(LOGIN, deps);

      expect(result).toEqual({ state: 'CHALLENGE_ISSUED', trustScore: 95, reasons: [], nonce: ISSUED_NONCE });
      // The score travels with the challenge so the audit event can report it.
      expect(deps.issueNonce).toHaveBeenCalledWith(WALLET, 95);
      expect(deps.startOtpChallenge).not.toHaveBeenCalled();
    });

    it('requires an OTP for a score of 70', async () => {
      const deps = createDependencies(riskEngineReturning(70, ['unrecognized_device']));

      const result = await handleLogin(LOGIN, deps);

      expect(result).toEqual({
        state: 'OTP_PENDING',
        trustScore: 70,
        reasons: ['unrecognized_device'],
        otpChallengeId: 'otp-challenge-1',
      });
      expect(deps.startOtpChallenge).toHaveBeenCalledWith(WALLET, 70);
      expect(deps.issueNonce).not.toHaveBeenCalled();
    });

    it('blocks a score of 30 without creating any challenge', async () => {
      const reasons = ['unrecognized_device', 'unrecognized_region', 'high_velocity'];
      const deps = createDependencies(riskEngineReturning(30, reasons));

      const result = await handleLogin(LOGIN, deps);

      expect(result).toEqual({ state: 'BLOCKED', trustScore: 30, reasons });
      expect(deps.issueNonce).not.toHaveBeenCalled();
      expect(deps.startOtpChallenge).not.toHaveBeenCalled();
    });

    it.each([
      [100, 'CHALLENGE_ISSUED'],
      [90, 'CHALLENGE_ISSUED'],
      [89, 'OTP_PENDING'],
      [50, 'OTP_PENDING'],
      [49, 'BLOCKED'],
      [0, 'BLOCKED'],
    ])('routes a score of %i to %s', async (trustScore, expectedState) => {
      const result = await handleLogin(LOGIN, createDependencies(riskEngineReturning(trustScore)));

      expect(result.state).toBe(expectedState);
    });
  });

  describe('when the risk engine fails', () => {
    it('falls back to the medium band and requires an OTP instead of throwing', async () => {
      const riskEngine = { score: vi.fn().mockRejectedValue(new Error('The operation was aborted due to timeout')) };
      const deps = createDependencies(riskEngine);

      const result = await handleLogin(LOGIN, deps);

      expect(result).toEqual({
        state: 'OTP_PENDING',
        trustScore: 70,
        reasons: [],
        otpChallengeId: 'otp-challenge-1',
      });
      expect(deps.issueNonce).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledOnce();
    });

    it('never issues a signature challenge when the real client cannot reach the risk engine', async () => {
      const deps = createDependencies(createRiskEngineClient('http://127.0.0.1:1'));

      const result = await handleLogin(LOGIN, deps);

      expect(result.state).toBe('OTP_PENDING');
      expect(deps.issueNonce).not.toHaveBeenCalled();
    });
  });
});
