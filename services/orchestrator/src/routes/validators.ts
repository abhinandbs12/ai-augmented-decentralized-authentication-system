import type { NextFunction, Request, RequestHandler, Response } from 'express';

// The gateway validates every auth body with zod. These checks repeat the
// essentials, so the orchestrator is still safe when it is called directly
// (by a demo script, or by a container on the internal network).
const WALLET_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX_32_BYTES = /^[0-9a-fA-F]{64}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const OTP_CODE = /^\d{6}$/;
// Deliberately loose: one @, a dot in the domain, no spaces. The gateway checks
// the full format; whether an address works is only known once mail arrives.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

export const isWalletAddress = (value: unknown): value is string =>
  typeof value === 'string' && WALLET_ADDRESS.test(value);

export const isHex32Bytes = (value: unknown): value is string =>
  typeof value === 'string' && HEX_32_BYTES.test(value);

export const isSignature = (value: unknown): value is string =>
  typeof value === 'string' && SIGNATURE.test(value);

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

export const isOtpCode = (value: unknown): value is string =>
  typeof value === 'string' && OTP_CODE.test(value);

export const isEmail = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAX_EMAIL_LENGTH && EMAIL.test(value.trim());

// The address the gateway measured. Only the gateway can reach this service in
// the deployed stack, and it replaces any client-supplied value, so the first
// entry is the real client address.
export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? '0.0.0.0';
}

// Express 4 does not forward a rejected promise to the error handler.
export function asyncRoute(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}
