import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';

export function createPool(databaseUrl: string): Pool {
  const pool = new Pool({ connectionString: databaseUrl });
  // An idle connection fails when PostgreSQL restarts or the network drops.
  // Unhandled, that error ends the process and every login with it. The pool
  // already discards the broken client, so logging is enough: requests fail
  // while the database is down and work again once it is back (TRD §14.4).
  pool.on('error', (error) => {
    console.error(`PostgreSQL connection lost: ${error.message}`);
  });
  return pool;
}

// Plain numbered .sql files, applied in order and recorded so a restart is a
// no-op (TRD §7.7). No migration framework for six tables.
export async function runMigrations(pool: Pool, directory = defaultMigrationsDirectory()): Promise<string[]> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename   text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  const applied = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations');
  const alreadyApplied = new Set(applied.rows.map((row) => row.filename));

  const pending = readdirSync(directory)
    .filter((filename) => filename.endsWith('.sql'))
    .sort()
    .filter((filename) => !alreadyApplied.has(filename));

  for (const filename of pending) {
    const statements = readFileSync(join(directory, filename), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(statements);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${filename} failed: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  return pending;
}

// Resolves to services/orchestrator/migrations from both src/ and dist/.
function defaultMigrationsDirectory(): string {
  return join(__dirname, '..', '..', 'migrations');
}
