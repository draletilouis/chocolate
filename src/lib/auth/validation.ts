import { z } from 'zod';

/** Same credential rule as the server: 4-digit PIN or 8+ character password, at most 72 bytes. */
const credential = z.string().max(72, 'Passwords are limited to 72 characters').refine(
  (v) => /^\d{4}$/.test(v) || (v.length >= 8 && v.trim().length >= 8),
  'Choose a 4-digit PIN or a password of 8 or more characters',
);

export const emailField = z.string().trim().toLowerCase().email('A valid email is required').max(254);

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required').max(72),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(72),
  newPassword: credential,
});

export const resetRequestSchema = z.object({ email: emailField });
export const resetVerifySchema = z.object({ requestId: z.string().regex(/^[0-9a-f]{48}$/, 'Invalid request'), code: z.string().regex(/^\d{6}$/, 'Reset code must be 6 digits') });
export const resetConfirmSchema = z.object({ resetToken: z.string().regex(/^[0-9a-f]{64}$/, 'Invalid reset token'), newPassword: credential });

export const roleField = z.enum(['admin', 'operator']);
export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  email: emailField,
  role: roleField,
  roleLabel: z.string().trim().max(60).optional(),
  password: credential,
});
export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  role: roleField.optional(),
  roleLabel: z.string().trim().max(60).nullable().optional(),
  isActive: z.boolean().optional(),
  newPassword: credential.optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
