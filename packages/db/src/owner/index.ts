import { prisma } from '../client';
import type { Prisma } from '../../generated/client/index.js';
import {
  APPROVAL_TTL_MS, CHALLENGE_TTL_MS, DEVICE_TTL_MS, OWNER_TTL_MS, RECENT_AUTH_MS,
  authEncryptionKey, createTotpSecret, decryptTotp, encryptTotp, hashCredential, hashPassword,
  randomCredential, verifyPassword, verifyTotp,
} from './security';

type Tx = Prisma.TransactionClient;
export class OwnerAuthError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
const future = (now: Date, ttl: number) => new Date(now.getTime() + ttl);
const expired = (date: Date | null, now: Date) => !!date && date <= now;
const activeSession = (s: { expiresAt: Date | null; revokedAt: Date | null }, now: Date) =>
  !s.revokedAt && !!s.expiresAt && !expired(s.expiresAt, now);

async function lockAccount(tx: Tx) {
  await tx.$queryRaw`SELECT id FROM owner_accounts WHERE id = 'owner' FOR UPDATE`;
  return tx.ownerAccount.findUnique({ where: { id: 'owner' } });
}

export function writeSecurityAudit(action: string, result: string, targetId?: string, sessionId?: string, tx: Tx = prisma) {
  return tx.securityAudit.create({ data: { action, result, targetId, sessionId, actorId: sessionId ? 'owner' : 'system' } });
}

export function finishSecurityAudit(id: string, result: string) {
  return prisma.securityAudit.update({ where: { id }, data: { result } });
}

async function requireSession(tx: Tx, sessionId: string, recent: boolean, now: Date) {
  const session = await tx.accessSession.findUnique({ where: { id: sessionId }, include: { ownerAccount: true } });
  if (!session || session.role !== 'owner' || !session.ownerAccount?.totpCiphertext || !activeSession(session, now)
    || session.credentialVersion !== session.ownerAccount.credentialVersion) throw new OwnerAuthError(403, 'session_expired');
  if (recent && (!session.authenticatedAt || session.authenticatedAt.getTime() <= now.getTime() - RECENT_AUTH_MS)) {
    throw new OwnerAuthError(428, 'reauthentication_required');
  }
  return session;
}

export async function requireRecentOwnerSession(sessionId: string, now = new Date()) {
  return prisma.$transaction(async tx => {
    await lockAccount(tx);
    await requireSession(tx, sessionId, true, now);
  });
}

async function revokeCredentials(tx: Tx, now: Date) {
  await tx.accessSession.updateMany({ where: { role: 'owner', revokedAt: null }, data: { revokedAt: now } });
  await tx.ownerDevice.updateMany({ where: { revokedAt: null }, data: { revokedAt: now } });
  await tx.ownerChallenge.updateMany({ where: { consumedAt: null }, data: { consumedAt: now } });
  await tx.ownerPermit.updateMany({ where: { revokedAt: null }, data: { revokedAt: now } });
}

async function newRecoveryCodes(tx: Tx, ownerAccountId: string) {
  const codes = Array.from({ length: 8 }, () => randomCredential('REC-'));
  await tx.ownerRecoveryCode.deleteMany({ where: { ownerAccountId } });
  await tx.ownerRecoveryCode.createMany({ data: codes.map(code => ({ ownerAccountId, codeHash: hashCredential(code) })) });
  return codes;
}

