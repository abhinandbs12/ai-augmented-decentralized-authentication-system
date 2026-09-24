// How many attempts GET /api/admin/attempts/top returns. The dashboard offers 10, 20 or 50.
export const DEFAULT_TOP_ATTEMPTS = 20;
export const MAX_TOP_ATTEMPTS = 100;

// Returns the limit to use, or null when `n` is not a positive whole number.
// MongoDB treats limit(0) and limit(NaN) as "no limit", so bad input must never reach the query.
export function parseTopAttemptsLimit(value: unknown): number | null {
  if (value === undefined) {
    return DEFAULT_TOP_ATTEMPTS;
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return null;
  }

  const limit = Number(value);
  if (limit < 1) {
    return null;
  }

  return Math.min(limit, MAX_TOP_ATTEMPTS);
}
