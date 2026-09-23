import { NextResponse } from 'next/server';
import { changePasswordSchema } from '@/lib/auth/validation';
import { recordAudit } from '@/server/auth/audit';
import { verifyPassword } from '@/server/auth/password';
import { destroyUserSessions } from '@/server/auth/session';
import { getUserById, setPassword } from '@/server/auth/users';
import { jsonError, parseBody, requestInfo, withAuth } from '@/server/http';

export const runtime = 'nodejs';

/** POST /api/auth/change-password — requires the current password; other sessions of the account are ended. */
export const POST = withAuth(async (req, { session }) => {
  const parsed = await parseBody(req, changePasswordSchema);
  if ('error' in parsed) return parsed.error;
  const user = await getUserById(session.user.id);
  if (!user) return jsonError(404, 'User not found');
  if (!(await verifyPassword(parsed.data.currentPassword, user.password_hash))) return jsonError(400, 'Current password is incorrect');
  if (parsed.data.currentPassword === parsed.data.newPassword) return jsonError(400, 'Choose a different password');

  await setPassword(user.id, parsed.data.newPassword, { resetRequired: false });
  await destroyUserSessions(user.id, session.sidHash);
  await recordAudit({ action: 'password.changed', entityType: 'users', entityId: user.id, description: `${user.name} changed their password`, actor: { id: user.id, name: user.name, role: user.role }, request: requestInfo(req) });
  return NextResponse.json({ success: true, message: 'Password changed successfully' });
});
