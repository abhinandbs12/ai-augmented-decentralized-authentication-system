// Reports login attempts to the risk engine, which owns the login_events
// collection. The first call records the routing decision; a second call with
// the same event id marks the attempt verified once the signature checks out.
// Only verified attempts count as history, so a failed attempt can never make
// an unfamiliar device look familiar.

export interface LoginEventReport {
  eventId: string;
  walletAddress: string;
  ipAddress: string;
  deviceFingerprint: string;
  trustScore: number;
  decision: 'allow' | 'otp_required' | 'blocked';
  timestamp: Date;
  verified: boolean;
}

export interface EventReporter {
  report(event: LoginEventReport): Promise<void>;
}

const REPORT_TIMEOUT_MS = 1000;

export function createEventReporter(baseUrl: string, internalApiToken: string): EventReporter {
  const eventUrl = `${baseUrl.replace(/\/+$/, '')}/event`;

  return {
    async report(event: LoginEventReport): Promise<void> {
      const response = await fetch(eventUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': internalApiToken,
        },
        body: JSON.stringify({
          event_id: event.eventId,
          wallet_address: event.walletAddress,
          ip_address: event.ipAddress,
          device_fingerprint: event.deviceFingerprint,
          trust_score: event.trustScore,
          decision: event.decision,
          timestamp: event.timestamp.toISOString(),
          verified: event.verified,
        }),
        signal: AbortSignal.timeout(REPORT_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`Risk engine returned HTTP ${response.status}`);
      }
    },
  };
}
