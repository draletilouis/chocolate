import { NextResponse, type NextRequest } from 'next/server';
import { resetConfirmSchema, resetRequestSchema, resetVerifySchema } from '@/lib/auth/validation';
import { windowLimit } from '@/server/auth/rate-limit';
import { confirmReset, requestReset, verifyReset } from '@/server/auth/recovery';
import { env } from '@/server/env';
import { clientIp, jsonError, parseBody } from '@/server/http';

export const runtime = 'nodejs';

/**
 * POST /api/auth/password-reset/request | verify | confirm
 * Three-step email recovery, rate limited per IP (RECOVERY_MAX_REQUESTS per 15 minutes).
 */
export async function POST(req: NextRequest, context: { params: Promise<{ step: string }> }) {
  const { step } = await context.params;
  const ip = clientIp(req);
  if (!(await windowLimit(`recovery:${ip ?? 'unknown'}`, env.recovery.maxRequests, env.recovery.windowMinutes))) {
    return jsonError(429, 'Too many recovery attempts. Try again later.');
  }
  try {
    if (step === 'request') {
      const parsed = await parseBody(req, resetRequestSchema);
      if ('error' in parsed) return parsed.error;
      return NextResponse.json(await requestReset(parsed.data.email, ip));
    }
    if (step === 'verify') {
      const parsed = await parseBody(req, resetVerifySchema);
      if ('error' in parsed) return parsed.error;
      return NextResponse.json(await verifyReset(parsed.data.requestId, parsed.data.code));
    }
    if (step === 'confirm') {
      const parsed = await parseBody(req, resetConfirmSchema);
      if ('error' in parsed) return parsed.error;
      return NextResponse.json(await confirmReset(parsed.data.resetToken, parsed.data.newPassword, ip));
    }
    return jsonError(404, 'Unknown step');
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status) return jsonError(status, (error as Error).message);
    console.error('Password reset error:', error);
    return jsonError(500, 'Recovery is temporarily unavailable.');
  }
}
