import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { limitAuthRequest, readSmallJson } from '@/server/auth/request-limits';
import { redeemSharedAccessGrant } from '@incept/db/access';
import {
  createAccessSessionToken,
  hashAccessCredential,
} from '@/server/auth/crypto';
import {
  getCurrentViewer,
  hasSameOrigin,
  writeProSessionCookie,
} from '@/server/auth';

export const runtime = 'nodejs';

type SharedCodeBody = {
  code?: unknown;
};

async function readSharedCodeBody(request: Request) {
  try {
    return await readSmallJson(request) as SharedCodeBody | null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  const limited = limitAuthRequest(request, 'redeem');
  if (limited) return limited;

  const viewer = await getCurrentViewer();

  if (viewer.role === 'owner') {
    return new NextResponse(null, { status: 204 });
  }

  const body = await readSharedCodeBody(request);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';

  if (!code || code.length > 512) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const token = createAccessSessionToken();
  const jar = await cookies();
  const device = jar.get('incept-pro-device')?.value ?? createAccessSessionToken();
  const redemption = await redeemSharedAccessGrant({
    credentialHash: hashAccessCredential(code),
    tokenHash: hashAccessCredential(token),
    deviceHash: hashAccessCredential(device),
  });

  if (!redemption) {
    return NextResponse.json({ error: 'Unable to redeem access code.' }, { status: 401 });
  }

  await writeProSessionCookie(token);
  jar.set('incept-pro-device', device, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 400 * 86400 });

  return new NextResponse(null, { status: 204 });
}
