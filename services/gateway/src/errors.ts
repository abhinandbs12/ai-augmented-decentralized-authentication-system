import type { Response } from 'express';

// Codes and messages follow the TRD error catalogue (§14.3). NOT_FOUND, INTERNAL_ERROR and
// SERVICE_UNAVAILABLE cover gateway failures that the catalogue does not list.
// Messages stay generic so they never reveal internal details.
const ERRORS = {
  INVALID_REQUEST: { status: 400, message: 'Something went wrong with that request.' },
  NOT_FOUND: { status: 404, message: 'The requested resource was not found.' },
  RATE_LIMITED: { status: 429, message: 'Too many attempts. Please wait a moment.' },
  INTERNAL_ERROR: { status: 500, message: 'Something went wrong. Please try again.' },
  SERVICE_UNAVAILABLE: {
    status: 503,
    message: 'We are having trouble completing your request. Please try again shortly.',
  },
} as const;

export type ErrorCode = keyof typeof ERRORS;

// Sends the TRD §14.2 error envelope: { error: { code, message, request_id } }.
export function sendError(res: Response, code: ErrorCode): void {
  const { status, message } = ERRORS[code];

  res.status(status).json({
    error: { code, message, request_id: res.locals.requestId },
  });
}
