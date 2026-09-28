import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { signInSchema } from '@/lib/commands';
import { DEVICE_MAX_AGE, SESSION_MAX_AGE, endSession, setRecordingAs, signInWithPassword, signInWithPin, trustDevice } from '@/server/auth';
import { DEVICE_COOKIE, SESSION_COOKIE, clearCookie, currentDevice, currentSession, errorResponse, jsonError, readCookie, sameOrigin, setCookie } from '@/server/http';
import { isDemo, readState } from '@/server/state';

/** Who is signed in; when nobody is, what the sign-in screen may show on this device */
export async function GET() {
  try {
    const session = await currentSession();
    if (session) return Response.json({ signedIn: true, user: session.user, recordingAsId: session.recordingAs?.id ?? null, demo: isDemo() });
    const { state } = await readState();
    const device = await currentDevice();
    // Staff names are only listed on devices a manager has set up (or in the demo).
    const trusted = isDemo() || Boolean(device);
    return Response.json({
      signedIn: false,
      firstRun: state.users.length === 0,
      trustedDevice: trusted,
      demo: isDemo(),
      people: trusted ? state.users.map(({ id, name, initials, role }) => ({ id, name, initials, role })) : [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Sign in with a PIN (set-up devices only) or with email and password */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return jsonError(403, 'Sign in from the app itself.');
  try {
    const body = signInSchema.parse(await req.json());
    const device = await currentDevice();
    if (body.method === 'pin') {
      if (!isDemo() && !device) return jsonError(403, 'Quick sign-in works on devices a manager has set up. Sign in with email and password.');
      const result = await signInWithPin(body.userId, body.pin, device?.id ?? null);
      if (!result.ok) return jsonError(result.status, result.error);
      await setCookie(req, SESSION_COOKIE, result.token, SESSION_MAX_AGE);
      return Response.json({ user: result.user, recordingAsId: null, demo: isDemo() });
    }
    const result = await signInWithPassword(body.email, body.password, device?.id ?? null);
    if (!result.ok) return jsonError(result.status, result.error);
    await setCookie(req, SESSION_COOKIE, result.token, SESSION_MAX_AGE);
    let notice: string | undefined;
    if (body.trustDevice && !device) {
      if (result.user.access === 'manager') {
        const trusted = await trustDevice(body.deviceName || 'Shared device', result.user.id);
        await setCookie(req, DEVICE_COOKIE, trusted.token, DEVICE_MAX_AGE);
      } else {
        notice = 'Only a manager can set up a shared device for quick sign-in.';
      }
    }
    return Response.json({ user: result.user, recordingAsId: null, demo: isDemo(), notice });
  } catch (error) {
    return errorResponse(error);
  }
}

/** A manager records on someone else's behalf (or back as themselves with null) */
export async function PATCH(req: NextRequest) {
  if (!sameOrigin(req)) return jsonError(403, 'Change this from the app itself.');
  try {
    const session = await currentSession();
    if (!session) return jsonError(401, 'Your session has ended. Sign in again.');
    if (session.user.access !== 'manager') return jsonError(403, 'Only managers can record on someone else’s behalf.');
    const { recordingAs } = z.object({ recordingAs: z.string().nullable() }).parse(await req.json());
    const { state } = await readState();
    if (recordingAs && !state.users.some((u) => u.id === recordingAs)) return jsonError(400, 'That person was not found.');
    await setRecordingAs(session, recordingAs === session.user.id ? null : recordingAs);
    return Response.json({ user: session.user, recordingAsId: recordingAs === session.user.id ? null : recordingAs, demo: isDemo() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return jsonError(403, 'Sign out from the app itself.');
  try {
    await endSession(await readCookie(SESSION_COOKIE));
    await clearCookie(SESSION_COOKIE);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
