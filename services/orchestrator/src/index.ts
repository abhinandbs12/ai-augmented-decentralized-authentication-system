import { createServer } from 'node:http';
import { MongoClient } from 'mongodb';
import { createApp } from './app';
import { createMerkleBatcher } from './audit/batcher';
import { createAuthRegistryClient } from './chain/authRegistryClient';
import { loadConfig } from './config';
import { createEventReporter } from './core/eventReporter';
import type { CachedSession } from './core/loginStateMachine';
import { NonceService } from './core/nonces';
import { createRiskEngineClient } from './core/riskEngineClient';
import { SessionStore } from './core/sessions';
import { createPool, runMigrations } from './db/pool';
import { LRUCache } from './ds/lruCache';
import { OtpService } from './otp/otpService';
import { createTwilioSender } from './otp/twilioSender';
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
    close: () => broadcaster.close(),
  };

  const app = createApp({
    pool,
    authDb,
    sessions: new SessionStore(pool, sessionCache, config.sessionTtlMs),
    sessionCache,
    nonces: new NonceService(pool, config.nonceTtlMs),
    otp: new OtpService(
      pool,
      { ttlMs: config.otpTtlMs, maxAttempts: config.otpMaxAttempts },
      createTwilioSender(config.twilio),
    ),
    chain,
    riskEngine: createRiskEngineClient(config.riskEngineUrl),
    events: createEventReporter(config.riskEngineUrl, config.internalApiToken),
    batcher,
    realtime,
    adminWallets: config.adminWallets,
    internalApiToken: config.internalApiToken,
  });

  const server = createServer(app);
  broadcaster = createRealtime(server, process.env.WEB_ORIGIN?.trim() || 'http://localhost:5173');

  server.listen(config.port, () => {
    console.log(`Orchestrator listening on port ${config.port}`);
    console.log(`  Risk engine:  ${config.riskEngineUrl}`);
    console.log(`  Contract:     ${config.contractAddress || 'not configured'}`);
    console.log(`  Admin wallets: ${config.adminWallets.length}`);
    console.log(`  SMS delivery: ${config.twilio ? 'Twilio' : 'not configured'}`);
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

start().catch((error: Error) => {
  console.error(`Orchestrator failed to start: ${error.message}`);
  process.exit(1);
});
