import { NextResponse } from 'next/server';
import { getSession } from '@/server/auth/session';
import { jsonError } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/auth/me — the signed-in user, refreshed from the database. */
export async function GET() {
  const session = await getSession();
  if (!session) return jsonError(401, 'Authentication required');
  return NextResponse.json({ success: true, user: session.user });
}
