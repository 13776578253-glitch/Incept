import { NextResponse } from 'next/server';
import {
  findActiveAccessGrantByCredentialHash,
  redeemIndividualInvitation,
} from '@incept/db/access';
import {
  createAccessSessionToken,
  hashAccessCredential,
} from '@/server/auth/crypto';
import {
  getCurrentViewer,
  writeProSessionCookie,
} from '@/server/auth';

export const runtime = 'nodejs';

function notFoundResponse() {
  return new NextResponse(null, {
    status: 404,
    headers: {
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function redirectToDocs(request: Request, locale: string) {
  const response = NextResponse.redirect(new URL(`/${locale}/docs`, request.url), 303);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export async function GET(
  request: Request,
  context: {
    params: Promise<{ locale: string; credential: string }>;
  },
) {
  const { locale, credential } = await context.params;
  const credentialHash = hashAccessCredential(credential);
  const grant = await findActiveAccessGrantByCredentialHash(credentialHash);

  if (!grant || grant.type !== 'invitation') {
    return notFoundResponse();
  }

  const viewer = await getCurrentViewer();

  if (viewer.role !== 'guest') {
    return redirectToDocs(request, locale);
  }

  const token = createAccessSessionToken();
  const session = await redeemIndividualInvitation({
    credentialHash,
    tokenHash: hashAccessCredential(token),
  });

  if (!session) {
    return notFoundResponse();
  }

  await writeProSessionCookie(token);

  return redirectToDocs(request, locale);
}
