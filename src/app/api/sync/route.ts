import type { NextRequest } from 'next/server';
import { touchSession } from '@/server/auth';
import { currentSession, errorResponse, jsonError } from '@/server/http';
import { changesSince } from '@/server/state';

/** Everything, or what changed since ?since=<version>. ?active=1 means the person used the app since the last check. */
export async function GET(req: NextRequest) {
  try {
    const session = await currentSession();
    if (!session) return jsonError(401, 'Your session has ended. Sign in again.', { signedOut: true });
    if (req.nextUrl.searchParams.get('active') === '1') await touchSession(session.tokenHash);
    return Response.json(await changesSince(Number(req.nextUrl.searchParams.get('since')) || 0));
  } catch (error) {
    return errorResponse(error);
  }
}
