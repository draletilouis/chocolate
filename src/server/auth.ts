import type { User } from '@/lib/types';
import { newToken, shortId, tokenHash, verifySecret } from './crypto';
import { getDb } from './db';
import { CommandError } from './reduce';
import { execute, readState } from './state';

export const SESSION_MAX_AGE = 7 * 24 * 3600; // seconds
export const DEVICE_MAX_AGE = 365 * 24 * 3600;
const PIN_ATTEMPTS = 5;
const PASSWORD_ATTEMPTS = 10;
const LOCK_MINUTES = 15;

export interface Session { tokenHash: string; user: User; recordingAs: User | null; deviceId: string | null }
export type SignIn = { ok: true; token: string; user: User } | { ok: false; status: number; error: string };

/** The signed-in person for a session cookie, or null when it is unknown, idle too long or too old */
export async function findSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const { state } = await readState();
  const db = await getDb();
  const hash = tokenHash(token);
  const { rows } = await db.query<{ user_id: string; recording_as: string | null; device_id: string | null; idle: number; age: number }>(
    `select user_id, recording_as, device_id, extract(epoch from now() - last_active)::float8 as idle, extract(epoch from now() - created_at)::float8 as age
     from app_sessions where token_hash = $1`,
    [hash],
  );
  const row = rows[0];
  if (!row) return null;
  const user = state.users.find((u) => u.id === row.user_id);
  const idleLimit = state.idleMinutes > 0 ? state.idleMinutes * 60 : Infinity;
  if (!user || row.idle > idleLimit || row.age > SESSION_MAX_AGE) {
    await db.query('delete from app_sessions where token_hash = $1', [hash]);
    return null;
  }
  const recordingAs = row.recording_as && user.access === 'manager' ? state.users.find((u) => u.id === row.recording_as) ?? null : null;
  return { tokenHash: hash, user, recordingAs, deviceId: row.device_id };
}

/** Marks the session as in use; only real activity counts, so an idle screen still signs out */
export async function touchSession(hash: string) {
  const db = await getDb();
  await db.query(`update app_sessions set last_active = now() where token_hash = $1 and last_active < now() - interval '20 seconds'`, [hash]);
}

async function createSession(userId: string, deviceId: string | null) {
  const db = await getDb();
  const token = newToken();
  await db.query('insert into app_sessions (token_hash, user_id, device_id) values ($1, $2, $3)', [tokenHash(token), userId, deviceId]);
  return token;
}

export async function endSession(token: string | undefined) {
  if (!token) return;
  const db = await getDb();
  await db.query('delete from app_sessions where token_hash = $1', [tokenHash(token)]);
}

/** A manager records on someone else's behalf; null records as themselves again */
export async function setRecordingAs(session: Session, userId: string | null) {
  const db = await getDb();
  await db.query('update app_sessions set recording_as = $2 where token_hash = $1', [session.tokenHash, userId]);
}

/**
 * Checks a PIN or password against its hash. Repeated failures lock that way of signing in for a
 * while, so a 4-digit PIN cannot be guessed over the internet.
 */
async function checkSecret(userId: string, which: 'pin' | 'password', secret: string): Promise<'ok' | 'wrong' | 'locked'> {
  const db = await getDb();
  const c = which === 'pin'
    ? { hash: 'pin_hash', failed: 'failed_pins', until: 'pin_locked_until', max: PIN_ATTEMPTS }
    : { hash: 'password_hash', failed: 'failed_passwords', until: 'password_locked_until', max: PASSWORD_ATTEMPTS };
  const { rows } = await db.query<{ hash: string | null; locked: boolean }>(`select ${c.hash} as hash, coalesce(${c.until} > now(), false) as locked from app_credentials where user_id = $1`, [userId]);
  const row = rows[0];
  if (row?.locked) return 'locked';
  if (await verifySecret(secret, row?.hash)) {
    await db.query(`update app_credentials set ${c.failed} = 0, ${c.until} = null where user_id = $1`, [userId]);
    return 'ok';
  }
  if (!row) return 'wrong';
  const updated = await db.query<{ failed: number }>(`update app_credentials set ${c.failed} = ${c.failed} + 1 where user_id = $1 returning ${c.failed} as failed`, [userId]);
  if ((updated.rows[0]?.failed ?? 0) >= c.max) {
    await db.query(`update app_credentials set ${c.failed} = 0, ${c.until} = now() + interval '${LOCK_MINUTES} minutes' where user_id = $1`, [userId]);
    return 'locked';
  }
  return 'wrong';
}

