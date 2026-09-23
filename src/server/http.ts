import { NextResponse, type NextRequest } from 'next/server';
import type { ZodType } from 'zod';
import { getSession, type SessionInfo } from './auth/session';
import { env } from './env';

export const jsonError = (status: number, message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ success: false, message, ...extra }, { status });

export function clientIp(req: NextRequest): string | null {
  if (env.trustProxy) {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    const real = req.headers.get('x-real-ip');
    if (real) return real;
  }
  return null;
}

export const requestInfo = (req: NextRequest) => ({
  method: req.method, path: req.nextUrl.pathname, ip: clientIp(req), userAgent: req.headers.get('user-agent'),
});

/**
 * CSRF guard for state-changing requests: the session cookie is SameSite=Lax, and on top of that
 * cross-site requests are rejected unless the Origin matches this host.
 */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return req.headers.get('sec-fetch-site') !== 'cross-site';
  try { return new URL(origin).host === req.headers.get('host'); } catch { return false; }
}

/** Parses and validates a JSON body; returns a 400 response on failure. */
export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<{ data: T } | { error: NextResponse }> {
  if (!sameOrigin(req)) return { error: jsonError(403, 'Cross-site request rejected') };
  let raw: unknown;
  try { raw = await req.json(); } catch { return { error: jsonError(400, 'Invalid JSON body') }; }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    return { error: jsonError(400, first?.message ?? 'Invalid request', { errors: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }) };
  }
  return { data: result.data };
}

type Handler = (req: NextRequest, ctx: { session: SessionInfo; params: Record<string, string> }) => Promise<NextResponse>;

/** Wraps a route handler so it only runs for signed-in users (and optionally admins). */
export function withAuth(handler: Handler, options: { admin?: boolean } = {}) {
  return async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    const session = await getSession();
    if (!session) return jsonError(401, 'Authentication required');
    if (options.admin && session.user.role !== 'admin') return jsonError(403, 'Admin privileges required');
    const params = (await context.params) ?? {};
    try {
      return await handler(req, { session, params });
    } catch (error) {
      const status = (error as { status?: number }).status ?? 500;
      console.error('API error:', error);
      return jsonError(status, status < 500 || !env.isProduction ? (error as Error).message : 'An error occurred');
    }
  };
}
