import { readFileSync } from 'node:fs';

export interface OrchestratorConfig {
  port: number;
  databaseUrl: string;
  mongoUrl: string;
  riskEngineUrl: string;
  internalApiToken: string;
  sessionTtlMs: number;
  sessionCacheCapacity: number;
  nonceTtlMs: number;
  otpTtlMs: number;
  otpMaxAttempts: number;
  otpResendCooldownMs: number;
  otpMaxSends: number;
  adminWallets: string[];
  rpcUrl: string;
  contractAddress: string;
  adminPrivateKey: string;
  smtp: SmtpConfig | null;
  merkleBatchSize: number;
  merkleBatchIntervalMs: number;
  breakerThreshold: number;
  breakerWindowMs: number;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

const MINUTE_MS = 60_000;

// TRD §11.3 (30 minute sessions, 1000 cached), §11.2 (5 minute nonces),
// §5.5 (5 minute OTP, 3 attempts), §5.4 (16 events or 60 seconds) and §12.3
// (circuit breaker: more than 50 anomalous attempts in 10 seconds). A new code
// can be asked for 30 seconds after the last one, three sends in all.
const DEFAULTS = {
  port: 3001,
  sessionTtlMinutes: 30,
  sessionCacheCapacity: 1000,
  nonceTtlMinutes: 5,
  otpTtlMinutes: 5,
  otpMaxAttempts: 3,
  otpResendCooldownSeconds: 30,
  otpMaxSends: 3,
  smtpPort: 587,
  merkleBatchSize: 16,
  merkleBatchIntervalMs: 60_000,
  breakerThreshold: 50,
  breakerWindowMs: 10_000,
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): OrchestratorConfig {
  return {
    port: readPositiveInteger(env, 'PORT', DEFAULTS.port),
    databaseUrl: readRequired(env, 'DATABASE_URL'),
    mongoUrl: readRequired(env, 'MONGO_URL'),
    riskEngineUrl: readRequired(env, 'RISK_ENGINE_URL'),
    internalApiToken: readRequired(env, 'INTERNAL_API_TOKEN'),
    sessionTtlMs: readPositiveInteger(env, 'SESSION_TTL_MINUTES', DEFAULTS.sessionTtlMinutes) * MINUTE_MS,
    sessionCacheCapacity: readPositiveInteger(env, 'SESSION_CACHE_CAPACITY', DEFAULTS.sessionCacheCapacity),
    nonceTtlMs: readPositiveInteger(env, 'NONCE_TTL_MINUTES', DEFAULTS.nonceTtlMinutes) * MINUTE_MS,
    otpTtlMs: readPositiveInteger(env, 'OTP_TTL_MINUTES', DEFAULTS.otpTtlMinutes) * MINUTE_MS,
    otpMaxAttempts: readPositiveInteger(env, 'OTP_MAX_ATTEMPTS', DEFAULTS.otpMaxAttempts),
    otpResendCooldownMs:
      readPositiveInteger(env, 'OTP_RESEND_COOLDOWN_SECONDS', DEFAULTS.otpResendCooldownSeconds) * 1000,
    otpMaxSends: readPositiveInteger(env, 'OTP_MAX_SENDS', DEFAULTS.otpMaxSends),
    adminWallets: readWalletList(env, 'ADMIN_WALLETS'),
    rpcUrl: readOptional(env, 'RPC_URL'),
    contractAddress: readContractAddress(env),
    adminPrivateKey: readOptional(env, 'ADMIN_PRIVATE_KEY'),
    smtp: readSmtp(env),
    merkleBatchSize: readPositiveInteger(env, 'MERKLE_BATCH_SIZE', DEFAULTS.merkleBatchSize),
    merkleBatchIntervalMs: readPositiveInteger(env, 'MERKLE_BATCH_MS', DEFAULTS.merkleBatchIntervalMs),
    breakerThreshold: readPositiveInteger(env, 'BREAKER_THRESHOLD', DEFAULTS.breakerThreshold),
    breakerWindowMs: readPositiveInteger(env, 'BREAKER_WINDOW_MS', DEFAULTS.breakerWindowMs),
  };
}

function readOptional(env: NodeJS.ProcessEnv, name: string): string {
  return env[name]?.trim() ?? '';
}

function readRequired(env: NodeJS.ProcessEnv, name: string): string {
  const value = readOptional(env, name);
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

// An empty variable means "use the default": .env.example ships them empty.
function readPositiveInteger(env: NodeJS.ProcessEnv, name: string, defaultValue: number): number {
  const rawValue = readOptional(env, name);
  if (!rawValue) {
    return defaultValue;
  }

  const value = Number(rawValue);
  if (!/^\d+$/.test(rawValue) || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive whole number, got "${rawValue}"`);
  }
  return value;
}

function readWalletList(env: NodeJS.ProcessEnv, name: string): string[] {
  return readOptional(env, name)
    .split(',')
    .map((wallet) => wallet.trim().toLowerCase())
    .filter((wallet) => /^0x[0-9a-f]{40}$/.test(wallet));
}

// The deploy container writes the address to a shared file, so nobody has to
// copy it into .env by hand between `docker compose up` and a working demo.
function readContractAddress(env: NodeJS.ProcessEnv): string {
  const configured = readOptional(env, 'CONTRACT_ADDRESS');
  if (configured) {
    return configured;
  }

  const addressFile = readOptional(env, 'CONTRACT_ADDRESS_FILE');
  if (!addressFile) {
    return '';
  }

  try {
    return readFileSync(addressFile, 'utf8').trim();
  } catch (error) {
    throw new Error(`CONTRACT_ADDRESS_FILE ${addressFile} could not be read: ${(error as Error).message}`);
  }
}

// No SMTP_HOST means no email: the code screen then says the code could not be
// sent rather than pretending it was. A user name without a password is a
// mistake worth stopping on, not something to discover at the first sign-in.
function readSmtp(env: NodeJS.ProcessEnv): SmtpConfig | null {
  const host = readOptional(env, 'SMTP_HOST');
  if (!host) {
    return null;
  }

  const user = readOptional(env, 'SMTP_USER');
  const pass = readOptional(env, 'SMTP_PASS');
  if (user && !pass) {
    throw new Error('SMTP_PASS is required when SMTP_USER is set');
  }

  return {
    host,
    port: readPositiveInteger(env, 'SMTP_PORT', DEFAULTS.smtpPort),
    user,
    pass,
    from: readOptional(env, 'SMTP_FROM') || user || 'no-reply@demo-bank.local',
  };
}
