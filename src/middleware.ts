import { NextResponse, type NextRequest } from 'next/server';
import { unsignValue } from '@/lib/auth/cookie-signature';

/**
 * Edge guard. API requests need a session cookie with a valid signature or get 401 straight away.
 * Page requests carry their path through to app/(app)/layout.tsx, which validates the session
 * against the database and redirects to /login (with a relative Location, so the browser stays on
 * whatever host it used and the cookie always matches). Every route handler validates again via getSession.
 */
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/password-reset', '/api/health'];
const cookieName = process.env.SESSION_COOKIE_NAME || 'cocoa.sid';
const secret = process.env.SESSION_SECRET || 'dev-secret-only-change-me-please-0123456789';

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  const signed = req.cookies.get(cookieName)?.value;
  const valid = signed ? await unsignValue(signed, secret) : null;
  if (pathname.startsWith('/api/') && !valid) {
    return NextResponse.json({ success: false, message: 'Authentication required' }, { status: 401 });
  }

  const headers = new Headers(req.headers);
  headers.set('x-pathname', pathname + search);
  const response = NextResponse.next({ request: { headers } });
  if (signed && !valid) response.cookies.set(cookieName, '', { path: '/', maxAge: 0 });
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)'],
};
