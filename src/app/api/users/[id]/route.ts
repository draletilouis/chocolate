import { NextResponse } from 'next/server';
import { updateUserSchema } from '@/lib/auth/validation';
import { recordAudit } from '@/server/auth/audit';
import { destroyUserSessions } from '@/server/auth/session';
import { countActiveAdmins, getUserById, setPassword, updateUser } from '@/server/auth/users';
import { jsonError, parseBody, requestInfo, withAuth } from '@/server/http';

export const runtime = 'nodejs';

/** PATCH /api/users/:id — admins rename, change role, deactivate/reactivate, or issue a temporary password. */
export const PATCH = withAuth(async (req, { session, params }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return jsonError(400, 'Invalid user id');
  const parsed = await parseBody(req, updateUserSchema);
  if ('error' in parsed) return parsed.error;
  const target = await getUserById(id);
  if (!target) return jsonError(404, 'User not found');

  const { newPassword, ...patch } = parsed.data;
  const demotingOrDeactivatingAdmin = target.role === 'admin' && target.is_active && (patch.isActive === false || (patch.role && patch.role !== 'admin'));
  if (demotingOrDeactivatingAdmin && (await countActiveAdmins()) <= 1) return jsonError(400, 'At least one active admin is required');
  if (id === session.user.id && (patch.isActive === false || (patch.role && patch.role !== 'admin'))) return jsonError(400, 'You cannot deactivate or demote your own account');

  const user = await updateUser(id, patch);
  const actor = { id: session.user.id, name: session.user.name, role: session.user.role };
  if (patch.isActive === false) {
    await destroyUserSessions(id);
    await recordAudit({ category: 'administration', action: 'user.deactivated', entityType: 'users', entityId: id, description: `${session.user.name} deactivated ${target.email}`, actor, request: requestInfo(req) });
  } else if (patch.isActive === true && !target.is_active) {
    await recordAudit({ category: 'administration', action: 'user.reactivated', entityType: 'users', entityId: id, description: `${session.user.name} reactivated ${target.email}`, actor, request: requestInfo(req) });
  }
  if (patch.role && patch.role !== target.role) {
    await recordAudit({ category: 'administration', action: 'user.role_changed', entityType: 'users', entityId: id, description: `${session.user.name} changed ${target.email} to ${patch.role}`, actor, request: requestInfo(req), metadata: { from: target.role, to: patch.role } });
  }
  if (newPassword) {
    // Temporary password: the user must choose their own at next sign-in; existing sessions end.
    await setPassword(id, newPassword, { resetRequired: true });
    await destroyUserSessions(id);
    await recordAudit({ category: 'administration', action: 'user.password_reset', entityType: 'users', entityId: id, description: `${session.user.name} issued a temporary password to ${target.email}`, actor, request: requestInfo(req) });
  }
  return NextResponse.json({ success: true, user: newPassword ? await updateUser(id, {}) : user });
}, { admin: true });
