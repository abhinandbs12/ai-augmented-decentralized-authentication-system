import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import {
  countFailedAttempt,
  deleteOtpChallenge,
  findOtpChallenge,
  insertOtpChallenge,
  markOtpVerified,
} from '../db/otpChallenges';

export type OtpVerification =
  | { status: 'verified'; walletAddress: string; trustScore: number; deviceFingerprint: string }
  | { status: 'invalid'; attemptsRemaining: number }
  | { status: 'destroyed' }
  | { status: 'expired' }
  | { status: 'unknown' };

export interface OtpSender {
  send(phoneNumber: string, code: string): Promise<void>;
}

export interface OtpOptions {
  ttlMs: number;
  maxAttempts: number;
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

// Six digits, five minute TTL, three attempts, then the challenge is destroyed
// (TRD §5.5). Only the hash of the code is stored: the code itself exists in
// memory long enough to be sent by SMS and is never logged or returned.
export class OtpService {
  constructor(
    private readonly pool: Pool,
    private readonly options: OtpOptions,
    private readonly sender: OtpSender,
  ) {}

  async start(
    walletAddress: string,
    phoneNumber: string | null,
    trustScore: number,
    deviceFingerprint: string,
  ): Promise<string> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const challengeId = await insertOtpChallenge(this.pool, {
      walletAddress,
      codeHash: hashCode(code),
      trustScore,
      deviceFingerprint,
      expiresAt: new Date(Date.now() + this.options.ttlMs),
    });

    if (phoneNumber) {
      // Delivery failures are never fatal to the request and never upgrade the
      // attempt: without the code the login simply cannot continue.
      await this.sender.send(phoneNumber, code).catch((error: Error) => {
        console.error(`OTP delivery failed for challenge ${challengeId}: ${error.message}`);
      });
    } else {
      console.warn(`No phone number on file, OTP challenge ${challengeId} cannot be delivered`);
    }

    return challengeId;
  }

  async verify(challengeId: string, code: string): Promise<OtpVerification> {
    const challenge = await findOtpChallenge(this.pool, challengeId);
    if (challenge === null) {
      return { status: 'unknown' };
    }
    if (challenge.verified) {
      // A challenge is good for exactly one login.
      return { status: 'destroyed' };
    }
    if (challenge.expired) {
      return { status: 'expired' };
    }

    if (matches(challenge.codeHash, code)) {
      const claimed = await markOtpVerified(this.pool, challengeId);
      return claimed
        ? {
            status: 'verified',
            walletAddress: challenge.walletAddress,
            trustScore: challenge.trustScore,
            deviceFingerprint: challenge.deviceFingerprint,
          }
        : { status: 'destroyed' };
    }

    const attempts = await countFailedAttempt(this.pool, challengeId);
    if (attempts >= this.options.maxAttempts) {
      await deleteOtpChallenge(this.pool, challengeId);
      return { status: 'destroyed' };
    }

    return { status: 'invalid', attemptsRemaining: this.options.maxAttempts - attempts };
  }
}

function matches(storedHash: string, submittedCode: string): boolean {
  const submitted = Buffer.from(hashCode(submittedCode), 'hex');
  const stored = Buffer.from(storedHash, 'hex');

  return stored.length === submitted.length && timingSafeEqual(stored, submitted);
}