// A database bucket survives process restarts and increments atomically across workers.
export async function consumeAuthLimit(key: string, maximum = 10, now = new Date()) {
  await prisma.authRateBucket.deleteMany({ where: { expiresAt: { lte: now } } });
  const bucketKey = hashCredential(key);
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO auth_rate_buckets (key, count, "expiresAt") VALUES (${bucketKey}, 1, ${future(now, 600000)})
    ON CONFLICT (key) DO UPDATE SET count = CASE WHEN auth_rate_buckets."expiresAt" <= ${now} THEN 1 ELSE auth_rate_buckets.count + 1 END,
    "expiresAt" = CASE WHEN auth_rate_buckets."expiresAt" <= ${now} THEN ${future(now, 600000)} ELSE auth_rate_buckets."expiresAt" END RETURNING count`;
  if (rows[0].count > maximum) throw new OwnerAuthError(429, 'rate_limited');
}

export async function initializeOwner(username: string, password: string, reset = false, now = new Date()) {
  authEncryptionKey();
  if (!/^[a-zA-Z0-9_.-]{3,64}$/.test(username)) throw new OwnerAuthError(400, 'invalid_username');
  const passwordHash = await hashPassword(password);
  return prisma.$transaction(async tx => {
    // The transaction advisory lock also serializes initialization before the singleton row exists.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(713014)`;
    const existing = await lockAccount(tx);
    if (existing && !reset) throw new OwnerAuthError(409, 'owner_already_initialized');
    if (!existing && reset) throw new OwnerAuthError(404, 'owner_not_initialized');
    await revokeCredentials(tx, now);
    const account = existing
      ? await tx.ownerAccount.update({ where: { id: 'owner' }, data: { username, passwordHash, totpCiphertext: null, totpLastStep: -1, credentialVersion: { increment: 1 } } })
      : await tx.ownerAccount.create({ data: { id: 'owner', username, passwordHash } });
    await tx.ownerRecoveryCode.deleteMany({ where: { ownerAccountId: account.id } });
    const code = randomCredential('SETUP-');
    const expiresAt = future(now, 20 * 60000);
    await tx.ownerPermit.create({ data: { ownerAccountId: account.id, credentialVersion: account.credentialVersion, purpose: 'setup', codeHash: hashCredential(code), codeHint: code.slice(-6), expiresAt } });
    await writeSecurityAudit(reset ? 'owner.recover' : 'owner.initialize', 'success', account.id, undefined, tx);
    return { username: account.username, setupCode: code, expiresAt: expiresAt.toISOString() };
  });
}

export async function refreshSetupPermit(now = new Date()) {
  return prisma.$transaction(async tx => {
    const account = await lockAccount(tx);
    if (!account || account.totpCiphertext) throw new OwnerAuthError(409, 'setup_not_required');
    await tx.ownerChallenge.updateMany({ where: { consumedAt: null }, data: { consumedAt: now, pendingTotpCiphertext: null } });
    await tx.ownerPermit.updateMany({ where: { purpose: 'setup', revokedAt: null }, data: { revokedAt: now } });
    const code = randomCredential('SETUP-'), expiresAt = future(now, 20 * 60000);
    await tx.ownerPermit.create({ data: { ownerAccountId: account.id, credentialVersion: account.credentialVersion, purpose: 'setup', codeHash: hashCredential(code), codeHint: code.slice(-6), expiresAt } });
    await writeSecurityAudit('owner.setup-permit', 'success', account.id, undefined, tx);
    return { setupCode: code, expiresAt: expiresAt.toISOString() };
  });
}

export async function startOwnerLogin({ username, password, deviceToken, deviceLabel, networkHash, now = new Date() }: {
  username: string; password: string; deviceToken?: string; deviceLabel: string; networkHash: string; now?: Date;
}) {
  authEncryptionKey();
  const account = await prisma.ownerAccount.findUnique({ where: { id: 'owner' } });
  if (!account) throw new OwnerAuthError(503, 'owner_not_initialized');
  const validPassword = await verifyPassword(password, account.passwordHash);
  if (!validPassword || username !== account.username) {
    await writeSecurityAudit('owner.login', 'invalid_credentials');
    throw new OwnerAuthError(401, 'invalid_credentials');
  }
  return prisma.$transaction(async tx => {
    const current = await lockAccount(tx);
    if (!current || current.credentialVersion !== account.credentialVersion) throw new OwnerAuthError(401, 'invalid_credentials');
    const device = deviceToken ? await tx.ownerDevice.findUnique({ where: { tokenHash: hashCredential(deviceToken) } }) : null;
    const trusted = !!device && !device.revokedAt && !expired(device.expiresAt, now)
      && device.credentialVersion === current.credentialVersion && device.networkHash === networkHash;
    const challengeToken = randomCredential();
    const challenge = await tx.ownerChallenge.create({ data: { tokenHash: hashCredential(challengeToken), ownerAccountId: current.id,
      credentialVersion: current.credentialVersion, stage: current.totpCiphertext ? 'totp' : 'setup', needsApproval: !trusted,
      deviceId: trusted ? device.id : null, deviceLabel: deviceLabel.slice(0, 120), networkHash, expiresAt: future(now, CHALLENGE_TTL_MS) } });
    await writeSecurityAudit('owner.password', 'success', challenge.id, undefined, tx);
    return { challengeToken, stage: challenge.stage, challengeId: challenge.id, expiresAt: challenge.expiresAt.toISOString() };
  });
}

