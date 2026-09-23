import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OtpService, type OtpSender } from '../src/otp/otpService';

interface StoredChallenge {
  id: string;
  walletAddress: string;
  codeHash: string;
  trustScore: number;
  attempts: number;
  verified: boolean;
  expired: boolean;
}

// The service is exercised against an in-memory stand-in for the table, so the
// attempt counting and the destroy rule are tested without a database.
const challenges = vi.hoisted(() => new Map<string, StoredChallenge>());

vi.mock('../src/db/otpChallenges', () => ({
  insertOtpChallenge: async (
    _pool: Pool,
    challenge: { walletAddress: string; codeHash: string; trustScore: number },
  ) => {
    const id = `00000000-0000-4000-8000-${String(challenges.size + 1).padStart(12, '0')}`;
    challenges.set(id, { id, ...challenge, attempts: 0, verified: false, expired: false });
    return id;
  },
  findOtpChallenge: async (_pool: Pool, id: string) => challenges.get(id) ?? null,
  countFailedAttempt: async (_pool: Pool, id: string) => {
    const challenge = challenges.get(id);
    if (!challenge) {
      return 0;
    }
    challenge.attempts += 1;
    return challenge.attempts;
  },
  markOtpVerified: async (_pool: Pool, id: string) => {
    const challenge = challenges.get(id);
    if (!challenge || challenge.verified) {
      return false;
    }
    challenge.verified = true;
    return true;
  },
  deleteOtpChallenge: async (_pool: Pool, id: string) => {
    challenges.delete(id);
  },
}));

const pool = {} as Pool;
const OPTIONS = { ttlMs: 300_000, maxAttempts: 3 };
const WALLET = '0xab12ab12ab12ab12ab12ab12ab12ab12ab12ab12';
const PHONE = '+919876543210';

function createSender(): OtpSender & { sent: string[] } {
  const sent: string[] = [];
  return { sent, send: async (_phone, code) => void sent.push(code) };
}

describe('OtpService', () => {
  beforeEach(() => {
    challenges.clear();
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('start', () => {
    it('sends a six-digit code and stores only its hash', async () => {
      const sender = createSender();
      const service = new OtpService(pool, OPTIONS, sender);

      const challengeId = await service.start(WALLET, PHONE, 71);

      const [code] = sender.sent;
      expect(code).toMatch(/^\d{6}$/);
      const stored = challenges.get(challengeId);
      expect(stored?.codeHash).toBe(createHash('sha256').update(code).digest('hex'));
      expect(stored?.codeHash).not.toContain(code);
      expect(stored?.trustScore).toBe(71);
    });

    it('still creates the challenge when there is no phone number on file', async () => {
      const sender = createSender();
      const service = new OtpService(pool, OPTIONS, sender);

      const challengeId = await service.start(WALLET, null, 71);

      expect(challenges.has(challengeId)).toBe(true);
      expect(sender.sent).toEqual([]);
    });

    // Delivery failing must never turn a step-up into an allow: the login
    // simply cannot continue without the code.
    it('does not fail the request when delivery fails', async () => {
      const service = new OtpService(pool, OPTIONS, {
        send: async () => {
          throw new Error('Twilio returned HTTP 500');
        },
      });

      await expect(service.start(WALLET, PHONE, 71)).resolves.toMatch(/^[0-9a-f-]+$/);
    });
  });

  describe('verify', () => {
    async function startChallenge(): Promise<{ service: OtpService; challengeId: string; code: string }> {
      const sender = createSender();
      const service = new OtpService(pool, OPTIONS, sender);
      const challengeId = await service.start(WALLET, PHONE, 71);
      return { service, challengeId, code: sender.sent[0] };
    }

    it('accepts the correct code and reports the score that caused the step-up', async () => {
      const { service, challengeId, code } = await startChallenge();

      await expect(service.verify(challengeId, code)).resolves.toEqual({
        status: 'verified',
        walletAddress: WALLET,
        trustScore: 71,
      });
    });

    it('accepts the correct code only once', async () => {
      const { service, challengeId, code } = await startChallenge();

      await service.verify(challengeId, code);

      await expect(service.verify(challengeId, code)).resolves.toEqual({ status: 'destroyed' });
    });

    it('counts down the attempts on a wrong code', async () => {
      const { service, challengeId, code } = await startChallenge();
      const wrongCode = code === '000000' ? '111111' : '000000';

      await expect(service.verify(challengeId, wrongCode)).resolves.toEqual({
        status: 'invalid',
        attemptsRemaining: 2,
      });
      await expect(service.verify(challengeId, wrongCode)).resolves.toEqual({
        status: 'invalid',
        attemptsRemaining: 1,
      });
    });

    // Three failures destroy the challenge, so even the correct code is refused
    // afterwards (TRD §5.5).
    it('destroys the challenge on the third wrong code, and the right code then fails too', async () => {
      const { service, challengeId, code } = await startChallenge();
      const wrongCode = code === '000000' ? '111111' : '000000';

      await service.verify(challengeId, wrongCode);
      await service.verify(challengeId, wrongCode);
      await expect(service.verify(challengeId, wrongCode)).resolves.toEqual({ status: 'destroyed' });

      expect(challenges.has(challengeId)).toBe(false);
      await expect(service.verify(challengeId, code)).resolves.toEqual({ status: 'unknown' });
    });

    it('refuses an expired challenge', async () => {
      const { service, challengeId, code } = await startChallenge();
      challenges.get(challengeId)!.expired = true;

      await expect(service.verify(challengeId, code)).resolves.toEqual({ status: 'expired' });
    });

    it('reports an unknown challenge id', async () => {
      const { service } = await startChallenge();

      await expect(service.verify('00000000-0000-4000-8000-999999999999', '123456')).resolves.toEqual({
        status: 'unknown',
      });
    });

    it('rejects a code of the wrong length without counting it as a match', async () => {
      const { service, challengeId } = await startChallenge();

      const result = await service.verify(challengeId, '1234567');

      expect(result.status).toBe('invalid');
    });
  });
});
