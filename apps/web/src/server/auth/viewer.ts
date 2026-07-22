import 'server-only';

import { findActiveAccessSessionByTokenHash } from '@incept/db/access';
import { hashAccessCredential } from './crypto';
import { readAccessSessionToken } from './session-cookie';

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

export async function getCurrentViewer(): Promise<CurrentViewer> {
  const token = await readAccessSessionToken();

  if (!token) {
    return { role: 'guest' };
  }

  const session = await findActiveAccessSessionByTokenHash(
    hashAccessCredential(token),
  );

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
