import { NextResponse, type NextRequest } from 'next/server';
import { recordAudit } from '@/server/auth/audit';
import { destroySession, getSession } from '@/server/auth/session';
import { env } from '@/server/env';
import { jsonError, requestInfo, sameOrigin } from '@/server/http';

export const runtime = 'nodejs';

/** POST /api/auth/logout — destroys the server-side session and clears the cookie. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return jsonError(403, 'Cross-site request rejected');
  const session = await getSession();
  if (session) {
    await recordAudit({ action: 'logout', description: `${session.user.name} signed out`, actor: { id: session.user.id, name: session.user.name, role: session.user.role }, request: requestInfo(req) });
  }
  await destroySession(req.cookies.get(env.session.cookieName)?.value);
  const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
  response.cookies.set(env.session.cookieName, '', { ...sessionCookieOptionsForClear() });
  return response;
}

function sessionCookieOptionsForClear() {
  return { httpOnly: true, secure: env.session.secureCookie, sameSite: 'lax' as const, path: '/', maxAge: 0 };
}
