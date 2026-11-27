import { NextResponse } from 'next/server';
import { revokeAccessSession } from '@incept/db/access';
import { prisma } from '@incept/db';
import { writeSecurityAudit } from '@incept/db/owner';
import { cookies } from 'next/headers';
import {
  clearAccessSessionCookie,
  getCurrentViewer,
  hasSameOrigin,
  readAccessSessionToken,
} from '@/server/auth';
import { DEV_GUEST_OVERRIDE_COOKIE_NAME, readDevAutoOwnerToken } from '@/server/auth/dev-owner';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const devAutoOwnerToken = readDevAutoOwnerToken();
  const cookieToken = await readAccessSessionToken();
  const usingInjectedDevSession = Boolean(devAutoOwnerToken) && !cookieToken;
  const viewer = await getCurrentViewer();

  if (viewer.role !== 'guest' && !usingInjectedDevSession) {
    await revokeAccessSession(viewer.sessionId);
    if (viewer.role === 'owner') {
      await prisma.ownerChallenge.updateMany({ where: { reauthSessionId: viewer.sessionId, consumedAt: null }, data: { consumedAt: new Date() } });
      await writeSecurityAudit('owner.logout', 'success', viewer.sessionId, viewer.sessionId);
    }
  }

  await clearAccessSessionCookie();
  const cookieStore = await cookies();
  cookieStore.set('incept-owner-challenge', '', { path: '/', httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 0 });
  if (devAutoOwnerToken) {
    cookieStore.set(DEV_GUEST_OVERRIDE_COOKIE_NAME, '1', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 60 * 60 * 24,
    });
  }

  return new NextResponse(null, { status: 204 });
}
