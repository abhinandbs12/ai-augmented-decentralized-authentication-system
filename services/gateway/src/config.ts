import type { TokenBucketOptions } from './middleware/tokenBucket';

export interface GatewayConfig {
  orchestratorUrl: string;
  tokenBucket: TokenBucketOptions;
}

// TRD §5.1: capacity 10, one new token every 3 seconds, per client IP.
const DEFAULT_TOKEN_BUCKET_CAPACITY = 10;
const DEFAULT_TOKEN_BUCKET_REFILL_INTERVAL_MS = 3000;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  return {
    orchestratorUrl: readRequiredHttpUrl(env, 'ORCHESTRATOR_URL'),
    tokenBucket: {
      capacity: readPositiveInteger(env, 'TOKEN_BUCKET_CAPACITY', DEFAULT_TOKEN_BUCKET_CAPACITY),
      refillIntervalMs: readPositiveInteger(
        env,
        'TOKEN_BUCKET_REFILL_INTERVAL_MS',
        DEFAULT_TOKEN_BUCKET_REFILL_INTERVAL_MS,
      ),
    },
  };
}

function readRequiredHttpUrl(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }

  const isHttpUrl = URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol);
  if (!isHttpUrl) {
    throw new Error(`${name} must be an http or https URL`);
  }

  return value;
}

function readPositiveInteger(env: NodeJS.ProcessEnv, name: string, defaultValue: number): number {
  const rawValue = env[name]?.trim();

  // .env.example ships these variables empty, which means "use the default".
  if (!rawValue) {
    return defaultValue;
  }

  const value = Number(rawValue);
  if (!/^\d+$/.test(rawValue) || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive whole number, got "${rawValue}"`);
  }

  return value;
}
