import { NextResponse } from 'next/server';
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
    return (await request.json()) as SharedCodeBody;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const viewer = await getCurrentViewer();

  if (viewer.role !== 'guest') {
    return new NextResponse(null, { status: 204 });
  }

  const body = await readSharedCodeBody(request);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';

  if (!code || code.length > 512) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const token = createAccessSessionToken();
  const redemption = await redeemSharedAccessGrant({
    credentialHash: hashAccessCredential(code),
    tokenHash: hashAccessCredential(token),
  });

  if (!redemption) {
    return NextResponse.json({ error: 'Unable to redeem access code.' }, { status: 401 });
  }

  await writeProSessionCookie(token);

  return new NextResponse(null, { status: 204 });
}
