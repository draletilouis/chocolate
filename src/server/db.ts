import { Pool, type QueryResultRow } from 'pg';
import { env } from './env';
import { runMigrations } from './migrations.mjs';

// One pool per process; Next.js reloads modules in development, so keep it on globalThis.
const globalForPg = globalThis as unknown as { cocoaPool?: Pool; cocoaSchemaReady?: Promise<void> };

export function getPool(): Pool {
  if (!globalForPg.cocoaPool) {
    globalForPg.cocoaPool = new Pool({
      ...(env.postgres.url
        ? { connectionString: env.postgres.url }
        : { host: env.postgres.host, port: env.postgres.port, database: env.postgres.database, user: env.postgres.user, password: env.postgres.password }),
      ssl: env.postgres.ssl ? { rejectUnauthorized: false } : undefined,
      max: env.postgres.poolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ...(env.postgres.schema ? { options: `-c search_path=${env.postgres.schema},public` } : {}),
    });
    globalForPg.cocoaPool.on('error', (error) => console.error(JSON.stringify({ event: 'db.pool.error', message: error.message })));
  }
  return globalForPg.cocoaPool;
}

/** Runs numbered migrations once per process. */
export function ensureSchema(): Promise<void> {
  if (!globalForPg.cocoaSchemaReady) {
    globalForPg.cocoaSchemaReady = runMigrations(getPool(), env.postgres.schema).then(() => undefined).catch((error) => {
      globalForPg.cocoaSchemaReady = undefined;
      throw error;
    });
  }
  return globalForPg.cocoaSchemaReady;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  await ensureSchema();
  return getPool().query<T>(text, params);
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] ?? null;
}
