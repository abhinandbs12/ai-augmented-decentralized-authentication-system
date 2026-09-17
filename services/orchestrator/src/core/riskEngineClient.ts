// Client for the risk engine's POST /score endpoint. Field names match the
// LoginContext and ScoreResult models in services/risk-engine/app/main.py.

export interface LoginContext {
  walletAddress: string;
  ipAddress: string;
  deviceFingerprint: string;
  timestamp: Date;
}

export interface RiskScore {
  trustScore: number;
  reasons: string[];
}

export interface RiskEngine {
  score(context: LoginContext): Promise<RiskScore>;
}

// TRD §5.2: leaves about 1.2 seconds of the 2-second login budget for everything else.
export const RISK_ENGINE_TIMEOUT_MS = 800;

interface ScoreResponseBody {
  trust_score?: unknown;
  reasons?: unknown;
}

// Throws on timeout, network failure, a non-2xx status or a malformed response.
// Deciding what a failure means for the login is the state machine's job.
export function createRiskEngineClient(baseUrl: string): RiskEngine {
  const scoreUrl = `${baseUrl.replace(/\/+$/, '')}/score`;

  return {
    async score(context: LoginContext): Promise<RiskScore> {
      const response = await fetch(scoreUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: context.walletAddress,
          ip_address: context.ipAddress,
          device_fingerprint: context.deviceFingerprint,
          timestamp: context.timestamp.toISOString(),
        }),
        signal: AbortSignal.timeout(RISK_ENGINE_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`Risk engine returned HTTP ${response.status}`);
      }

      return parseScoreResponse(await response.json());
    },
  };
}

function parseScoreResponse(body: unknown): RiskScore {
  const { trust_score: trustScore, reasons } = (body ?? {}) as ScoreResponseBody;

  const isValidScore =
    typeof trustScore === 'number' && Number.isInteger(trustScore) && trustScore >= 0 && trustScore <= 100;
  if (!isValidScore) {
    throw new Error('Risk engine returned an invalid trust_score');
  }

  if (!Array.isArray(reasons) || !reasons.every((reason) => typeof reason === 'string')) {
    throw new Error('Risk engine returned invalid reasons');
  }

  return { trustScore, reasons };
}
