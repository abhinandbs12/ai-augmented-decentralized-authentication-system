import type { Response } from 'express';

// The TRD §14.3 catalogue. Messages are the ones a customer sees, so they never
// say whether a wallet exists, what the Trust Score was, or which service failed.
const ERRORS = {
  INVALID_REQUEST: { status: 400, message: 'Something went wrong with that request.' },
  INVALID_SIGNATURE: { status: 401, message: 'We could not verify your signature.' },
  SESSION_INVALID: { status: 401, message: 'Your session has ended. Please log in again.' },
  FORBIDDEN: { status: 403, message: 'You do not have access to this.' },
  RISK_BLOCKED: { status: 403, message: 'We could not complete this login. Please contact support.' },
  NOT_FOUND: { status: 404, message: 'The requested resource was not found.' },
  NOT_REGISTERED: { status: 404, message: 'This wallet is not registered yet.' },
  ALREADY_REGISTERED: { status: 409, message: 'This wallet is already registered.' },
  NONCE_USED: { status: 409, message: 'This login request has already been used.' },
  NONCE_EXPIRED: { status: 410, message: 'Your login request timed out. Please try again.' },
  OTP_EXPIRED: { status: 410, message: 'That code has expired.' },
  OTP_INVALID: { status: 422, message: 'That code is not correct.' },
  OTP_RESEND_TOO_SOON: { status: 429, message: 'Please wait a moment before asking for a new code.' },
  OTP_RESEND_LIMIT: { status: 429, message: 'No more codes can be sent for this sign-in. Please start again.' },
  INTERNAL_ERROR: { status: 500, message: 'Something went wrong. Please try again.' },
  CHAIN_UNAVAILABLE: { status: 502, message: 'We are having trouble completing your login.' },
  AUTH_PAUSED: { status: 503, message: 'Logins are temporarily paused. Please try again shortly.' },
  SERVICE_UNAVAILABLE: { status: 503, message: 'We are having trouble completing your request.' },
} as const;

export type ErrorCode = keyof typeof ERRORS;

// Sends the TRD §14.2 envelope: { error: { code, message, request_id } }.
// `details` carries non-sensitive extras such as the OTP attempts remaining.
export function sendError(res: Response, code: ErrorCode, details?: Record<string, unknown>): void {
  const { status, message } = ERRORS[code];

  res.status(status).json({
    error: { code, message, request_id: res.locals.requestId, ...details },
  });
}
