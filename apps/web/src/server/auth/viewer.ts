import 'server-only';

import { cookies } from 'next/headers';
import { findActiveAccessSessionByTokenHash } from '@incept/db/access';
import { hashAccessCredential } from './crypto';
import { DEV_GUEST_OVERRIDE_COOKIE_NAME, readDevAutoOwnerToken } from './dev-owner';
import { readAccessSessionToken } from './session-cookie';
import { traceNavigation } from '@/server/navigation-timing';

export type CurrentViewer =
  | { role: 'guest' }
  | {
      role: 'pro';
      sessionId: string;
      principalId: string;
    }
  | {
      role: 'owner';
      sessionId: string;
    };

async function resolveSessionToken(): Promise<string | null> {
  const cookieToken = await traceNavigation('session_cookie', readAccessSessionToken);
  if (cookieToken) {
    return cookieToken;
  }

  const devToken = readDevAutoOwnerToken();
  if (!devToken) {
    return null;
  }

  const guestOverride = (await cookies()).get(DEV_GUEST_OVERRIDE_COOKIE_NAME)?.value;
  if (guestOverride === '1') {
    return null;
  }

  return devToken;
}

// 获取当前访问者信息
export async function getCurrentViewer(): Promise<CurrentViewer> {
  const token = await resolveSessionToken();

  if (!token) {
    return { role: 'guest' };
  }

  // 查询数据库中是否存在与该 token 对应的有效访问会话
  const session = await traceNavigation('prisma_session', () =>
    findActiveAccessSessionByTokenHash(hashAccessCredential(token)));

  if (!session) {
    return { role: 'guest' };
  }

  if (session.role === 'owner') {
    return {
      role: 'owner',
      sessionId: session.id,
    };
  }

  if (session.principalId) {
    return {
      role: 'pro',
      sessionId: session.id,
      principalId: session.principalId,
    };
  }

  return { role: 'guest' };
}
