import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const migrationDirectory = path.resolve(process.cwd(), 'migrations');

function quoteIdentifier(value) {
  if (!value) return null;
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error('Invalid PostgreSQL schema name');
  return `"${value.replaceAll('"', '""')}"`;
}

/** Apply each numbered SQL file exactly once, inside its own transaction. */
export async function runMigrations(pool, schema = '') {
  const client = await pool.connect();
  try {
    // Protect startup when more than one app instance comes up at once.
    await client.query(`SELECT pg_advisory_lock(hashtext('cocoa-schema-migrations'))`);
    const quotedSchema = quoteIdentifier(schema);
    if (quotedSchema) await client.query(`CREATE SCHEMA IF NOT EXISTS ${quotedSchema}`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const files = (await readdir(migrationDirectory))
      .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
      .sort();
    for (const file of files) {
      const version = file.replace(/\.sql$/i, '');
      const existing = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
      if (existing.rowCount) continue;
      const sql = await readFile(path.join(migrationDirectory, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [version]);
        await client.query('COMMIT');
        console.info(JSON.stringify({ event: 'db.migration.applied', version }));
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query(`SELECT pg_advisory_unlock(hashtext('cocoa-schema-migrations'))`).catch(() => undefined);
    client.release();
  }
}
