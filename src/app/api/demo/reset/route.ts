import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, clearCookie, currentSession, errorResponse, jsonError, sameOrigin } from '@/server/http';
import { isDemo, resetDemo } from '@/server/state';

/** Demo instances only: a manager puts the sample factory back. Everyone is signed out. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return jsonError(403, 'Reset from the app itself.');
  if (!isDemo()) return jsonError(404, 'Not found.');
  try {
    const session = await currentSession();
    if (!session || session.user.access !== 'manager') return jsonError(403, 'Only a manager can reset the demo.');
    await resetDemo();
    await clearCookie(SESSION_COOKIE);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