export async function signInWithPin(userId: string, pin: string, deviceId: string | null): Promise<SignIn> {
  const { state } = await readState();
  const user = state.users.find((u) => u.id === userId);
  if (!user) return { ok: false, status: 401, error: 'Wrong PIN. Try again.' };
  const check = await checkSecret(user.id, 'pin', pin);
  if (check === 'locked') return { ok: false, status: 429, error: `Too many wrong PINs. Try again in ${LOCK_MINUTES} minutes, or sign in with email and password.` };
  if (check === 'wrong') return { ok: false, status: 401, error: 'Wrong PIN. Try again.' };
  return { ok: true, token: await createSession(user.id, deviceId), user };
}

export async function signInWithPassword(email: string, password: string, deviceId: string | null): Promise<SignIn> {
  const { state } = await readState();
  const user = state.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    await verifySecret(password, null);
    return { ok: false, status: 401, error: 'Invalid credentials. Check the email and password and try again.' };
  }
  const check = await checkSecret(user.id, 'password', password);
  if (check === 'locked') return { ok: false, status: 429, error: `Too many wrong passwords. Try again in ${LOCK_MINUTES} minutes.` };
  if (check === 'wrong') return { ok: false, status: 401, error: 'Invalid credentials. Check the email and password and try again.' };
  return { ok: true, token: await createSession(user.id, deviceId), user };
}

/** First start of a real factory: the first person becomes its manager */
export async function createFirstManager(input: { name: string; role?: string; email: string; password: string; pin: string }): Promise<SignIn> {
  const { result } = await execute(
    { type: 'addUser', user: { name: input.name, role: input.role || 'Production manager', email: input.email, access: 'manager', stations: [], password: input.password, pin: input.pin } },
    { userId: 'setup', access: 'manager' },
    (state) => { if (state.users.length > 0) throw new CommandError('The factory is already set up. Sign in instead.'); },
  );
  const { state } = await readState();
  const user = state.users.find((u) => u.id === result)!;
  return { ok: true, token: await createSession(user.id, null), user };
}

/** Shared devices a manager has set up for quick PIN sign-in */
export async function trustDevice(name: string, trustedBy: string) {
  const db = await getDb();
  const token = newToken();
  const id = shortId();
  await db.query('insert into app_devices (id, token_hash, name, trusted_by) values ($1, $2, $3, $4)', [id, tokenHash(token), name, trustedBy]);
  return { id, token };
}

export async function findDevice(token: string | undefined): Promise<{ id: string; name: string } | null> {
  if (!token) return null;
  const db = await getDb();
  const { rows } = await db.query<{ id: string; name: string }>('select id, name from app_devices where token_hash = $1', [tokenHash(token)]);
  if (!rows[0]) return null;
  await db.query(`update app_devices set last_seen = now() where id = $1 and last_seen < now() - interval '1 hour'`, [rows[0].id]);
  return rows[0];
}

export async function listDevices() {
  const db = await getDb();
  const { rows } = await db.query<{ id: string; name: string; trusted_by: string; created_at: Date; last_seen: Date }>('select id, name, trusted_by, created_at, last_seen from app_devices order by created_at');
  return rows.map((r) => ({ id: r.id, name: r.name, trustedBy: r.trusted_by, createdAt: new Date(r.created_at).toISOString(), lastSeen: new Date(r.last_seen).toISOString() }));
}

/** Removing a device also signs out anyone using it */
export async function removeDevice(id: string) {
  const db = await getDb();
  await db.query('delete from app_sessions where device_id = $1', [id]);
  await db.query('delete from app_devices where id = $1', [id]);
}
