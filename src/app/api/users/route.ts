import { NextResponse } from 'next/server';
import { createUserSchema } from '@/lib/auth/validation';
import { recordAudit } from '@/server/auth/audit';
import { createUser, listUsers } from '@/server/auth/users';
import { parseBody, requestInfo, withAuth } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/users — staff accounts (any signed-in user; needed to attribute records). */
export const GET = withAuth(async () => NextResponse.json({ success: true, users: await listUsers() }));

/** POST /api/users — admins create accounts; new accounts must change their password on first sign-in. */
export const POST = withAuth(async (req, { session }) => {
  const parsed = await parseBody(req, createUserSchema);
  if ('error' in parsed) return parsed.error;
  const user = await createUser({ ...parsed.data, passwordResetRequired: true });
  await recordAudit({ category: 'administration', action: 'user.created', entityType: 'users', entityId: user.id, description: `${session.user.name} created account ${user.email}`, actor: { id: session.user.id, name: session.user.name, role: session.user.role }, request: requestInfo(req), metadata: { role: user.role } });
  return NextResponse.json({ success: true, user }, { status: 201 });
}, { admin: true });
