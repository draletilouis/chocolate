/** Small provider-neutral error boundary. Deployments can attach Sentry,
 * OpenTelemetry, or another reporter through globalThis without changing routes. */
export function captureException(error: unknown, context: Record<string, unknown> = {}) {
  const normalized = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) };
  console.error(JSON.stringify({ level: 'error', event: 'api.exception', ...context, error: normalized }));
  const dsn = process.env.SENTRY_DSN;
  if (dsn) {
    try {
      const parsed = new URL(dsn);
      const project = parsed.pathname.replace(/^\//, '');
      const key = parsed.username;
      const endpoint = `${parsed.protocol}//${parsed.host}/api/${project}/store/?sentry_version=7&sentry_key=${encodeURIComponent(key)}`;
      void fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        message: normalized.message, level: 'error', platform: 'javascript', server_name: process.env.APP_DOMAIN || undefined,
        exception: { values: [{ type: normalized.name || 'Error', value: normalized.message, stacktrace: normalized.stack ? { frames: [{ filename: 'server' }] } : undefined }] }, extra: context,
      }) }).catch(() => undefined);
    } catch { /* malformed monitoring configuration must not break the request */ }
  }
  const reporter = (globalThis as typeof globalThis & { __cocoaErrorReporter?: (error: unknown, context: Record<string, unknown>) => void }).__cocoaErrorReporter;
  try { reporter?.(error, context); } catch { /* monitoring must never break the request */ }
}
