import { query, queryOne } from '../db';
import { env } from '../env';

/**
 * Database-backed attempt tracking so limits hold across processes/instances.
 * Failed sign-ins are counted per account and per IP; a successful sign-in clears the account's counter.
 */
export async function loginLockout(identifier: string, ip: string | null): Promise<{ locked: boolean; retryAfterMinutes: number }> {
  const window = `${env.login.lockoutMinutes} minutes`;
  const byAccount = await queryOne<{ count: string; oldest: string | null }>(
    `SELECT COUNT(*)::text AS count, MIN(attempted_at)::text AS oldest FROM login_attempts
     WHERE identifier = $1 AND succeeded = FALSE AND attempted_at > NOW() - $2::interval`,
    [identifier, window],
  );
  const byIp = ip ? await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM login_attempts WHERE ip_address = $1 AND succeeded = FALSE AND attempted_at > NOW() - $2::interval`,
    [ip, window],
  ) : null;
  const locked = Number(byAccount?.count ?? 0) >= env.login.maxAttempts || Number(byIp?.count ?? 0) >= env.login.ipMaxAttempts;
  return { locked, retryAfterMinutes: env.login.lockoutMinutes };
}

export async function recordLoginAttempt(identifier: string, ip: string | null, succeeded: boolean) {
  await query('INSERT INTO login_attempts (identifier, ip_address, succeeded) VALUES ($1, $2, $3)', [identifier, ip, succeeded]);
  if (succeeded) await query('DELETE FROM login_attempts WHERE identifier = $1 AND succeeded = FALSE', [identifier]);
  // Keep the table small.
  if (Math.random() < 0.05) await query(`DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL '1 day'`);
}

/** Generic sliding-window limit keyed by a label (e.g. recovery:<ip>). */
export async function windowLimit(key: string, max: number, windowMinutes: number): Promise<boolean> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM login_attempts WHERE identifier = $1 AND attempted_at > NOW() - ($2 || ' minutes')::interval`,
    [key, String(windowMinutes)],
  );
  if (Number(row?.count ?? 0) >= max) return false;
  await query('INSERT INTO login_attempts (identifier, succeeded) VALUES ($1, FALSE)', [key]);
  return true;
}
