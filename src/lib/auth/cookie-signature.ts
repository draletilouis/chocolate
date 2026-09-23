/**
 * Signed session cookies (value = id.signature), the same idea as express-session's
 * cookie-signature. Uses Web Crypto so it runs in both the Node runtime and the
 * edge middleware.
 */
const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toBase64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

export async function signValue(value: string, secret: string) {
  return `${value}.${await hmac(value, secret)}`;
}

/** Returns the unsigned value when the signature is valid, otherwise null. */
export async function unsignValue(signed: string | undefined | null, secret: string): Promise<string | null> {
  if (!signed) return null;
  const dot = signed.lastIndexOf('.');
  if (dot <= 0) return null;
  const value = signed.slice(0, dot);
  const signature = signed.slice(dot + 1);
  const expected = await hmac(value, secret);
  if (expected.length !== signature.length) return null;
  // Constant-time comparison
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0 ? value : null;
}
