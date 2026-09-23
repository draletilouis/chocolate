import { createHash, randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { signValue, unsignValue } from '@/lib/auth/cookie-signature';
import { query, queryOne } from '../db';
import { env } from '../env';
import { toPublicUser, type PublicUser, type UserRow } from './users';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export interface SessionInfo { sidHash: string; user: PublicUser }

export function sessionCookieOptions(maxAgeSeconds = env.session.ttlDays * 24 * 60 * 60) {
  return { httpOnly: true, secure: env.session.secureCookie, sameSite: 'lax' as const, path: '/', maxAge: maxAgeSeconds };
}

/** Creates a server-side session row and returns the signed cookie value to set. */
export async function createSession(userId: number, request: { ip: string | null; userAgent: string | null }) {
  const sid = randomBytes(32).toString('hex');
  await query(
    `INSERT INTO sessions (sid_hash, user_id, expires_at, ip_address, user_agent)
     VALUES ($1, $2, NOW() + ($3 || ' days')::interval, $4, $5)`,
    [sha256(sid), userId, String(env.session.ttlDays), request.ip, request.userAgent?.slice(0, 500) ?? null],
  );
  if (Math.random() < 0.05) await query('DELETE FROM sessions WHERE expires_at < NOW()');
  return signValue(sid, env.session.secret);
}

export async function destroySession(cookieValue: string | undefined) {
  const sid = await unsignValue(cookieValue, env.session.secret);
  if (sid) await query('DELETE FROM sessions WHERE sid_hash = $1', [sha256(sid)]);
}

/** Ends every session of a user except (optionally) the current one — used after password changes and deactivation. */
export async function destroyUserSessions(userId: number, keepSidHash?: string) {
  await query('DELETE FROM sessions WHERE user_id = $1 AND ($2::text IS NULL OR sid_hash <> $2)', [userId, keepSidHash ?? null]);
}

/** Validates a cookie value against the database. Rolling expiry and idle timeout are applied here. */
export async function resolveSession(cookieValue: string | undefined): Promise<SessionInfo | null> {
  const sid = await unsignValue(cookieValue, env.session.secret);
  if (!sid) return null;
  const sidHash = sha256(sid);
  const row = await queryOne<UserRow & { last_seen_at: string; idle_seconds: number }>(
    `SELECT u.*, s.last_seen_at, EXTRACT(EPOCH FROM (NOW() - s.last_seen_at))::int AS idle_seconds
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.sid_hash = $1 AND s.expires_at > NOW()`,
    [sidHash],
  );
  if (!row) return null;
  if (!row.is_active || row.idle_seconds > env.session.idleMinutes * 60) {
    await query('DELETE FROM sessions WHERE sid_hash = $1', [sidHash]);
    return null;
  }
  // Refresh activity at most every 5 minutes to keep writes cheap.
  if (row.idle_seconds > 300) {
    await query(`UPDATE sessions SET last_seen_at = NOW(), expires_at = NOW() + ($2 || ' days')::interval WHERE sid_hash = $1`, [sidHash, String(env.session.ttlDays)]);
  }
  return { sidHash, user: toPublicUser(row) };
}

/** Current session for server components and route handlers (memoised per request). */
export const getSession = cache(async (): Promise<SessionInfo | null> => {
  const store = await cookies();
  return resolveSession(store.get(env.session.cookieName)?.value);
});
