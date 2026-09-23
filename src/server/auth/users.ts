import { query, queryOne } from '../db';
import { hashPassword } from './password';

export type Role = 'admin' | 'operator';

export interface UserRow {
  id: number;
  email: string;
  name: string;
  role: Role;
  role_label: string | null;
  password_hash: string;
  is_active: boolean;
  password_reset_required: boolean;
  created_at: string;
  last_login_at: string | null;
}

/** What the browser is allowed to see about an account (never the hash). */
export interface PublicUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  roleLabel: string;
  initials: string;
  isActive: boolean;
  passwordResetRequired: boolean;
  lastLoginAt: string | null;
}

const ROLE_LABELS: Record<Role, string> = { admin: 'Production manager', operator: 'Operator' };

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    roleLabel: row.role_label || ROLE_LABELS[row.role],
    initials: row.name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase(),
    isActive: row.is_active,
    passwordResetRequired: row.password_reset_required,
    lastLoginAt: row.last_login_at,
  };
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function getUserByEmail(email: string) {
  return queryOne<UserRow>('SELECT * FROM users WHERE LOWER(TRIM(email)) = $1', [normalizeEmail(email)]);
}

export function getUserById(id: number) {
  return queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
}

export async function listUsers() {
  const result = await query<UserRow>('SELECT * FROM users ORDER BY is_active DESC, name ASC');
  return result.rows.map(toPublicUser);
}

export async function createUser(input: { name: string; email: string; role: Role; roleLabel?: string; password: string; passwordResetRequired?: boolean }) {
  const existing = await getUserByEmail(input.email);
  if (existing) throw Object.assign(new Error('An account with this email already exists'), { status: 409 });
  const row = await queryOne<UserRow>(
    `INSERT INTO users (email, name, role, role_label, password_hash, password_reset_required)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [normalizeEmail(input.email), input.name.trim(), input.role, input.roleLabel?.trim() || null, await hashPassword(input.password), input.passwordResetRequired ?? true],
  );
  return toPublicUser(row!);
}

export async function updateUser(id: number, patch: { name?: string; role?: Role; roleLabel?: string | null; isActive?: boolean }) {
  const row = await queryOne<UserRow>(
    `UPDATE users SET
       name = COALESCE($2, name),
       role = COALESCE($3, role),
       role_label = CASE WHEN $4::boolean THEN $5 ELSE role_label END,
       is_active = COALESCE($6, is_active),
       updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, patch.name?.trim() ?? null, patch.role ?? null, patch.roleLabel !== undefined, patch.roleLabel ?? null, patch.isActive ?? null],
  );
  return row ? toPublicUser(row) : null;
}

export async function setPassword(id: number, password: string, options: { resetRequired: boolean }) {
  await query('UPDATE users SET password_hash = $2, password_reset_required = $3, updated_at = NOW() WHERE id = $1', [id, await hashPassword(password), options.resetRequired]);
}

export function countActiveAdmins() {
  return queryOne<{ count: string }>(`SELECT COUNT(*)::text AS count FROM users WHERE role = 'admin' AND is_active`).then((r) => Number(r?.count ?? 0));
}

export function touchLastLogin(id: number) {
  return query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [id]);
}
