import { NextResponse } from 'next/server';
import { createOwnerAccessSession } from '@incept/db/access';

import { createAccessSessionToken, hashAccessCredential } from '@/server/auth/crypto';
import { limitAuthRequest, readSmallJson } from '@/server/auth/request-limits';
import {
  hasSameOrigin,
  isOwnerAccessConfigured,
  verifyOwnerAccessSecret,
  writeOwnerSessionCookie,
} from '@/server/auth';

export const runtime = 'nodejs';

type OwnerLoginBody = {
  secret?: unknown;
};

async function readOwnerLoginBody(request: Request) {
  try {
    return await readSmallJson(request) as OwnerLoginBody | null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  const limited = limitAuthRequest(request, 'owner');
  if (limited) return limited;

  if (!isOwnerAccessConfigured()) {
    return NextResponse.json(
      { error: 'Owner authentication is not configured.' },
      { status: 503 },
    );
  }

  const body = await readOwnerLoginBody(request);
  const secret = body?.secret;

  if (typeof secret !== 'string' || !secret) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (!verifyOwnerAccessSecret(secret)) {
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  const token = createAccessSessionToken();
  await createOwnerAccessSession({
    tokenHash: hashAccessCredential(token),
  });
  await writeOwnerSessionCookie(token);

  return new NextResponse(null, { status: 204 });
}
