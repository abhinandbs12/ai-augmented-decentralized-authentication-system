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
  adminWallets: string[];
  rpcUrl: string;
  contractAddress: string;
  adminPrivateKey: string;
  twilio: TwilioConfig | null;
  merkleBatchSize: number;
  merkleBatchIntervalMs: number;
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

const MINUTE_MS = 60_000;

// TRD §11.3 (30 minute sessions, 1000 cached), §11.2 (5 minute nonces),
// §5.5 (5 minute OTP, 3 attempts) and §5.4 (16 events or 60 seconds).
const DEFAULTS = {
  port: 3001,
  sessionTtlMinutes: 30,
  sessionCacheCapacity: 1000,
  nonceTtlMinutes: 5,
  otpTtlMinutes: 5,
  otpMaxAttempts: 3,
  merkleBatchSize: 16,
  merkleBatchIntervalMs: 60_000,
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
    adminWallets: readWalletList(env, 'ADMIN_WALLETS'),
    rpcUrl: readOptional(env, 'RPC_URL'),
    contractAddress: readContractAddress(env),
    adminPrivateKey: readOptional(env, 'ADMIN_PRIVATE_KEY'),
    twilio: readTwilio(env),
    merkleBatchSize: readPositiveInteger(env, 'MERKLE_BATCH_SIZE', DEFAULTS.merkleBatchSize),
    merkleBatchIntervalMs: readPositiveInteger(env, 'MERKLE_BATCH_MS', DEFAULTS.merkleBatchIntervalMs),
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

function readTwilio(env: NodeJS.ProcessEnv): TwilioConfig | null {
  const accountSid = readOptional(env, 'TWILIO_ACCOUNT_SID');
  const authToken = readOptional(env, 'TWILIO_AUTH_TOKEN');
  const fromNumber = readOptional(env, 'TWILIO_FROM_NUMBER');

  if (!accountSid || !authToken || !fromNumber) {
    return null;
  }
  return { accountSid, authToken, fromNumber };
}
