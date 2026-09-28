import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const scryptAsync = (secret: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scrypt(secret, salt, keylen, options, (error, key) => (error ? reject(error) : resolve(key))));

const PARAMS = { N: 16384, r: 8, p: 1 };

/** Passwords and PINs are stored only as salted scrypt hashes */
export async function hashSecret(secret: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(secret, salt, 32, PARAMS);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifySecret(secret: string, stored: string | null | undefined) {
  // Take the same time whether or not the account exists, so timing does not reveal who has one.
  if (!stored) { await hashSecret(secret); return false; }
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scryptAsync(secret, Buffer.from(saltB64, 'base64'), expected.length, PARAMS);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Random token for a cookie; only its hash is stored */
export const newToken = () => randomBytes(32).toString('base64url');
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const shortId = () => randomBytes(4).toString('hex');
