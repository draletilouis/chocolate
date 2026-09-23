/**
 * Server configuration read from the environment (see .env.example).
 * Mirrors the StockMaster conventions: POSTGRES_* connection settings, SESSION_SECRET,
 * BCRYPT_ROUNDS and rate-limit windows. Production refuses to start without secrets.
 */
const isProduction = process.env.NODE_ENV === 'production';
/** `next build` loads server modules to collect page data; secrets are only needed once the server runs. */
const isBuild = process.env.NEXT_PHASE === 'phase-production-build';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    if (isProduction && !isBuild) throw new Error(`Required environment variable missing: ${name}`);
    return '';
  }
  return value;
}

const int = (name: string, fallback: number) => {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sessionSecret = required('SESSION_SECRET', isProduction ? undefined : 'dev-secret-only-change-me-please-0123456789');
if (isProduction && !isBuild && sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters in production');

export const env = {
  isProduction,
  postgres: {
    /** A full connection string (as Railway and most hosts provide) takes precedence over the separate POSTGRES_* settings */
    url: process.env.DATABASE_URL || '',
    host: required('POSTGRES_HOST', '127.0.0.1'),
    port: int('POSTGRES_PORT', 5432),
    database: required('POSTGRES_DB', 'cocoa_production'),
    user: required('POSTGRES_USER', 'postgres'),
    password: process.env.POSTGRES_PASSWORD ?? '',
    ssl: (process.env.POSTGRES_SSL ?? 'false') === 'true',
    poolMax: int('PG_POOL_MAX', 5),
    /** Optional schema for the auth tables (must be a plain identifier); empty means public */
    schema: /^[a-z_][a-z0-9_]*$/i.test(process.env.POSTGRES_SCHEMA ?? '') && process.env.POSTGRES_SCHEMA !== 'public' ? process.env.POSTGRES_SCHEMA! : '',
  },
  session: {
    secret: sessionSecret,
    cookieName: process.env.SESSION_COOKIE_NAME || 'cocoa.sid',
    ttlDays: int('SESSION_TTL_DAYS', 30),
    idleMinutes: int('SESSION_IDLE_MINUTES', 720),
    secureCookie: isProduction || (process.env.APP_URL ?? '').startsWith('https://'),
  },
  bcryptRounds: int('BCRYPT_ROUNDS', 10),
  login: { maxAttempts: int('LOGIN_MAX_ATTEMPTS', 5), lockoutMinutes: int('LOGIN_LOCKOUT_MINUTES', 15), ipMaxAttempts: int('LOGIN_IP_MAX_ATTEMPTS', 30) },
  recovery: { maxRequests: int('RECOVERY_MAX_REQUESTS', 20), windowMinutes: 15, codeMinutes: 15, tokenMinutes: 5, maxCodeAttempts: 5 },
  mail: {
    host: process.env.SMTP_HOST || '',
    port: int('SMTP_PORT', 587),
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.MAIL_FROM || 'Cocoa Factory <no-reply@example.com>',
  },
  appUrl: process.env.APP_URL || 'http://127.0.0.1:3100',
  trustProxy: (process.env.TRUST_PROXY ?? (isProduction ? 'true' : 'false')) === 'true',
};
