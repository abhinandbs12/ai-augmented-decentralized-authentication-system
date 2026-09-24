// Counts anomalous attempts (Trust Score below 50) in a rolling window and
// trips once when there are more than `threshold` of them (TRD §12.3, TC-05:
// more than 50 in 10 seconds). Tripping pauses authentication in the contract,
// so every later login fails at verification whatever its score.
export interface CircuitBreakerOptions {
  threshold: number;
  windowMs: number;
  trip: () => Promise<void>;
  now?: () => number;
}

export interface CircuitBreaker {
  record(trustScore: number): void;
  reset(): void;
  status(): { anomalousInWindow: number; threshold: number; windowMs: number; tripped: boolean };
}

const ANOMALOUS_BELOW = 50;

export function createCircuitBreaker(options: CircuitBreakerOptions): CircuitBreaker {
  const now = options.now ?? Date.now;
  let anomalous: number[] = []; // timestamps, oldest first
  let tripped = false;

  function prune(): void {
    const windowStart = now() - options.windowMs;
    anomalous = anomalous.filter((timestamp) => timestamp > windowStart);
  }

  return {
    record(trustScore: number): void {
      if (trustScore >= ANOMALOUS_BELOW) {
        return;
      }
      anomalous.push(now());
      prune();

      if (!tripped && anomalous.length > options.threshold) {
        tripped = true;
        options.trip().catch((error: Error) => {
          // Stay armed so the next anomalous attempt tries again.
          tripped = false;
          console.error(`Circuit breaker could not pause authentication: ${error.message}`);
        });
      }
    },

    // An administrator resumed authentication, so the breaker re-arms.
    reset(): void {
      anomalous = [];
      tripped = false;
    },

    status() {
      prune();
      return {
        anomalousInWindow: anomalous.length,
        threshold: options.threshold,
        windowMs: options.windowMs,
        tripped,
      };
    },
  };
}
