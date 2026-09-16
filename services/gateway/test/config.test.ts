import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

const ORCHESTRATOR_URL = 'http://orchestrator:3001';

describe('loadConfig', () => {
  it('uses the TRD rate limits when the variables are unset or empty', () => {
    expect(loadConfig({ ORCHESTRATOR_URL }).tokenBucket).toEqual({
      capacity: 10,
      refillIntervalMs: 3000,
    });

    const emptyValues = loadConfig({
      ORCHESTRATOR_URL,
      TOKEN_BUCKET_CAPACITY: '',
      TOKEN_BUCKET_REFILL_INTERVAL_MS: ' ',
    });
    expect(emptyValues.tokenBucket).toEqual({ capacity: 10, refillIntervalMs: 3000 });
  });

  it('reads the rate limits from the environment', () => {
    const config = loadConfig({
      ORCHESTRATOR_URL,
      TOKEN_BUCKET_CAPACITY: '25',
      TOKEN_BUCKET_REFILL_INTERVAL_MS: '500',
    });

    expect(config).toEqual({
      orchestratorUrl: ORCHESTRATOR_URL,
      tokenBucket: { capacity: 25, refillIntervalMs: 500 },
    });
  });

  it.each(['0', '-5', '1.5', 'ten', '10abc', '99999999999999999999'])(
    'rejects an invalid TOKEN_BUCKET_CAPACITY of "%s"',
    (value) => {
      expect(() => loadConfig({ ORCHESTRATOR_URL, TOKEN_BUCKET_CAPACITY: value })).toThrow(
        'TOKEN_BUCKET_CAPACITY must be a positive whole number',
      );
    },
  );

  it('rejects an invalid TOKEN_BUCKET_REFILL_INTERVAL_MS', () => {
    expect(() => loadConfig({ ORCHESTRATOR_URL, TOKEN_BUCKET_REFILL_INTERVAL_MS: '0' })).toThrow(
      'TOKEN_BUCKET_REFILL_INTERVAL_MS must be a positive whole number',
    );
  });

  it('requires ORCHESTRATOR_URL', () => {
    expect(() => loadConfig({})).toThrow('ORCHESTRATOR_URL is required');
    expect(() => loadConfig({ ORCHESTRATOR_URL: '' })).toThrow('ORCHESTRATOR_URL is required');
  });

  it.each(['orchestrator:3001', 'ftp://orchestrator', 'not a url'])(
    'rejects ORCHESTRATOR_URL "%s"',
    (value) => {
      expect(() => loadConfig({ ORCHESTRATOR_URL: value })).toThrow(
        'ORCHESTRATOR_URL must be an http or https URL',
      );
    },
  );
});
