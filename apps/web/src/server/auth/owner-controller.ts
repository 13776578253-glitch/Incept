import 'server-only';

import { cookies } from 'next/headers';
import { isIP } from 'node:net';
import { prisma } from '@incept/db';
import {
  OwnerAuthError, consumeAuthLimit, startOwnerLogin, completeOwnerChallenge, issueLoginApproval,
  getOwnerManagementState, manageOwner, reauthenticateOwner, createTemporaryProGrant,
  revokeTemporaryProGrant, writeSecurityAudit,
} from '@incept/db/owner';
import { decryptTotp, hashCredential, networkFingerprint } from '@incept/db/owner/security';
import { getCurrentViewer } from './viewer';
import { hasSameOrigin } from './request-origin';
import { readSmallJson } from './request-limits';
import { clearAccessSessionCookie, writeOwnerSessionCookie } from './session-cookie';

const CHALLENGE_COOKIE = 'incept-owner-challenge';
const DEVICE_COOKIE = 'incept-owner-device';
const cookieOptions = { httpOnly: true, sameSite: 'strict' as const, secure: process.env.NODE_ENV === 'production', path: '/' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...(status === 429 ? { 'Retry-After': '600' } : {}) } });
const text = (body: Record<string, unknown>, key: string) => typeof body[key] === 'string' ? body[key] as string : '';

function requestNetwork(request: Request) {
  const address = process.env.INCEPT_TRUST_PROXY === '1' ? request.headers.get('x-forwarded-for') ?? '' : '';
  return networkFingerprint(isIP(address) ? address : 'direct');
}

async function clearChallenge() { (await cookies()).set(CHALLENGE_COOKIE, '', { ...cookieOptions, maxAge: 0 }); }
async function challengeCookie(token: string) { (await cookies()).set(CHALLENGE_COOKIE, token, { ...cookieOptions, maxAge: 600 }); }

async function readChallenge() {
  const token = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!token) return null;
  const challenge = await prisma.ownerChallenge.findUnique({ where: { tokenHash: hashCredential(token) }, include: { ownerAccount: true } });
  if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date() || challenge.failures >= 5
    || challenge.credentialVersion !== challenge.ownerAccount.credentialVersion) return null;
  return { stage: challenge.stage, challengeId: challenge.id, expiresAt: challenge.expiresAt.toISOString(),
    ...(challenge.stage === 'enroll' && challenge.pendingTotpCiphertext
      ? { secret: decryptTotp(challenge.pendingTotpCiphertext), username: challenge.ownerAccount.username } : {}) };
}

// Responses explicitly project the public state; token hashes and encrypted secrets never leave this boundary.
export async function ownerGetState() {
  try {
    const viewer = await getCurrentViewer();
    const account = await prisma.ownerAccount.findUnique({ where: { id: 'owner' }, select: { id: true } });
    return json({ role: viewer.role, configured: !!account, challenge: await readChallenge(),
      ...(viewer.role === 'owner' ? { management: await getOwnerManagementState(viewer.sessionId) } : {}) });
  } catch { return json({ error: 'service_unavailable' }, 503); }
}

