import { createServer } from 'node:http';
import { MongoClient } from 'mongodb';
import { createApp } from './app';
import { createMerkleBatcher } from './audit/batcher';
import { createAuthRegistryClient } from './chain/authRegistryClient';
import { loadConfig } from './config';
import { createCircuitBreaker } from './core/circuitBreaker';
import { createEventReporter } from './core/eventReporter';
import type { CachedSession } from './core/loginStateMachine';
import { NonceService } from './core/nonces';
import { createRiskEngineClient } from './core/riskEngineClient';
import { SessionStore } from './core/sessions';
import { createPool, runMigrations } from './db/pool';
import { LRUCache } from './ds/lruCache';
import { OtpService } from './otp/otpService';
import { createOtpSender } from './otp/sender';
import { createRealtime, silentRealtime, type Realtime } from './realtime/socket';

async function start(): Promise<void> {
  const config = loadConfig();

  const pool = createPool(config.databaseUrl);
  const applied = await runMigrations(pool);
  console.log(applied.length > 0 ? `Applied migrations: ${applied.join(', ')}` : 'Database schema is up to date');

  const mongoClient = new MongoClient(config.mongoUrl);
  await mongoClient.connect();
  const authDb = mongoClient.db('authdb');

  const sessionCache = new LRUCache<string, CachedSession>(config.sessionCacheCapacity);
  const chain = createAuthRegistryClient({
    rpcUrl: config.rpcUrl,
    contractAddress: config.contractAddress,
    adminPrivateKey: config.adminPrivateKey,
  });
  const batcher = createMerkleBatcher({
    pool,
    chain,
    batchSize: config.merkleBatchSize,
    intervalMs: config.merkleBatchIntervalMs,
  });

  // Socket.IO can only attach once the HTTP server exists, and the server
  // needs the app: the routes therefore broadcast through this holder.
  let broadcaster: Realtime = silentRealtime;
  const realtime: Realtime = {
    emitLoginEvent: (event) => broadcaster.emitLoginEvent(event),
    emitSystem: (state, reason) => broadcaster.emitSystem(state, reason),
    close: () => broadcaster.close(),
  };

  const breaker = createCircuitBreaker({
    threshold: config.breakerThreshold,
    windowMs: config.breakerWindowMs,
    trip: async () => {
      await chain.pauseAuth();
      console.warn('Circuit breaker tripped: authentication paused');
      realtime.emitSystem('paused', 'circuit breaker');
    },
  });
  const sessions = new SessionStore(pool, sessionCache, config.sessionTtlMs);

  const app = createApp({
    pool,
    authDb,
    sessions,
    sessionCache,
    nonces: new NonceService(pool, config.nonceTtlMs),
    otp: new OtpService(
      pool,
      { ttlMs: config.otpTtlMs, maxAttempts: config.otpMaxAttempts },
      createOtpSender({ twilio: config.twilio, demoDelivery: config.otpDemoDelivery }),
    ),
    chain,
    riskEngine: createRiskEngineClient(config.riskEngineUrl),
    events: createEventReporter(config.riskEngineUrl, config.internalApiToken),
    batcher,
    realtime,
    breaker,
    adminWallets: config.adminWallets,
    internalApiToken: config.internalApiToken,
  });

  const server = createServer(app);
  broadcaster = createRealtime(server, async (token) => {
    const session = await sessions.find(token);
    return session !== null && config.adminWallets.includes(session.walletAddress.toLowerCase());
  });

  server.listen(config.port, () => {
    console.log(`Orchestrator listening on port ${config.port}`);
    console.log(`  Risk engine:  ${config.riskEngineUrl}`);
    console.log(`  Contract:     ${config.contractAddress || 'not configured'}`);
    console.log(`  Admin wallets: ${config.adminWallets.length}`);
    console.log(
      `  SMS delivery: ${
        config.twilio ? 'Twilio' : config.otpDemoDelivery ? 'demo, codes written to this log' : 'not configured'
      }`,
    );
    void warnIfContractMissing(config.rpcUrl, config.contractAddress);
  });

  const shutdown = async (): Promise<void> => {
    batcher.stop();
    await batcher.flush().catch(() => undefined);
    await realtime.close();
    server.close();
    await mongoClient.close();
    await pool.end();
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

// Restarting the chain without restarting this service leaves the address we
// were given pointing at nothing, and every chain call then fails with the same
// unhelpful "blockchain could not be reached". Saying so once at start-up turns
// that into something an operator can act on.
async function warnIfContractMissing(rpcUrl: string, contractAddress: string): Promise<void> {
  if (!rpcUrl || !contractAddress) {
    return;
  }

  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getCode',
        params: [contractAddress, 'latest'],
      }),
      signal: AbortSignal.timeout(5000),
    });
    const body = (await response.json()) as { result?: string };

    if (body.result === '0x') {
      console.warn(
        `WARNING: no contract is deployed at ${contractAddress} on ${rpcUrl}. ` +
          'The chain was probably restarted after this service started. ' +
          'Restart the stack with `docker compose up -d --force-recreate orchestrator` to pick up the new address.',
      );
    }
  } catch {
    console.warn(`WARNING: could not check the contract at ${contractAddress}; ${rpcUrl} did not answer.`);
  }
}

start().catch((error: Error) => {
  console.error(`Orchestrator failed to start: ${error.message}`);
  process.exit(1);
});