export async function issueLoginApproval(challengeId: string, sessionId?: string, now = new Date()) {
  return prisma.$transaction(async tx => {
    const account = await lockAccount(tx);
    if (sessionId) await requireSession(tx, sessionId, true, now);
    const challenge = await tx.ownerChallenge.findUnique({ where: { id: challengeId } });
    if (!account || !challenge || challenge.consumedAt || expired(challenge.expiresAt, now) || challenge.stage !== 'approval'
      || challenge.credentialVersion !== account.credentialVersion) throw new OwnerAuthError(409, 'challenge_expired');
    await tx.ownerPermit.updateMany({ where: { challengeId, revokedAt: null }, data: { revokedAt: now } });
    const code = randomCredential('OWNER-');
    const expiresAt = new Date(Math.min(challenge.expiresAt.getTime(), now.getTime() + APPROVAL_TTL_MS));
    await tx.ownerPermit.create({ data: { ownerAccountId: account.id, credentialVersion: account.credentialVersion, purpose: 'approval',
      codeHash: hashCredential(code), codeHint: code.slice(-6), challengeId, expiresAt } });
    await writeSecurityAudit('owner.approval.issue', 'success', challengeId, sessionId, tx);
    return { code, challengeId, expiresAt: expiresAt.toISOString() };
  });
}

export async function completeOwnerChallenge({ challengeToken, code, recovery = false, trustDevice = false, now = new Date() }: {
  challengeToken: string; code: string; recovery?: boolean; trustDevice?: boolean; now?: Date;
}) {
  return prisma.$transaction(async tx => {
    let account = await lockAccount(tx);
    const challenge = await tx.ownerChallenge.findUnique({ where: { tokenHash: hashCredential(challengeToken) } });
    if (!account || !challenge || challenge.consumedAt || expired(challenge.expiresAt, now) || challenge.failures >= 5
      || challenge.credentialVersion !== account.credentialVersion) throw new OwnerAuthError(401, 'challenge_expired');
    if (challenge.reauthSessionId) await requireSession(tx, challenge.reauthSessionId, true, now);
    const fail = async () => {
      await tx.ownerChallenge.update({ where: { id: challenge.id }, data: { failures: { increment: 1 } } });
      await writeSecurityAudit('owner.verify', 'invalid_code', challenge.id, undefined, tx);
      return { error: 'invalid_code' as const, stage: undefined };
    };
    if (challenge.stage === 'setup') {
      const permit = await tx.ownerPermit.findUnique({ where: { codeHash: hashCredential(code) } });
      if (!permit || permit.purpose !== 'setup' || permit.consumedAt || permit.revokedAt || expired(permit.expiresAt, now)
        || permit.credentialVersion !== account.credentialVersion) return fail();
      await tx.ownerPermit.update({ where: { id: permit.id }, data: { consumedAt: now, challengeId: challenge.id } });
      const secret = createTotpSecret(), expiresAt = future(now, CHALLENGE_TTL_MS);
      await tx.ownerChallenge.update({ where: { id: challenge.id }, data: { stage: 'enroll', needsApproval: false,
        pendingTotpCiphertext: encryptTotp(secret), expiresAt, failures: 0 } });
      return { stage: 'enroll', secret, username: account.username, expiresAt: expiresAt.toISOString() };
    }
    let recoveryCodes: string[] | undefined;
    if (challenge.stage === 'enroll') {
      if (!challenge.pendingTotpCiphertext) return fail();
      const step = verifyTotp(decryptTotp(challenge.pendingTotpCiphertext), code, -1, now);
      if (step === null) return fail();
      if (challenge.reauthSessionId) await revokeCredentials(tx, now);
      account = await tx.ownerAccount.update({ where: { id: account.id }, data: { totpCiphertext: challenge.pendingTotpCiphertext,
        totpLastStep: step, ...(challenge.reauthSessionId ? { credentialVersion: { increment: 1 } } : {}) } });
      recoveryCodes = await newRecoveryCodes(tx, account.id);
    } else if (challenge.stage === 'totp') {
      if (!account.totpCiphertext) return fail();
      if (recovery) {
        const item = await tx.ownerRecoveryCode.findUnique({ where: { codeHash: hashCredential(code) } });
        if (!item || item.consumedAt || item.ownerAccountId !== account.id) return fail();
        await tx.ownerRecoveryCode.update({ where: { id: item.id }, data: { consumedAt: now } });
        await revokeCredentials(tx, now);
        account = await tx.ownerAccount.update({ where: { id: account.id }, data: { credentialVersion: { increment: 1 } } });
        await tx.ownerChallenge.update({ where: { id: challenge.id }, data: { consumedAt: null, credentialVersion: account.credentialVersion, needsApproval: true } });
        await writeSecurityAudit('owner.recovery-code', 'success', item.id, undefined, tx);
      } else {
        const step = verifyTotp(decryptTotp(account.totpCiphertext), code, account.totpLastStep, now);
        if (step === null) return fail();
        await tx.ownerAccount.update({ where: { id: account.id }, data: { totpLastStep: step } });
      }
      if (challenge.needsApproval || recovery) {
        const expiresAt = future(now, APPROVAL_TTL_MS);
        await tx.ownerChallenge.update({ where: { id: challenge.id }, data: { stage: 'approval', expiresAt, failures: 0 } });
        return { stage: 'approval', challengeId: challenge.id, expiresAt: expiresAt.toISOString() };
      }
    } else if (challenge.stage === 'approval') {
      const permit = await tx.ownerPermit.findUnique({ where: { codeHash: hashCredential(code) } });
      if (!permit || permit.purpose !== 'approval' || permit.challengeId !== challenge.id || permit.consumedAt || permit.revokedAt
        || expired(permit.expiresAt, now) || permit.credentialVersion !== account.credentialVersion) return fail();
      await tx.ownerPermit.update({ where: { id: permit.id }, data: { consumedAt: now } });
    } else return fail();

    let deviceId = challenge.deviceId, deviceToken: string | undefined;
    if (trustDevice) {
      deviceToken = randomCredential();
      const device = await tx.ownerDevice.create({ data: { ownerAccountId: account.id, credentialVersion: account.credentialVersion,
        tokenHash: hashCredential(deviceToken), label: challenge.deviceLabel, networkHash: challenge.networkHash, expiresAt: future(now, DEVICE_TTL_MS) } });
      deviceId = device.id;
    }
    const sessionToken = randomCredential();
    const session = await tx.accessSession.create({ data: { role: 'owner', tokenHash: hashCredential(sessionToken), ownerAccountId: account.id,
      credentialVersion: account.credentialVersion, authenticatedAt: now, lastUsedAt: now, createdAt: now, expiresAt: future(now, OWNER_TTL_MS), deviceId, deviceLabel: challenge.deviceLabel } });
    await tx.ownerChallenge.update({ where: { id: challenge.id }, data: { consumedAt: now, pendingTotpCiphertext: null } });
    await writeSecurityAudit(challenge.reauthSessionId ? 'owner.totp.rebind' : 'owner.login', 'success', account.id, session.id, tx);
    return { stage: 'complete', sessionToken, deviceToken, recoveryCodes };
  });
}

