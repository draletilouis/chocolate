import type { NextRequest } from 'next/server';
import { firstManagerSchema } from '@/lib/commands';
import { DEVICE_MAX_AGE, SESSION_MAX_AGE, createFirstManager, trustDevice } from '@/server/auth';
import { DEVICE_COOKIE, SESSION_COOKIE, errorResponse, jsonError, sameOrigin, setCookie } from '@/server/http';
import { isDemo } from '@/server/state';

/** First start of a real factory: create the first manager, sign them in and set up this device */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return jsonError(403, 'Set up the factory from the app itself.');
  try {
    const input = firstManagerSchema.parse(await req.json());
    const result = await createFirstManager(input);
    if (!result.ok) return jsonError(result.status, result.error);
    await setCookie(req, SESSION_COOKIE, result.token, SESSION_MAX_AGE);
    const device = await trustDevice(input.deviceName || 'Manager’s device', result.user.id);
    await setCookie(req, DEVICE_COOKIE, device.token, DEVICE_MAX_AGE);
    return Response.json({ user: result.user, recordingAsId: null, demo: isDemo() });
  } catch (error) {
    return errorResponse(error);
  }
}
