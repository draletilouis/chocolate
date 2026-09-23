import { NextResponse } from 'next/server';
import { ensureSchema, query } from '@/server/db';
import { captureException } from '@/server/monitoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Liveness/readiness endpoint for a reverse proxy or container orchestrator. */
export async function GET() {
  try {
    await ensureSchema();
    await query('SELECT 1');
    return NextResponse.json({ status: 'ok', database: 'ok', timestamp: new Date().toISOString() });
  } catch (error) {
    captureException(error, { endpoint: '/api/health' });
    return NextResponse.json({ status: 'degraded', database: 'unavailable', timestamp: new Date().toISOString() }, { status: 503 });
  }
}
