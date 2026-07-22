import 'server-only';

import { cookies } from 'next/headers';
import { OWNER_SESSION_TTL_MS } from '@incept/db/access';

export const ACCESS_SESSION_COOKIE_NAME = 'incept-access-session';

const ownerSessionCookieMaxAge = Math.floor(OWNER_SESSION_TTL_MS / 1000); // 将毫秒转换为秒 / 过期时间（秒）
const proSessionCookieMaxAge = 400 * 24 * 60 * 60; // 400天，约为一年零一个月的时间 / 测试

const sessionCookieOptions = {
  httpOnly: true,  // 仅服务器访问，防止客户端脚本访问 / xss防护
  path: '/',
  sameSite: 'lax' as const,  // 限制跨站请求携带cookie的策略 / 防止CSRF攻击
  secure: process.env.NODE_ENV === 'production',  // 仅在生产环境下启用安全传输 / 仅在HTTPS下传输cookie
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

export async function writeProSessionCookie(token: string) {
  (await cookies()).set({
    name: ACCESS_SESSION_COOKIE_NAME,
    value: token,
    maxAge: proSessionCookieMaxAge,
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
