import 'server-only';

import { cookies } from 'next/headers';
import { OWNER_SESSION_TTL_MS } from '@incept/db/access';

export const ACCESS_SESSION_COOKIE_NAME = 'incept-access-session';

const ownerSessionCookieMaxAge = Math.floor(OWNER_SESSION_TTL_MS / 1000);

const sessionCookieOptions = {
  httpOnly: true,
  path: '/',
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
};

export async function readAccessSessionToken() {
  return (await cookies()).get(ACCESS_SESSION_COOKIE_NAME)?.value ?? null;
}

export async function writeOwnerSessionCookie(token: string) {
  (await cookies()).set({
    name: ACCESS_SESSION_COOKIE_NAME,
    value: token,
    maxAge: ownerSessionCookieMaxAge,
    ...sessionCookieOptions,
  });
}

export async function clearAccessSessionCookie() {
  (await cookies()).set({
    name: ACCESS_SESSION_COOKIE_NAME,
    value: '',
    maxAge: 0,
    ...sessionCookieOptions,
  });
}
