#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runMigrations } from '../src/server/migrations.mjs';

for (const file of ['.env', '.env.local']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
  }
}

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const schema = process.env.POSTGRES_SCHEMA && process.env.POSTGRES_SCHEMA !== 'public' ? process.env.POSTGRES_SCHEMA : '';
const pool = new Pool({
  host: process.env.POSTGRES_HOST || '127.0.0.1', port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB || 'cocoa_production', user: process.env.POSTGRES_USER || 'postgres', password: process.env.POSTGRES_PASSWORD || '',
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  ...(schema ? { options: `-c search_path=${schema},public` } : {}),
});

try {
  await runMigrations(pool, schema);
  const result = await pool.query(`
    WITH deleted AS (
      DELETE FROM sessions WHERE expires_at < NOW() OR last_seen_at < NOW() - INTERVAL '90 days' RETURNING 1
    ), resets AS (
      DELETE FROM password_resets WHERE expires_at < NOW() OR created_at < NOW() - INTERVAL '90 days' RETURNING 1
    ), attempts AS (
      DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL '90 days' RETURNING 1
    )
    SELECT (SELECT COUNT(*) FROM deleted)::int AS sessions,
           (SELECT COUNT(*) FROM resets)::int AS password_resets,
           (SELECT COUNT(*) FROM attempts)::int AS login_attempts
  `);
  console.log(JSON.stringify({ event: 'maintenance.sessions_pruned', ...result.rows[0], at: new Date().toISOString() }));
} catch (error) {
  console.error(JSON.stringify({ event: 'maintenance.sessions_prune_failed', message: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
} finally {
  await pool.end();
}
