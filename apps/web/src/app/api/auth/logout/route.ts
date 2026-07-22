import { NextResponse } from 'next/server';
import { revokeAccessSession } from '@incept/db/access';
import {
  clearAccessSessionCookie,
  getCurrentViewer,
  hasSameOrigin,
} from '@/server/auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const viewer = await getCurrentViewer();

  if (viewer.role !== 'guest') {
    await revokeAccessSession(viewer.sessionId);
  }

  await clearAccessSessionCookie();

  return new NextResponse(null, { status: 204 });
}
