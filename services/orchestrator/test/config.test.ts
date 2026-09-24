import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

const REQUIRED = {
  DATABASE_URL: 'postgres://authuser:authpass@postgres:5432/authdb',
  MONGO_URL: 'mongodb://mongo:27017',
  RISK_ENGINE_URL: 'http://risk-engine:8001',
  INTERNAL_API_TOKEN: 'a-shared-token',
};

describe('loadConfig', () => {
  it('uses the documented defaults when the optional variables are unset', () => {
    const config = loadConfig({ ...REQUIRED });

    expect(config.port).toBe(3001);
    expect(config.sessionTtlMs).toBe(30 * 60_000);
    expect(config.sessionCacheCapacity).toBe(1000);
    expect(config.nonceTtlMs).toBe(5 * 60_000);
    expect(config.otpTtlMs).toBe(5 * 60_000);
    expect(config.otpMaxAttempts).toBe(3);
    expect(config.merkleBatchSize).toBe(16);
    expect(config.merkleBatchIntervalMs).toBe(60_000);
  });

  // .env.example ships these empty, which used to turn SESSION_TTL_MINUTES into
  // NaN and gave every session an invalid expiry.
  it('treats an empty variable as "use the default"', () => {
    const config = loadConfig({ ...REQUIRED, SESSION_TTL_MINUTES: '', PORT: '  ' });

    expect(config.sessionTtlMs).toBe(30 * 60_000);
    expect(config.port).toBe(3001);
  });

  it.each([['abc'], ['0'], ['-5'], ['12.5'], ['1e3'], ['NaN']])(
    'refuses to start when SESSION_TTL_MINUTES is %j',
    (value) => {
      expect(() => loadConfig({ ...REQUIRED, SESSION_TTL_MINUTES: value })).toThrow(/positive whole number/);
    },
  );

  it.each(Object.keys(REQUIRED))('refuses to start without %s', (name) => {
    const env = { ...REQUIRED, [name]: '' };

    expect(() => loadConfig(env)).toThrow(`${name} is required`);
  });

  it('keeps only well-formed admin wallets, in lower case', () => {
    const config = loadConfig({
      ...REQUIRED,
      ADMIN_WALLETS: '0xAD00ad00AD00ad00AD00ad00AD00ad00AD00ad00, not-a-wallet ,0xcd34cd34cd34cd34cd34cd34cd34cd34cd34cd34',
    });

    expect(config.adminWallets).toEqual([
      '0xad00ad00ad00ad00ad00ad00ad00ad00ad00ad00',
      '0xcd34cd34cd34cd34cd34cd34cd34cd34cd34cd34',
    ]);
  });

  it('has no admin wallets when the variable is missing, so admin routes stay shut', () => {
    expect(loadConfig({ ...REQUIRED }).adminWallets).toEqual([]);
  });

  it('reads the contract address the deploy container wrote', () => {
    const directory = mkdtempSync(join(tmpdir(), 'aadas-'));
    const addressFile = join(directory, 'contract-address.txt');
    writeFileSync(addressFile, '0x5FbDB2315678afecb367f032d93F642f64180aa3\n');

    const config = loadConfig({ ...REQUIRED, CONTRACT_ADDRESS_FILE: addressFile });

    expect(config.contractAddress).toBe('0x5FbDB2315678afecb367f032d93F642f64180aa3');
  });

  it('prefers an explicit CONTRACT_ADDRESS over the file', () => {
    const config = loadConfig({
      ...REQUIRED,
      CONTRACT_ADDRESS: '0x1111111111111111111111111111111111111111',
      CONTRACT_ADDRESS_FILE: '/does/not/exist',
    });

    expect(config.contractAddress).toBe('0x1111111111111111111111111111111111111111');
  });

  it('reports a missing address file instead of starting without a contract', () => {
    expect(() => loadConfig({ ...REQUIRED, CONTRACT_ADDRESS_FILE: '/does/not/exist' })).toThrow(
      /could not be read/,
    );
  });

  it('only configures Twilio when all three values are present', () => {
    const partial = loadConfig({ ...REQUIRED, TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'secret' });
    const complete = loadConfig({
      ...REQUIRED,
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'secret',
      TWILIO_FROM_NUMBER: '+15005550006',
    });

    expect(partial.twilio).toBeNull();
    expect(complete.twilio).toEqual({
      accountSid: 'AC123',
      authToken: 'secret',
      fromNumber: '+15005550006',
    });
  });
});
