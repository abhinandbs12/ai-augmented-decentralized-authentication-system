import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import {
  countFailedAttempt,
  deleteOtpChallenge,
  findOtpChallenge,
  insertOtpChallenge,
  markOtpVerified,
  replaceOtpCode,
} from '../db/otpChallenges';

export type OtpVerification =
  | { status: 'verified'; walletAddress: string; trustScore: number; deviceFingerprint: string; factors: string[] }
  | { status: 'invalid'; attemptsRemaining: number }
  | { status: 'destroyed' }
  | { status: 'expired' }
  | { status: 'unknown' };

// 'email' sends through an SMTP server; 'none' means no mail server is
// configured, so a code would reach nobody.
export type OtpDeliveryChannel = 'email' | 'none';

// What the code screen is told about one send: the email went out, the mail
// server refused it or did not answer (a new code can be asked for), or there
// was nowhere to send it (no address on the account, or no mail server). Nobody
// is told a code was sent when it was not.
export type OtpDelivery = 'email' | 'failed' | 'none';

export type OtpResend =
  | { status: 'sent'; delivery: OtpDelivery }
  | { status: 'too_soon'; retryAfterSeconds: number }
  | { status: 'limit_reached' }
  | { status: 'over' };

export interface OtpSender {
  readonly channel: OtpDeliveryChannel;
  send(to: string, code: string): Promise<void>;
}

export interface OtpOptions {
  ttlMs: number;
  maxAttempts: number;
  resendCooldownMs: number;
  maxSends: number;
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

const newCode = () => randomInt(0, 1_000_000).toString().padStart(6, '0');

// Six digits, five minute TTL, three attempts, then the challenge is destroyed
// (TRD §5.5). Only the hash of the code is stored: the code itself exists in
// memory long enough to be emailed and is never logged or returned.
export class OtpService {
  constructor(
    private readonly pool: Pool,
    private readonly options: OtpOptions,
    private readonly sender: OtpSender,
  ) {}

  get resendCooldownSeconds(): number {
    return Math.ceil(this.options.resendCooldownMs / 1000);
  }

  async start(
    walletAddress: string,
    email: string | null,
    attempt: { trustScore: number; deviceFingerprint: string; factors: string[] },
  ): Promise<{ challengeId: string; delivery: OtpDelivery }> {
    const code = newCode();
    const challengeId = await insertOtpChallenge(this.pool, {
      walletAddress,
      codeHash: hashCode(code),
      ...attempt,
      expiresAt: new Date(Date.now() + this.options.ttlMs),
    });

    return { challengeId, delivery: await this.deliver(challengeId, email, code) };
  }

  // A new code for the same challenge, so the sign-in stays one attempt and one
  // event. The old code stops working. Wrong guesses are not reset: the three
  // attempts belong to the challenge, whatever the number of codes sent.
  async resend(challengeId: string, emailOf: (walletAddress: string) => Promise<string | null>): Promise<OtpResend> {
    const challenge = await findOtpChallenge(this.pool, challengeId);
    if (challenge === null || challenge.verified) {
      return { status: 'over' };
    }
    if (challenge.sendCount >= this.options.maxSends) {
      return { status: 'limit_reached' };
    }

    const waitMs = challenge.sentAt.getTime() + this.options.resendCooldownMs - Date.now();
    if (waitMs > 0) {
      return { status: 'too_soon', retryAfterSeconds: Math.ceil(waitMs / 1000) };
    }

    const code = newCode();
    const replaced = await replaceOtpCode(this.pool, challengeId, {
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + this.options.ttlMs),
      sendCount: challenge.sendCount,
    });
    if (!replaced) {
      // A second request for this challenge got there first and sent a code.
      return { status: 'too_soon', retryAfterSeconds: this.resendCooldownSeconds };
    }

    return { status: 'sent', delivery: await this.deliver(challengeId, await emailOf(challenge.walletAddress), code) };
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
            factors: challenge.factors,
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

  // Delivery failures are never fatal to the request and never upgrade the
  // attempt: without the code the login simply cannot continue.
  private async deliver(challengeId: string, email: string | null, code: string): Promise<OtpDelivery> {
    if (!email || this.sender.channel === 'none') {
      console.warn(
        `OTP challenge ${challengeId} cannot be delivered: ${email ? 'no mail server is configured' : 'no email address on file'}`,
      );
      return 'none';
    }

    try {
      await this.sender.send(email, code);
      return 'email';
    } catch (error) {
      console.error(`OTP email for challenge ${challengeId} failed: ${(error as Error).message}`);
      return 'failed';
    }
  }
}

function matches(storedHash: string, submittedCode: string): boolean {
  const submitted = Buffer.from(hashCode(submittedCode), 'hex');
  const stored = Buffer.from(storedHash, 'hex');

  return stored.length === submitted.length && timingSafeEqual(stored, submitted);
}
