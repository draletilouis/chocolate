import { mkdirSync } from 'node:fs';
import path from 'node:path';

export type Row = Record<string, unknown>;
export type Query = <T extends Row = Row>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;

/** A database connection: PostgreSQL in production, an embedded PostgreSQL for local use */
export interface Db {
  kind: 'postgres' | 'embedded';
  query: Query;
  /** Runs fn in one transaction. Inside it, use only the query function it is given. */
  transaction<T>(fn: (query: Query) => Promise<T>): Promise<T>;
}

// Kept on globalThis so development reloads reuse one connection instead of opening the database twice.
const g = globalThis as typeof globalThis & { __cocoaDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  g.__cocoaDb ??= open().catch((error) => {
    g.__cocoaDb = undefined;
    throw error;
  });
  return g.__cocoaDb;
}

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  const db = url ? await openPostgres(url) : await openEmbedded();
  await createSchema(db);
  return db;
}

async function openPostgres(url: string): Promise<Db> {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_SIZE ?? 5) });
  const query: Query = async (sql, params) => (await pool.query(sql, params)) as never;
  return {
    kind: 'postgres',
    query,
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn(async (sql, params) => (await client.query(sql, params)) as never);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

/** No DATABASE_URL: keep the data in an embedded PostgreSQL under DATA_DIR (default .data). */
async function openEmbedded(): Promise<Db> {
  if (process.env.RAILWAY_ENVIRONMENT && !process.env.RAILWAY_VOLUME_MOUNT_PATH && !process.env.DATA_DIR) {
    // Without a database or a volume, everything recorded would disappear on the next deploy.
    throw new Error('No database is set up. Add a PostgreSQL database to this Railway project (it provides DATABASE_URL) and redeploy.');
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = path.resolve(process.env.DATA_DIR ?? process.env.RAILWAY_VOLUME_MOUNT_PATH ?? '.data', 'pglite');
  mkdirSync(path.dirname(dir), { recursive: true });
  const pg = new PGlite(dir);
  await pg.waitReady;
  const query: Query = async (sql, params) => (await pg.query(sql, params)) as never;
  return {
    kind: 'embedded',
    query,
    transaction: (fn) => pg.transaction((tx) => fn(async (sql, params) => (await tx.query(sql, params)) as never)),
  };
}

async function createSchema(db: Db) {
  const statements = [
    // The data version: every saved change bumps it, and browsers ask for what changed since theirs.
    `create table if not exists app_meta (id integer primary key, version integer not null, created_at timestamptz not null default now())`,
    // Batches, lots, people, settings… one row per item, with the version it last changed at.
    `create table if not exists app_items (kind text not null, id text not null, pos serial, version integer not null, deleted boolean not null default false, data jsonb, primary key (kind, id))`,
    `create index if not exists app_items_version on app_items (version)`,
    // Every change, who made it and when: the audit trail.
    `create table if not exists app_commands (id serial primary key, version integer not null, user_id text, type text not null, payload jsonb not null, created_at timestamptz not null default now())`,
    // user_id is who was signed in; recorded_as is whose name the records carry when a manager records on someone's behalf.
    `alter table app_commands add column if not exists recorded_as text`,
    `create table if not exists app_credentials (user_id text primary key, password_hash text, pin_hash text, failed_pins integer not null default 0, pin_locked_until timestamptz, failed_passwords integer not null default 0, password_locked_until timestamptz)`,
    `create table if not exists app_sessions (token_hash text primary key, user_id text not null, recording_as text, device_id text, created_at timestamptz not null default now(), last_active timestamptz not null default now())`,
    `create table if not exists app_devices (id text primary key, token_hash text not null unique, name text not null, trusted_by text not null, created_at timestamptz not null default now(), last_seen timestamptz not null default now())`,
  ];
  for (const sql of statements) await db.query(sql);
}

/** Current time in the factory's time zone, in the format the records use (local time, no zone) */
export function factoryNow() {
  const zone = process.env.FACTORY_TIMEZONE || 'Africa/Kampala';
  try {
    return new Date().toLocaleString('sv-SE', { timeZone: zone, hour12: false }).replace(' ', 'T').slice(0, 19);
  } catch {
    return new Date().toISOString().slice(0, 19);
  }
}
