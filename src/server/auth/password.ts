import bcrypt from 'bcryptjs';
import { env } from '../env';

/** Same credential rule as StockMaster: a 4-digit PIN or a password of 8+ characters, at most 72 bytes (bcrypt limit). */
export function isValidCredential(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (Buffer.byteLength(value, 'utf8') > 72) return false;
  return /^\d{4}$/.test(value) || (value.length >= 8 && value.trim().length >= 8);
}

export const CREDENTIAL_RULE = 'Choose a 4-digit PIN or a password of 8 or more characters (maximum 72 bytes).';

export function hashPassword(password: string) {
  return bcrypt.hash(password, env.bcryptRounds);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

// Compared against when no account matches so the response time does not reveal whether an email exists.
let dummyHashPromise: Promise<string> | undefined;
export function dummyHash() {
  dummyHashPromise ??= bcrypt.hash('cocoa-dummy-credential', env.bcryptRounds);
  return dummyHashPromise;
}