export async function reauthenticateOwner(sessionId: string, password: string, code: string, now = new Date()) {
  const snapshot = await prisma.ownerAccount.findUnique({ where: { id: 'owner' } });
  const passwordValid = !!snapshot && await verifyPassword(password, snapshot.passwordHash);
  return prisma.$transaction(async tx => {
    const account = await lockAccount(tx);
    await requireSession(tx, sessionId, false, now);
    const step = account?.totpCiphertext ? verifyTotp(decryptTotp(account.totpCiphertext), code, account.totpLastStep, now) : null;
    if (!passwordValid || !account || account.credentialVersion !== snapshot?.credentialVersion || step === null) {
      await writeSecurityAudit('owner.reauthenticate', 'invalid_credentials', undefined, sessionId, tx);
      return false;
    }
    await tx.ownerAccount.update({ where: { id: account.id }, data: { totpLastStep: step } });
    await tx.accessSession.update({ where: { id: sessionId }, data: { authenticatedAt: now } });
    await writeSecurityAudit('owner.reauthenticate', 'success', undefined, sessionId, tx);
    return true;
  });
}

export async function manageOwner(sessionId: string, action: string, value: string | undefined, now = new Date()) {
  const passwordHash = action === 'password' && value ? await hashPassword(value) : undefined;
  return prisma.$transaction(async tx => {
    const account = await lockAccount(tx);
    const session = await requireSession(tx, sessionId, true, now);
    if (!account) throw new OwnerAuthError(403, 'session_expired');
    if (action === 'password' && passwordHash) {
      await tx.ownerAccount.update({ where: { id: account.id }, data: { passwordHash, credentialVersion: { increment: 1 } } });
      await revokeCredentials(tx, now);
    } else if (action === 'recovery-codes') {
      const recoveryCodes = await newRecoveryCodes(tx, account.id);
      await writeSecurityAudit('owner.recovery-codes.rotate', 'success', account.id, sessionId, tx);
      return { recoveryCodes };
    } else if (action === 'totp') {
      const secret = createTotpSecret(), challengeToken = randomCredential(), expiresAt = future(now, CHALLENGE_TTL_MS);
      await tx.ownerChallenge.create({ data: { tokenHash: hashCredential(challengeToken), ownerAccountId: account.id,
        credentialVersion: account.credentialVersion, stage: 'enroll', needsApproval: false, pendingTotpCiphertext: encryptTotp(secret),
        reauthSessionId: session.id, deviceLabel: session.deviceLabel ?? 'Browser', networkHash: '', expiresAt } });
      await writeSecurityAudit('owner.totp.rebind.begin', 'success', account.id, sessionId, tx);
      return { secret, username: account.username, challengeToken, expiresAt: expiresAt.toISOString() };
    } else if (action === 'sessions-all') {
      await revokeCredentials(tx, now);
    } else if (action === 'session' && value) {
      const target = await tx.accessSession.findUnique({ where: { id: value } });
      if (!target || target.ownerAccountId !== account.id) throw new OwnerAuthError(404, 'not_found');
      await tx.accessSession.update({ where: { id: value }, data: { revokedAt: now } });
      await tx.ownerChallenge.updateMany({ where: { reauthSessionId: value, consumedAt: null }, data: { consumedAt: now } });
    } else if (action === 'device' && value) {
      const target = await tx.ownerDevice.findUnique({ where: { id: value } });
      if (!target || target.ownerAccountId !== account.id) throw new OwnerAuthError(404, 'not_found');
      await tx.ownerDevice.update({ where: { id: value }, data: { revokedAt: now } });
      await tx.accessSession.updateMany({ where: { deviceId: value, revokedAt: null }, data: { revokedAt: now } });
      await tx.ownerChallenge.updateMany({ where: { deviceId: value, consumedAt: null }, data: { consumedAt: now } });
    } else if (action === 'permit' && value) {
      await tx.ownerPermit.updateMany({ where: { id: value, ownerAccountId: account.id }, data: { revokedAt: now } });
    } else throw new OwnerAuthError(400, 'invalid_request');
    await writeSecurityAudit(`owner.${action}`, 'success', action === 'password' ? account.id : value, sessionId, tx);
    return { signedOut: action === 'password' || action === 'sessions-all' || (action === 'session' && value === sessionId) || (action === 'device' && value === session.deviceId) };
  });
}

