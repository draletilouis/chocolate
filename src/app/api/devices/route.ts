import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { DEVICE_MAX_AGE, listDevices, removeDevice, trustDevice } from '@/server/auth';
import { DEVICE_COOKIE, clearCookie, currentDevice, currentSession, errorResponse, jsonError, sameOrigin, setCookie } from '@/server/http';

async function manager() {
  const session = await currentSession();
  if (!session) return { error: jsonError(401, 'Your session has ended. Sign in again.') };
  if (session.user.access !== 'manager') return { error: jsonError(403, 'Only managers can manage devices.') };
  return { session };
}

/** Devices set up for quick PIN sign-in */
export async function GET() {
  try {
    const { error } = await manager();
    if (error) return error;
    const current = await currentDevice();
    return Response.json({ devices: (await listDevices()).map((d) => ({ ...d, current: d.id === current?.id })) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Set up this device for quick sign-in */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return jsonError(403, 'Set up devices from the app itself.');
  try {
    const { session, error } = await manager();
    if (error) return error;
    const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(await req.json());
    if (await currentDevice()) return jsonError(400, 'This device is already set up.');
    const device = await trustDevice(name, session.user.id);
    await setCookie(req, DEVICE_COOKIE, device.token, DEVICE_MAX_AGE);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Remove a device (a lost tablet): it can no longer use PINs and anyone signed in on it is signed out */
export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return jsonError(403, 'Remove devices from the app itself.');
  try {
    const { error } = await manager();
    if (error) return error;
    const id = req.nextUrl.searchParams.get('id') ?? '';
    const current = await currentDevice();
    await removeDevice(id);
    if (current?.id === id) await clearCookie(DEVICE_COOKIE);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
