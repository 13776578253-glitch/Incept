import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { DEV_GUEST_OVERRIDE_COOKIE_NAME, readDevAutoOwnerToken } from '@/server/auth/dev-owner';

export const runtime = 'nodejs';

function resolveSafeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return '/zh/settings?section=docs';
  }
  return raw;
}

export async function GET(request: Request): Promise<Response> {
  if (!readDevAutoOwnerToken()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const cookieStore = await cookies();
  cookieStore.set(DEV_GUEST_OVERRIDE_COOKIE_NAME, '', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 0,
  });

  const url = new URL(request.url);
  const nextPath = resolveSafeNextPath(url.searchParams.get('next'));
  return NextResponse.redirect(new URL(nextPath, url.origin), 307);
}