export async function ownerPostAction(request: Request, action: string) {
  if (!hasSameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const supported = ['login', 'verify', 'cancel', 'reauthenticate', 'password', 'recovery-codes', 'totp', 'sessions-all', 'session', 'device', 'approval', 'permit', 'grant', 'revoke-grant'];
  if (!supported.includes(action)) return json({ error: 'not_found' }, 404);
  try {
    const body = await readSmallJson(request);
    if (!body) return json({ error: 'invalid_request' }, 400);
    const jar = await cookies();
    const networkHash = requestNetwork(request);
    await consumeAuthLimit(`owner:${action}:${networkHash}`, action === 'login' ? 10 : 30);
    if (action === 'login') {
      const username = text(body, 'username'), password = text(body, 'password');
      if (!username || username.length > 64 || !password || Buffer.byteLength(password) > 1024) return json({ error: 'invalid_credentials' }, 401);
      await consumeAuthLimit('owner:password:account', 30);
      const result = await startOwnerLogin({ username, password, deviceToken: jar.get(DEVICE_COOKIE)?.value,
        deviceLabel: request.headers.get('user-agent')?.replace(/[\r\n]/g, ' ').slice(0, 120) ?? 'Browser', networkHash });
      await challengeCookie(result.challengeToken);
      return json({ stage: result.stage, challengeId: result.challengeId, expiresAt: result.expiresAt });
    }
    if (action === 'cancel') {
      const token = jar.get(CHALLENGE_COOKIE)?.value;
      if (token) await prisma.ownerChallenge.updateMany({ where: { tokenHash: hashCredential(token), consumedAt: null }, data: { consumedAt: new Date(), pendingTotpCiphertext: null } });
      await clearChallenge();
      return json({ cancelled: true });
    }
    if (action === 'verify') {
      const token = jar.get(CHALLENGE_COOKIE)?.value, code = text(body, 'code').trim();
      if (!token || !code || code.length > 256) return json({ error: 'invalid_code' }, 401);
      const result = await completeOwnerChallenge({ challengeToken: token, code, recovery: body.recovery === true, trustDevice: body.trustDevice === true });
      if ('error' in result) return json({ error: result.error }, 401);
      if (result.stage === 'complete' && 'sessionToken' in result) {
        await writeOwnerSessionCookie(result.sessionToken!);
        if (result.deviceToken) jar.set(DEVICE_COOKIE, result.deviceToken, { ...cookieOptions, maxAge: 30 * 86400 });
        await clearChallenge();
        return json({ stage: 'complete', recoveryCodes: result.recoveryCodes });
      }
      return json(result);
    }
    const viewer = await getCurrentViewer();
    if (viewer.role !== 'owner') return json({ error: 'forbidden' }, 403);
    if (action === 'reauthenticate') {
      return await reauthenticateOwner(viewer.sessionId, text(body, 'password'), text(body, 'code').trim())
        ? json({ authenticated: true }) : json({ error: 'invalid_credentials' }, 401);
    }
    if (action === 'approval') return json(await issueLoginApproval(text(body, 'challengeId'), viewer.sessionId));
    if (action === 'grant') {
      const kind = text(body, 'kind'), label = text(body, 'label');
      if (kind === 'single') return json(await createTemporaryProGrant(viewer.sessionId, {
        kind, label, lifetimeDays: body.lifetimeDays === null ? null : typeof body.lifetimeDays === 'number' ? body.lifetimeDays : NaN,
      }));
      if (kind === 'shared') return json(await createTemporaryProGrant(viewer.sessionId, {
        kind, label, lifetimeHours: typeof body.lifetimeHours === 'number' ? body.lifetimeHours : NaN,
        limit: typeof body.limit === 'number' ? body.limit : NaN,
      }));
      return json({ error: 'invalid_request' }, 400);
    }
    if (action === 'revoke-grant') {
      await revokeTemporaryProGrant(viewer.sessionId, text(body, 'grantId'));
      return json({ revoked: true });
    }
    const value = action === 'password' ? text(body, 'password') : text(body, 'id');
    if (action === 'password' && (Array.from(value).length < 12 || Buffer.byteLength(value) > 1024)) return json({ error: 'password_policy' }, 400);
    const result = await manageOwner(viewer.sessionId, action, value);
    if ('challengeToken' in result && result.challengeToken) {
      await challengeCookie(result.challengeToken);
      return json({ stage: 'enroll', secret: result.secret, username: result.username, expiresAt: result.expiresAt });
    }
    if ('signedOut' in result && result.signedOut) {
      await clearAccessSessionCookie(); await clearChallenge();
      jar.set(DEVICE_COOKIE, '', { ...cookieOptions, maxAge: 0 });
    }
    return json(result);
  } catch (error) {
    if (error instanceof OwnerAuthError) return json({ error: error.code }, error.status);
    await writeSecurityAudit(`owner.${action}`, 'service_failure').catch(() => {});
    return json({ error: 'service_unavailable' }, 503);
  }
}
