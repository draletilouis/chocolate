import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { findDevice, findSession, type Session } from './auth';
import { CommandError } from './reduce';

export const SESSION_COOKIE = 'cf_session';
export const DEVICE_COOKIE = 'cf_device';

/** Cookies are marked Secure whenever the site is reached over HTTPS (Railway forwards that in a header) */
const isHttps = (req: NextRequest) => req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';

export async function setCookie(req: NextRequest, name: string, value: string, maxAge: number) {
  (await cookies()).set(name, value, { httpOnly: true, sameSite: 'lax', secure: isHttps(req), path: '/', maxAge });
}

export async function clearCookie(name: string) {
  (await cookies()).delete(name);
}

export async function readCookie(name: string) {
  return (await cookies()).get(name)?.value;
}

export async function currentSession(): Promise<Session | null> {
  return findSession(await readCookie(SESSION_COOKIE));
}

export async function currentDevice() {
  return findDevice(await readCookie(DEVICE_COOKIE));
}

/** Changes must come from this app's own pages, not a form on another site */
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const jsonError = (status: number, error: string, extra?: Record<string, unknown>) => Response.json({ error, ...extra }, { status });

/** Turns a failure into an answer the app can show: validation and rule errors are explained, the rest is logged */
export function errorResponse(error: unknown) {
  if (error instanceof CommandError) return jsonError(400, error.message);
  if (error instanceof ZodError) return jsonError(400, error.issues[0]?.message ?? 'That request was not valid.');
  if (error instanceof SyntaxError) return jsonError(400, 'That request was not valid.');
  if (error instanceof Error && error.message.startsWith('No database is set up')) return jsonError(503, error.message);
  console.error(error);
  return jsonError(500, 'Something went wrong on the server. Try again.');
}
