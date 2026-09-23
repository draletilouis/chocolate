import { createHash, randomBytes, randomInt } from 'crypto';
import { query, queryOne } from '../db';
import { env } from '../env';
import { recordAudit } from './audit';
import { mailConfigured, sendMail } from './mail';
import { destroyUserSessions } from './session';
import { getUserByEmail, normalizeEmail, setPassword } from './users';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

interface ResetRow { id: string; user_id: number | null; email: string; code_hash: string; attempts: number; verified: boolean; token_hash: string | null; consumed: boolean; }

/**
 * Step 1: a 6-digit code is emailed (valid 15 minutes, one request per minute per email).
 * The response never reveals whether the email belongs to an account.
 */
export async function requestReset(email: string, ip: string | null) {
  const normalized = normalizeEmail(email);
  if (!mailConfigured() && env.isProduction) throw Object.assign(new Error('Recovery email is not configured. Contact your administrator.'), { status: 503 });

  const recent = await queryOne<{ id: string }>(
    `SELECT id FROM password_resets WHERE email = $1 AND created_at > NOW() - INTERVAL '1 minute' ORDER BY created_at DESC LIMIT 1`, [normalized],
  );
  if (recent) return { success: true, requestId: recent.id, message: 'Check your email for the code already sent.' };

  const user = await getUserByEmail(normalized);
  const id = randomBytes(24).toString('hex');
  const code = randomInt(100000, 1000000).toString();
  await query(
    `INSERT INTO password_resets (id, user_id, email, code_hash, expires_at) VALUES ($1, $2, $3, $4, NOW() + ($5 || ' minutes')::interval)`,
    [id, user && user.is_active ? user.id : null, normalized, digest(id + code), String(env.recovery.codeMinutes)],
  );
  await recordAudit({ action: 'password_reset.requested', description: `Password reset requested for ${normalized}`, actor: { id: user?.id ?? null, name: normalized }, request: { ip }, metadata: { accountFound: Boolean(user) } });

  let devCode: string | undefined;
  if (user && user.is_active) {
    if (mailConfigured()) {
      try {
        await sendMail({
          to: normalized, subject: 'Reset your Cocoa Factory password',
          text: `Your Cocoa Factory reset code is ${code}. It expires in ${env.recovery.codeMinutes} minutes. If you did not request this, ignore this email.`,
          html: `<p>Your Cocoa Factory reset code is <strong>${code}</strong>.</p><p>It expires in ${env.recovery.codeMinutes} minutes. If you did not request this, ignore this email.</p>`,
        });
      } catch (error) {
        await query('DELETE FROM password_resets WHERE id = $1', [id]);
        console.error('Recovery email failed:', error);
        throw Object.assign(new Error('Unable to send recovery email. Please try again later.'), { status: 503 });
      }
    } else {
      // Development only: no mail server, so surface the code in the server log (and response).
      console.log(`[dev] Password reset code for ${normalized}: ${code}`);
      devCode = code;
    }
  }
  return { success: true, requestId: id, message: 'If that email belongs to an account, a reset code has been sent.', ...(devCode ? { devCode } : {}) };
}

/** Step 2: the code is exchanged for a short-lived reset token (5 attempts, 5-minute token). */
export async function verifyReset(requestId: string, code: string) {
  const row = await queryOne<ResetRow>(`SELECT * FROM password_resets WHERE id = $1 AND consumed = FALSE AND expires_at > NOW()`, [requestId]);
  if (!row) return { success: false, message: 'This reset code has expired. Request a new one.' };
  if (row.attempts >= env.recovery.maxCodeAttempts) return { success: false, message: 'Too many attempts. Please request a new reset code.' };
  if (!row.user_id || digest(row.id + code) !== row.code_hash) {
    await query('UPDATE password_resets SET attempts = attempts + 1 WHERE id = $1', [requestId]);
    return { success: false, message: 'Incorrect code.', attemptsRemaining: env.recovery.maxCodeAttempts - row.attempts - 1 };
  }
  const token = randomBytes(32).toString('hex');
  await query(
    `UPDATE password_resets SET verified = TRUE, token_hash = $2, token_expires_at = NOW() + ($3 || ' minutes')::interval WHERE id = $1`,
    [requestId, digest(token), String(env.recovery.tokenMinutes)],
  );
  return { success: true, resetToken: token, message: 'Code verified. Choose a new password.' };
}

/** Step 3: the token sets a new credential, invalidates every session of the account and is consumed. */
export async function confirmReset(resetToken: string, newPassword: string, ip: string | null) {
  const row = await queryOne<ResetRow>(
    `SELECT * FROM password_resets WHERE token_hash = $1 AND verified = TRUE AND consumed = FALSE AND token_expires_at > NOW()`, [digest(resetToken)],
  );
  if (!row || !row.user_id) return { success: false, message: 'This reset link has expired. Start again.' };
  await setPassword(row.user_id, newPassword, { resetRequired: false });
  await query('UPDATE password_resets SET consumed = TRUE WHERE id = $1', [row.id]);
  await destroyUserSessions(row.user_id);
  await recordAudit({ action: 'password_reset.completed', description: `Password reset completed for ${row.email}`, actor: { id: row.user_id, name: row.email }, request: { ip } });
  return { success: true, message: 'Password updated. You can sign in now.' };
}
