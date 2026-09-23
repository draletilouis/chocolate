#!/usr/bin/env node
/**
 * Creates the authentication tables and bootstraps the first admin account.
 *   npm run init-db
 * Reads .env.local / .env (POSTGRES_*, BOOTSTRAP_ADMIN_*, SEED_DEMO_USERS, BCRYPT_ROUNDS).
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runMigrations } from '../src/server/migrations.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

for (const file of ['.env', '.env.local']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
  }
}

const env = process.env;
const rounds = Number.parseInt(env.BCRYPT_ROUNDS ?? '10', 10) || 10;
const schema = env.POSTGRES_SCHEMA && env.POSTGRES_SCHEMA !== 'public' ? env.POSTGRES_SCHEMA : null;
const pool = new Pool({
  ...(env.DATABASE_URL
    ? { connectionString: env.DATABASE_URL }
    : { host: env.POSTGRES_HOST || '127.0.0.1', port: Number(env.POSTGRES_PORT || 5432), database: env.POSTGRES_DB || 'cocoa_production', user: env.POSTGRES_USER || 'postgres', password: env.POSTGRES_PASSWORD || '' }),
  ssl: env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  ...(schema ? { options: `-c search_path=${schema},public` } : {}),
});

const validCredential = (v) => typeof v === 'string' && Buffer.byteLength(v, 'utf8') <= 72 && (/^\d{4}$/.test(v) || (v.length >= 8 && v.trim().length >= 8));

async function upsertUser(client, { email, name, role, roleLabel, password, resetRequired }) {
  const existing = await client.query('SELECT id FROM users WHERE LOWER(TRIM(email)) = $1', [email.toLowerCase()]);
  if (existing.rowCount) return { email, created: false };
  await client.query(
    'INSERT INTO users (email, name, role, role_label, password_hash, password_reset_required) VALUES ($1, $2, $3, $4, $5, $6)',
    [email.toLowerCase(), name, role, roleLabel ?? null, await bcrypt.hash(password, rounds), resetRequired],
  );
  return { email, created: true };
}

const client = await pool.connect();
try {
  if (schema) await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await runMigrations(pool, schema || '');
  console.log(`Database ready in ${env.POSTGRES_DB || 'cocoa_production'}${schema ? ` (schema ${schema})` : ''}.`);

  const adminEmail = (env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = env.BOOTSTRAP_ADMIN_PASSWORD || '';
  if (adminEmail && adminPassword) {
    if (!validCredential(adminPassword)) throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be a 4-digit PIN or at least 8 characters');
    const result = await upsertUser(client, { email: adminEmail, name: env.BOOTSTRAP_ADMIN_NAME || 'Administrator', role: 'admin', roleLabel: 'Production manager', password: adminPassword, resetRequired: true });
    console.log(result.created ? `Bootstrap admin created: ${adminEmail} (must change password at first sign-in)` : `Bootstrap admin already exists: ${adminEmail}`);
  } else {
    const admins = await client.query(`SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND is_active`);
    if (!admins.rows[0].count) console.warn('No admin account exists. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD and run again.');
  }

  if (env.SEED_DEMO_USERS === 'true') {
    const demo = [
      ['alex.morgan@cocoafactory.example', 'Alex Morgan', 'admin', 'Production manager'],
      ['ama.boateng@cocoafactory.example', 'Ama Boateng', 'operator', 'Roasting operator'],
      ['kwame.mensah@cocoafactory.example', 'Kwame Mensah', 'operator', 'Chocolate maker'],
      ['lena.fischer@cocoafactory.example', 'Lena Fischer', 'operator', 'Packaging lead'],
      ['sam.osei@cocoafactory.example', 'Sam Osei', 'operator', 'Quality'],
    ];
    for (const [email, name, role, roleLabel] of demo) {
      const result = await upsertUser(client, { email, name, role, roleLabel, password: 'cocoa123', resetRequired: false });
      if (result.created) console.log(`Demo user created: ${email} (password cocoa123)`);
    }
  }
} finally {
  client.release();
  await pool.end();
}
