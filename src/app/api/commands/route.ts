import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { commandSchema, operatorCommands } from '@/lib/commands';
import { touchSession } from '@/server/auth';
import { currentSession, errorResponse, jsonError, sameOrigin } from '@/server/http';
import { changesSince, execute } from '@/server/state';

const body = z.object({ command: commandSchema, since: z.number().int().min(0).optional() });

/** Applies one change for the signed-in person and answers with everything that changed since their version */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return jsonError(403, 'Save from the app itself.');
  try {
    const session = await currentSession();
    if (!session) return jsonError(401, 'Your session has ended. Sign in again; nothing was saved.', { signedOut: true });
    const { command, since } = body.parse(await req.json());
    if (session.user.access !== 'manager' && !operatorCommands.has(command.type)) return jsonError(403, 'Only managers can make this change.');
    await touchSession(session.tokenHash);
    const { result } = await execute(command, { userId: session.user.id, access: session.user.access, recordingAs: session.recordingAs?.id ?? null });
    return Response.json({ result, ...(await changesSince(since ?? 0)) });
  } catch (error) {
    return errorResponse(error);
  }
}
