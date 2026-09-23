import { NextResponse, type NextRequest } from 'next/server';
import { loginSchema } from '@/lib/auth/validation';
import { recordAudit } from '@/server/auth/audit';
import { dummyHash, verifyPassword } from '@/server/auth/password';
import { loginLockout, recordLoginAttempt } from '@/server/auth/rate-limit';
import { createSession, sessionCookieOptions } from '@/server/auth/session';
import { getUserByEmail, toPublicUser, touchLastLogin } from '@/server/auth/users';
import { env } from '@/server/env';
import { jsonError, parseBody, requestInfo } from '@/server/http';

export const runtime = 'nodejs';

/** POST /api/auth/login — email + password sign-in. Always answers "Invalid credentials" for any mismatch. */
export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, loginSchema);
  if ('error' in parsed) return parsed.error;
  const { email, password } = parsed.data;
  const info = requestInfo(req);

  try {
    const lock = await loginLockout(email, info.ip);
    if (lock.locked) {
      await recordAudit({ action: 'login.locked', severity: 'warning', description: `Locked sign-in attempt for ${email}`, actor: { name: email, role: 'unknown' }, request: info, metadata: { reason: 'too_many_attempts' } });
      return jsonError(429, `Too many failed sign-in attempts. Try again in ${lock.retryAfterMinutes} minutes.`);
    }

    const user = await getUserByEmail(email);
    const matches = await verifyPassword(password, user?.password_hash ?? (await dummyHash()));

    if (!user || !matches) {
      await recordLoginAttempt(email, info.ip, false);
      await recordAudit({ action: 'login.failed', severity: 'warning', description: `Failed login for ${email}`, actor: { id: user?.id ?? null, name: user?.name ?? email, role: user?.role ?? 'unknown' }, request: info, metadata: { reason: user ? 'invalid_password' : 'user_not_found' } });
      return jsonError(401, 'Invalid credentials');
    }
    if (!user.is_active) {
      await recordAudit({ action: 'login.rejected', severity: 'warning', description: `Inactive account ${email} tried to sign in`, actor: { id: user.id, name: user.name, role: user.role }, request: info });
      return jsonError(403, 'This user account is inactive. Contact an administrator.');
    }

    const cookieValue = await createSession(user.id, { ip: info.ip, userAgent: info.userAgent });
    await Promise.all([
      recordLoginAttempt(email, info.ip, true),
      touchLastLogin(user.id),
      recordAudit({ action: 'login.succeeded', description: `${user.name} signed in`, actor: { id: user.id, name: user.name, role: user.role }, request: info }),
    ]);

    const response = NextResponse.json({ success: true, user: toPublicUser(user) });
    response.cookies.set(env.session.cookieName, cookieValue, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return jsonError(500, 'Server error during login');
  }
}
