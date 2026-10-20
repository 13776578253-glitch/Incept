import { NextResponse } from 'next/server';
import { revokeAccessSession } from '@incept/db/access';
import { prisma } from '@incept/db';
import { writeSecurityAudit } from '@incept/db/owner';
import { cookies } from 'next/headers';
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
    if (viewer.role === 'owner') {
      await prisma.ownerChallenge.updateMany({ where: { reauthSessionId: viewer.sessionId, consumedAt: null }, data: { consumedAt: new Date() } });
      await writeSecurityAudit('owner.logout', 'success', viewer.sessionId, viewer.sessionId);
    }
  }

  await clearAccessSessionCookie();
  (await cookies()).set('incept-owner-challenge', '', { path: '/', httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 0 });

  return new NextResponse(null, { status: 204 });
}
