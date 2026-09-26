import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendError } from '../errors';

// Auth request bodies are a few hundred bytes; anything larger is rejected.
const MAX_BODY_SIZE = '10kb';
const MAX_DISPLAY_NAME_LENGTH = 100;

const walletAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
// 32 bytes as hex: the SHA-256 device fingerprint and the login nonce (TRD §4.2, §11.2).
const hex32Bytes = z.string().regex(/^[0-9a-fA-F]{64}$/);
// 65-byte secp256k1 signature returned by personal_sign.
const signature = z.string().regex(/^0x[0-9a-fA-F]{130}$/);
// The step-up code is emailed, so an account needs a working address (RFC 5321
// caps it at 254 characters).
const email = z.email().max(254);

const registerBody = z.object({
  wallet_address: walletAddress,
  display_name: z.string().trim().min(1).max(MAX_DISPLAY_NAME_LENGTH).optional(),
  email,
});

const loginBody = z.object({
  wallet_address: walletAddress,
  device_fingerprint: hex32Bytes,
});

const verifyBody = z.object({
  wallet_address: walletAddress,
  nonce: hex32Bytes,
  signature,
});

const otpVerifyBody = z.object({
  otp_challenge_id: z.uuid(),
  code: z.string().regex(/^\d{6}$/),
});

const otpResendBody = z.object({
  otp_challenge_id: z.uuid(),
});

const parseJsonBody = express.json({ limit: MAX_BODY_SIZE });

function validateBody(schema: z.ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      console.error(`Validation failed for ${req.path}:`, result.error.format());
      sendError(res, 'INVALID_REQUEST');
      return;
    }

    // Forward only the fields the orchestrator expects.
    req.body = result.data;
    next();
  };
}

// Mounted at /api/auth. A Router matches paths the same way the orchestrator's Express
// app does (case-insensitive, optional trailing slash), so path variants cannot skip validation.
// Routes without a body schema (such as /logout) pass through untouched.
export const authBodyValidator = Router();

authBodyValidator.post('/register', parseJsonBody, validateBody(registerBody));
authBodyValidator.post('/login', parseJsonBody, validateBody(loginBody));
authBodyValidator.post('/verify', parseJsonBody, validateBody(verifyBody));
authBodyValidator.post('/otp/verify', parseJsonBody, validateBody(otpVerifyBody));
authBodyValidator.post('/otp/resend', parseJsonBody, validateBody(otpResendBody));
