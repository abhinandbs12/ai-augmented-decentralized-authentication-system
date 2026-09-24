import { describe, expect, it } from 'vitest';
import { parseTopAttemptsLimit } from '../src/routes/topAttemptsLimit';

describe('parseTopAttemptsLimit', () => {
  it('uses 20 when n is not given', () => {
    expect(parseTopAttemptsLimit(undefined)).toBe(20);
  });

  it.each([
    ['1', 1],
    ['10', 10],
    ['50', 50],
    ['100', 100],
  ])('accepts n=%s', (value, expected) => {
    expect(parseTopAttemptsLimit(value)).toBe(expected);
  });

  it('caps very large values at 100', () => {
    expect(parseTopAttemptsLimit('100000')).toBe(100);
    expect(parseTopAttemptsLimit('9'.repeat(400))).toBe(100);
  });

  // Each of these used to reach MongoDB as limit(0), limit(NaN) or a negative limit,
  // which returned every document (or a different number than asked for).
  it.each([['0'], ['-3'], ['abc'], ['2.9'], [''], [' '], ['1e3']])('rejects n=%j', (value) => {
    expect(parseTopAttemptsLimit(value)).toBeNull();
  });

  it('rejects a repeated query parameter', () => {
    expect(parseTopAttemptsLimit(['5', '10'])).toBeNull();
  });
});