export async function getOwnerManagementState(sessionId: string, now = new Date()) {
  const session = await requireSession(prisma, sessionId, false, now);
  const [sessions, devices, challenges, permits, grants, audits] = await Promise.all([
    prisma.accessSession.findMany({ where: { ownerAccountId: 'owner', revokedAt: null, expiresAt: { gt: now }, credentialVersion: session.credentialVersion },
      select: { id: true, deviceLabel: true, createdAt: true, lastUsedAt: true, expiresAt: true }, orderBy: { createdAt: 'desc' } }),
    prisma.ownerDevice.findMany({ where: { revokedAt: null, expiresAt: { gt: now } }, select: { id: true, label: true, expiresAt: true }, orderBy: { createdAt: 'desc' } }),
    prisma.ownerChallenge.findMany({ where: { stage: 'approval', consumedAt: null, expiresAt: { gt: now }, credentialVersion: session.credentialVersion ?? -1 },
      select: { id: true, deviceLabel: true, expiresAt: true }, orderBy: { createdAt: 'desc' } }),
    prisma.ownerPermit.findMany({ where: { purpose: 'approval', consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
      select: { id: true, challengeId: true, codeHint: true, expiresAt: true } }),
    prisma.accessGrant.findMany({ where: { type: 'sharedCode' }, select: { id: true, label: true, mode: true, codeHint: true,
      redeemExpiresAt: true, expiresAt: true, entitlementSeconds: true, maxRedemptions: true, redeemedCount: true, revokedAt: true }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.securityAudit.findMany({ orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, action: true, result: true, targetId: true, createdAt: true } }),
  ]);
  return { username: session.ownerAccount!.username, sessionId, recentAuthUntil: future(session.authenticatedAt ?? session.createdAt, RECENT_AUTH_MS),
    sessions, devices, challenges, permits, grants, audits };
}

export type ProGrantInput = { kind: 'single'; label: string; lifetimeDays: number | null }
  | { kind: 'shared'; label: string; lifetimeHours: number; limit: number };

export async function createTemporaryProGrant(sessionId: string, input: ProGrantInput, now = new Date()) {
  const { kind, label } = input;
  if (!['single', 'shared'].includes(kind) || label.length > 60 || (input.kind === 'single'
    ? input.lifetimeDays !== null && ![1, 7, 30].includes(input.lifetimeDays)
    : ![1, 6, 24].includes(input.lifetimeHours) || ![2, 5, 10, 20].includes(input.limit))) throw new OwnerAuthError(400, 'invalid_request');
  return prisma.$transaction(async tx => {
    await lockAccount(tx); await requireSession(tx, sessionId, true, now);
    const code = randomCredential('PRO-');
    const redeemExpiresAt = input.kind === 'single'
      ? input.lifetimeDays === null ? null : future(now, input.lifetimeDays * 86400000)
      : future(now, input.lifetimeHours * 3600000);
    const grant = await tx.accessGrant.create({ data: { type: 'sharedCode', mode: kind, label: label.trim() || 'Temporary reading',
      credentialHash: hashCredential(code), codeHint: code.slice(-6), redeemExpiresAt,
      expiresAt: redeemExpiresAt, entitlementSeconds: null,
      maxRedemptions: input.kind === 'single' ? 1 : input.limit } });
    await writeSecurityAudit('pro.grant.create', 'success', grant.id, sessionId, tx);
    return { code, grantId: grant.id };
  });
}

export async function revokeTemporaryProGrant(sessionId: string, grantId: string, now = new Date()) {
  return prisma.$transaction(async tx => {
    await lockAccount(tx); await requireSession(tx, sessionId, true, now);
    await tx.$queryRaw`SELECT id FROM access_grants WHERE id = ${grantId} FOR UPDATE`;
    const grant = await tx.accessGrant.findUnique({ where: { id: grantId } });
    if (!grant) throw new OwnerAuthError(404, 'not_found');
    await tx.accessGrant.update({ where: { id: grantId }, data: { revokedAt: now } });
    await tx.accessSession.updateMany({ where: { grantId, revokedAt: null }, data: { revokedAt: now } });
    await writeSecurityAudit('pro.grant.revoke', 'success', grantId, sessionId, tx);
  });
}

export async function redeemTemporaryProGrant(credentialHash: string, tokenHash: string, deviceHash: string, now = new Date()) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM access_grants WHERE "credentialHash" = ${credentialHash} FOR UPDATE`;
    const grant = await tx.accessGrant.findUnique({ where: { credentialHash } });
    if (!grant?.mode || grant.type !== 'sharedCode' || grant.principalId || grant.revokedAt || expired(grant.redeemExpiresAt, now) || expired(grant.expiresAt, now)) return null;
    const previous = await tx.proRedemption.findUnique({ where: { grantId_deviceHash: { grantId: grant.id, deviceHash } }, include: { principal: true } });
    if (grant.mode === 'single' && grant.redeemedCount >= 1) return null;
    if (!previous && grant.maxRedemptions !== null && grant.redeemedCount >= grant.maxRedemptions) return null;
    if (previous?.principal.revokedAt || (previous && expired(previous.principal.expiresAt, now))) return null;
    const expiresAt = grant.mode === 'single' && grant.entitlementSeconds !== null
      ? future(now, grant.entitlementSeconds * 1000) : grant.expiresAt;
    const principal = previous?.principal ?? await tx.accessPrincipal.create({ data: { type: 'anonymous', label: grant.label, expiresAt } });
    if (!previous) {
      await tx.proRedemption.create({ data: { grantId: grant.id, deviceHash, principalId: principal.id } });
      await tx.accessGrant.update({ where: { id: grant.id }, data: { redeemedCount: { increment: 1 } } });
    }
    // Pro expiry belongs to its principal/grant, preserving the existing session identity constraint.
    const session = await tx.accessSession.create({ data: { role: 'pro', tokenHash, grantId: grant.id, principalId: principal.id } });
    await writeSecurityAudit('pro.redeem', 'success', grant.id, undefined, tx);
    return { session, principal };
  });
}
