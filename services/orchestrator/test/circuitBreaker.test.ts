import { describe, expect, it, vi } from 'vitest';
import { createCircuitBreaker } from '../src/core/circuitBreaker';

function breakerAt(clock: { time: number }, trip = vi.fn(async () => undefined)) {
  return {
    trip,
    breaker: createCircuitBreaker({ threshold: 50, windowMs: 10_000, trip, now: () => clock.time }),
  };
}

describe('circuit breaker', () => {
  it('trips once more than 50 anomalous attempts land within 10 seconds (TC-05)', () => {
    const clock = { time: 0 };
    const { breaker, trip } = breakerAt(clock);

    for (let attempt = 0; attempt < 50; attempt += 1) {
      clock.time += 100;
      breaker.record(20);
    }
    expect(trip).not.toHaveBeenCalled();

    breaker.record(20);
    breaker.record(20);
    expect(trip).toHaveBeenCalledOnce();
    expect(breaker.status().tripped).toBe(true);
  });

  it('ignores attempts that are not anomalous', () => {
    const clock = { time: 0 };
    const { breaker, trip } = breakerAt(clock);

    for (let attempt = 0; attempt < 200; attempt += 1) {
      breaker.record(attempt % 2 === 0 ? 50 : 95);
    }

    expect(trip).not.toHaveBeenCalled();
    expect(breaker.status().anomalousInWindow).toBe(0);
  });

  it('forgets attempts older than the window', () => {
    const clock = { time: 0 };
    const { breaker, trip } = breakerAt(clock);

    for (let attempt = 0; attempt < 60; attempt += 1) {
      clock.time += 400; // 60 attempts over 24 seconds: never more than 25 in any 10 s
      breaker.record(10);
    }

    expect(trip).not.toHaveBeenCalled();
    expect(breaker.status().anomalousInWindow).toBeLessThanOrEqual(25);
  });

  it('re-arms after an administrator resumes', () => {
    const clock = { time: 0 };
    const { breaker, trip } = breakerAt(clock);

    for (let attempt = 0; attempt < 51; attempt += 1) breaker.record(10);
    breaker.reset();
    expect(breaker.status()).toMatchObject({ tripped: false, anomalousInWindow: 0 });

    for (let attempt = 0; attempt < 51; attempt += 1) breaker.record(10);
    expect(trip).toHaveBeenCalledTimes(2);
  });

  it('stays armed when the pause transaction fails', async () => {
    const clock = { time: 0 };
    const trip = vi.fn().mockRejectedValueOnce(new Error('chain down')).mockResolvedValue(undefined);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { breaker } = breakerAt(clock, trip);

    for (let attempt = 0; attempt < 51; attempt += 1) breaker.record(10);
    await Promise.resolve();
    await Promise.resolve();
    breaker.record(10);

    expect(trip).toHaveBeenCalledTimes(2);
    errors.mockRestore();
  });
});
