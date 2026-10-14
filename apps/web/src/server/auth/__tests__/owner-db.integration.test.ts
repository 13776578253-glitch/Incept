import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashCredential, decryptTotp, totpAt, OWNER_TTL_MS } from '@incept/db/owner/security';

const url = process.env.INCEPT_AUTH_TEST_DATABASE_URL;
let owner: typeof import('@incept/db/owner');
let access: typeof import('@incept/db/access');
let prisma: typeof import('@incept/db')['prisma'];
const password = 'isolated-owner-password-2026';
let now: Date;
const later = (ms: number) => new Date(now.getTime() + ms);
const token = (label: string) => hashCredential(`isolated-${label}-${Math.random()}`);

describe.skipIf(!url)('Owner / Pro real PostgreSQL acceptance', () => {
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.startsWith('/incept_owner_auth_')) throw new Error('Only an isolated Owner acceptance database may run these tests.');
    process.env.DATABASE_URL = url;
    ({ prisma } = await import('@incept/db'));
    [owner, access] = await Promise.all([import('@incept/db/owner'), import('@incept/db/access')]);
    const rows = await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
    if (rows[0].db !== new URL(url).pathname.slice(1)) throw new Error('Unexpected database; refusing test cleanup.');
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE pro_redemptions, access_sessions, access_grants, access_principals, owner_permits, owner_challenges, owner_recovery_codes, owner_devices, owner_accounts, auth_rate_buckets, security_audits CASCADE');
    now = new Date(Date.now() + 1000);
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  async function initialized(trustDevice = true) {
    const setup = await owner.initializeOwner('owner', password, false, now);
    const login = await owner.startOwnerLogin({ username: 'owner', password, deviceLabel: 'Acceptance browser', networkHash: 'network-one', now });
    const enrollment = await owner.completeOwnerChallenge({ challengeToken: login.challengeToken, code: setup.setupCode, now });
    if (!('secret' in enrollment) || !enrollment.secret) throw new Error('Enrollment did not start');
    const secret = enrollment.secret;
    const finished = await owner.completeOwnerChallenge({ challengeToken: login.challengeToken, code: totpAt(secret, Math.floor(now.getTime() / 30000)), trustDevice, now });
    if (!('sessionToken' in finished) || !finished.sessionToken) throw new Error('Enrollment did not finish');
    const session = await access.findActiveAccessSessionByTokenHash(hashCredential(finished.sessionToken), { now });
    if (!session) throw new Error('Owner session did not validate');
    return { ...finished, secret, session, setup, login };
  }
  async function unknownLogin(secret: string, time = later(31000)) {
    const login = await owner.startOwnerLogin({ username: 'owner', password, deviceLabel: 'Unknown browser', networkHash: 'network-two', now: time });
    const result = await owner.completeOwnerChallenge({ challengeToken: login.challengeToken, code: totpAt(secret, Math.floor(time.getTime() / 30000)), now: time });
    if (result.stage !== 'approval') throw new Error('Unknown device did not require approval');
    return { ...login, time };
  }

  it('initializes once, enrolls encrypted TOTP and returns eight hash-only recovery codes', async () => {
    const result = await initialized();
    expect(result.recoveryCodes).toHaveLength(8);
    const account = await prisma.ownerAccount.findUniqueOrThrow({ where: { id: 'owner' } });
    expect(account.passwordHash).not.toContain(password);
    expect(account.totpCiphertext).not.toContain(result.secret);
    expect(decryptTotp(account.totpCiphertext!)).toBe(result.secret);
    await expect(owner.initializeOwner('owner', password, false, now)).rejects.toMatchObject({ code: 'owner_already_initialized' });
    const rows = await prisma.ownerRecoveryCode.findMany();
    expect(rows.map(row => row.codeHash)).toEqual(expect.arrayContaining(result.recoveryCodes!.map(hashCredential)));
  });

  it('serializes simultaneous initialization and the database rejects a second Owner identity', async () => {
    const results = await Promise.allSettled([owner.initializeOwner('one', password, false, now), owner.initializeOwner('two', password, false, now)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    await expect(prisma.ownerAccount.create({ data: { id: 'another-owner', username: 'other', passwordHash: 'invalid' } })).rejects.toThrow();
    expect(await prisma.ownerAccount.count()).toBe(1);
  });

  it('requires the controlled setup permit and atomically consumes it', async () => {
    const setup = await owner.initializeOwner('owner', password, false, now);
    const login = await owner.startOwnerLogin({ username: 'owner', password, deviceLabel: 'browser', networkHash: 'network', now });
    expect(await owner.completeOwnerChallenge({ challengeToken: login.challengeToken, code: 'not-a-permit', now })).toEqual({ error: 'invalid_code' });
    const outcomes = await Promise.allSettled(Array.from({ length: 3 }, () => owner.completeOwnerChallenge({ challengeToken: login.challengeToken, code: setup.setupCode, now })));
    expect(outcomes.filter(result => result.status === 'fulfilled' && result.value.stage === 'enroll')).toHaveLength(1);
    expect(await prisma.accessSession.count({ where: { role: 'owner' } })).toBe(0);
  });

  it('rejects password failures, expired challenges and exhausted verification attempts', async () => {
    await owner.initializeOwner('owner', password, false, now);
    await expect(owner.startOwnerLogin({ username: 'owner', password: 'wrong', deviceLabel: 'browser', networkHash: 'network', now })).rejects.toMatchObject({ code: 'invalid_credentials' });
    const login = await owner.startOwnerLogin({ username: 'owner', password, deviceLabel: 'browser', networkHash: 'network', now });
    for (let attempt = 0; attempt < 5; attempt++) expect(await owner.completeOwnerChallenge({ challengeToken: login.challengeToken, code: 'wrong', now })).toHaveProperty('error');
    await expect(owner.completeOwnerChallenge({ challengeToken: login.challengeToken, code: 'wrong', now })).rejects.toMatchObject({ code: 'challenge_expired' });
    const expired = await owner.startOwnerLogin({ username: 'owner', password, deviceLabel: 'browser', networkHash: 'network', now });
    await expect(owner.completeOwnerChallenge({ challengeToken: expired.challengeToken, code: 'anything', now: later(300001) })).rejects.toMatchObject({ code: 'challenge_expired' });
  });

  it('does not create Owner before unknown-device approval and rejects Pro codes or cross-challenge approval', async () => {
    const initial = await initialized();
    const login = await unknownLogin(initial.secret);
    expect(await prisma.accessSession.count({ where: { role: 'owner' } })).toBe(1);
    const grant = await owner.createTemporaryProGrant(initial.session.id, { kind: 'single', label: 'Pro', deadline: 30, duration: 24, limit: 10 }, now);
    expect(await owner.completeOwnerChallenge({ challengeToken: login.challengeToken, code: grant.code, now: login.time })).toHaveProperty('error');
    const permit = await owner.issueLoginApproval(login.challengeId, undefined, login.time);
    const other = await unknownLogin(initial.secret, later(62000));
    expect(await owner.completeOwnerChallenge({ challengeToken: other.challengeToken, code: permit.code, now: other.time })).toHaveProperty('error');
    const results = await Promise.allSettled(Array.from({ length: 3 }, () => owner.completeOwnerChallenge({ challengeToken: login.challengeToken, code: permit.code, now: login.time })));
    expect(results.filter(result => result.status === 'fulfilled' && result.value.stage === 'complete')).toHaveLength(1);
  });

  it('trusts a verified device but requests approval after a network change and blocks TOTP replay', async () => {
    const initial = await initialized();
    const time = later(31000);
    const login = await owner.startOwnerLogin({ username: 'owner', password, deviceToken: initial.deviceToken, deviceLabel: 'Known', networkHash: 'network-one', now: time });
    const result = await owner.completeOwnerChallenge({ challengeToken: login.challengeToken, code: totpAt(initial.secret, Math.floor(time.getTime() / 30000)), now: time });
    expect(result.stage).toBe('complete');
    const again = await owner.startOwnerLogin({ username: 'owner', password, deviceToken: initial.deviceToken, deviceLabel: 'Known', networkHash: 'network-one', now: time });
    expect(await owner.completeOwnerChallenge({ challengeToken: again.challengeToken, code: totpAt(initial.secret, Math.floor(time.getTime() / 30000)), now: time })).toHaveProperty('error');
    const changed = await owner.startOwnerLogin({ username: 'owner', password, deviceToken: initial.deviceToken, deviceLabel: 'Known', networkHash: 'changed', now: later(62000) });
    const pending = await owner.completeOwnerChallenge({ challengeToken: changed.challengeToken, code: totpAt(initial.secret, Math.floor(later(62000).getTime() / 30000)), now: later(62000) });
    expect(pending.stage).toBe('approval');
  });

  it('enforces idle expiry, absolute expiry and refuses historical secret sessions', async () => {
    const initial = await initialized();
    expect(await access.findActiveAccessSessionByTokenHash(hashCredential(initial.sessionToken!), { now: later(1800001) })).toBeNull();
    await prisma.accessSession.update({ where: { id: initial.session.id }, data: { lastUsedAt: later(OWNER_TTL_MS - 100), expiresAt: later(OWNER_TTL_MS * 2) } });
    expect(await access.findActiveAccessSessionByTokenHash(hashCredential(initial.sessionToken!), { now: later(OWNER_TTL_MS + 1) })).toBeNull();
    const legacy = await access.createOwnerAccessSession({ tokenHash: token('legacy'), now });
    expect(await access.findActiveAccessSessionByTokenHash(legacy.tokenHash, { now })).toBeNull();
  });

  it('requires recent authentication and revokes sessions and trusted devices on password change', async () => {
    const initial = await initialized();
    await expect(owner.createTemporaryProGrant(initial.session.id, { kind: 'single', label: '', deadline: 30, duration: 24, limit: 10 }, later(300001))).rejects.toMatchObject({ status: 428 });
    expect(await owner.reauthenticateOwner(initial.session.id, password, totpAt(initial.secret, Math.floor(later(310000).getTime() / 30000)), later(310000))).toBe(true);
    await owner.manageOwner(initial.session.id, 'password', 'changed-owner-password-2026', later(311000));
    expect(await access.findActiveAccessSessionByTokenHash(hashCredential(initial.sessionToken!), { now: later(312000) })).toBeNull();
    expect(await prisma.ownerDevice.count({ where: { revokedAt: null } })).toBe(0);
    await expect(owner.startOwnerLogin({ username: 'owner', password, deviceLabel: 'Known', networkHash: 'network', now: later(312000) })).rejects.toMatchObject({ code: 'invalid_credentials' });
  });

  it('consumes recovery once, revokes old state and supports SSH recovery after losing the encryption key', async () => {
    const initial = await initialized();
    const login = await owner.startOwnerLogin({ username: 'owner', password, deviceLabel: 'Recovery', networkHash: 'network', now: later(31000) });
    expect((await owner.completeOwnerChallenge({ challengeToken: login.challengeToken, code: initial.recoveryCodes![0], recovery: true, now: later(31000) })).stage).toBe('approval');
    expect(await access.findActiveAccessSessionByTokenHash(hashCredential(initial.sessionToken!), { now: later(31000) })).toBeNull();
    const repeated = await owner.startOwnerLogin({ username: 'owner', password, deviceLabel: 'Recovery', networkHash: 'network', now: later(31000) });
    expect(await owner.completeOwnerChallenge({ challengeToken: repeated.challengeToken, code: initial.recoveryCodes![0], recovery: true, now: later(31000) })).toHaveProperty('error');
    const originalKey = process.env.INCEPT_AUTH_ENCRYPTION_KEY;
    try {
      process.env.INCEPT_AUTH_ENCRYPTION_KEY = 'c3'.repeat(32);
      const recovered = await owner.initializeOwner('owner', 'recovered-password-2026', true, later(32000));
      expect(recovered.setupCode).toMatch(/^SETUP-/);
      expect((await prisma.ownerAccount.findUniqueOrThrow({ where: { id: 'owner' } })).totpCiphertext).toBeNull();
    } finally { process.env.INCEPT_AUTH_ENCRYPTION_KEY = originalKey; }
  });

  it('re-enrolls TOTP, replaces recovery codes and revokes old sessions', async () => {
    const initial = await initialized();
    const next = await owner.manageOwner(initial.session.id, 'totp', undefined, later(31000));
    if (!('challengeToken' in next) || !next.challengeToken || !next.secret) throw new Error('Re-enrollment missing');
    const result = await owner.completeOwnerChallenge({ challengeToken: next.challengeToken, code: totpAt(next.secret, Math.floor(later(31000).getTime() / 30000)), now: later(31000) });
    expect(result.stage).toBe('complete');
    expect(await access.findActiveAccessSessionByTokenHash(hashCredential(initial.sessionToken!), { now: later(31000) })).toBeNull();
    expect(await prisma.ownerRecoveryCode.findUnique({ where: { codeHash: hashCredential(initial.recoveryCodes![0]) } })).toBeNull();
  });

  it('permits exactly one concurrent single-use redemption and preserves its entitlement after the window closes', async () => {
    const initial = await initialized();
    const grant = await owner.createTemporaryProGrant(initial.session.id, { kind: 'single', label: 'single', deadline: 30, duration: 24, limit: 10 }, now);
    const results = await Promise.all(Array.from({ length: 6 }, (_, index) => owner.redeemTemporaryProGrant(hashCredential(grant.code), token(`pro-${index}`), token(`device-${index}`), now)));
    const successes = results.filter(result => result !== null);
    expect(successes).toHaveLength(1);
    expect((await prisma.accessGrant.findUniqueOrThrow({ where: { id: grant.grantId } })).redeemedCount).toBe(1);
    const session = successes[0]!.session;
    expect(await access.findActiveAccessSessionByTokenHash(session.tokenHash, { now: later(1800001) })).not.toBeNull();
    expect(await access.findActiveAccessSessionByTokenHash(session.tokenHash, { now: later(86400001) })).toBeNull();
    await owner.revokeTemporaryProGrant(initial.session.id, grant.grantId, later(1000));
    expect(await access.findActiveAccessSessionByTokenHash(session.tokenHash, { now: later(1001) })).toBeNull();
  });

  it('caps shared redemptions atomically, counts repeated browser credentials once and uses one absolute expiry', async () => {
    const initial = await initialized();
    const grant = await owner.createTemporaryProGrant(initial.session.id, { kind: 'shared', label: 'shared', deadline: 1, duration: 24, limit: 2 }, now);
    const devices = Array.from({ length: 5 }, (_, index) => token(`browser-${index}`));
    const results = await Promise.all(devices.map((device, index) => owner.redeemTemporaryProGrant(hashCredential(grant.code), token(`shared-${index}`), device, now)));
    expect(results.filter(Boolean)).toHaveLength(2);
    const successfulIndex = results.findIndex(Boolean);
    const repeated = await owner.redeemTemporaryProGrant(hashCredential(grant.code), token('repeated'), devices[successfulIndex], later(1000));
    expect(repeated).not.toBeNull();
    expect((await prisma.accessGrant.findUniqueOrThrow({ where: { id: grant.grantId } })).redeemedCount).toBe(2);
    expect(repeated!.principal.expiresAt!.getTime()).toBe(now.getTime() + 86400000);
    expect(await access.findActiveAccessSessionByTokenHash(repeated!.session.tokenHash, { now: later(86400001) })).toBeNull();
  });

  it('keeps legacy Pro grants valid, rejects Pro administration and exposes no credentials in management metadata', async () => {
    const initial = await initialized();
    const credentialHash = token('legacy-grant');
    await access.createSharedAccessGrant({ label: 'legacy', credentialHash, expiresAt: later(86400000) });
    const redemption = await access.redeemSharedAccessGrant({ credentialHash, tokenHash: token('legacy-pro'), now });
    expect(redemption).not.toBeNull();
    expect(await access.findActiveAccessSessionByTokenHash(redemption!.session.tokenHash, { now })).not.toBeNull();
    await expect(owner.getOwnerManagementState(redemption!.session.id, now)).rejects.toMatchObject({ status: 403 });
    const metadata = JSON.stringify(await owner.getOwnerManagementState(initial.session.id, now));
    expect(metadata).not.toContain(initial.secret); expect(metadata).not.toContain(initial.sessionToken); expect(metadata).not.toContain(password);
    for (const code of initial.recoveryCodes!) expect(metadata).not.toContain(code);
  });

  it('reuses CLI revocation to invalidate pending challenges and trusted devices immediately', async () => {
    const initial = await initialized();
    const pending = await unknownLogin(initial.secret);
    const permit = await owner.issueLoginApproval(pending.challengeId, undefined, pending.time);
    await access.revokeAllOwnerAccessSessions({ now: pending.time });
    expect(await access.findActiveAccessSessionByTokenHash(hashCredential(initial.sessionToken!), { now: pending.time })).toBeNull();
    expect(await prisma.ownerDevice.count({ where: { revokedAt: null } })).toBe(0);
    await expect(owner.completeOwnerChallenge({ challengeToken: pending.challengeToken, code: permit.code, now: pending.time })).rejects.toMatchObject({ code: 'challenge_expired' });
  });

  it('refuses legacy CLI rotation that would remove temporary Pro expiry and redemption caps', async () => {
    const initial = await initialized();
    const grant = await owner.createTemporaryProGrant(initial.session.id, { kind: 'shared', label: 'bounded', deadline: 1, duration: 24, limit: 2 }, now);
    await expect(access.rotateSharedAccessGrant({ grantId: grant.grantId, credentialHash: token('rotated'), now })).rejects.toThrow('Temporary Pro grants');
    expect((await prisma.accessGrant.findUniqueOrThrow({ where: { id: grant.grantId } })).revokedAt).toBeNull();
  });

  it('keeps rate counters in PostgreSQL, expires their window and records redacted audit outcomes', async () => {
    await owner.consumeAuthLimit('test-limit', 2, now); await owner.consumeAuthLimit('test-limit', 2, now);
    await expect(owner.consumeAuthLimit('test-limit', 2, now)).rejects.toMatchObject({ status: 429 });
    expect((await prisma.authRateBucket.findUniqueOrThrow({ where: { key: hashCredential('test-limit') } })).count).toBe(3);
    await owner.consumeAuthLimit('test-limit', 2, later(600001));
    expect((await prisma.authRateBucket.findUniqueOrThrow({ where: { key: hashCredential('test-limit') } })).count).toBe(1);
    const initial = await initialized();
    const records = JSON.stringify(await prisma.securityAudit.findMany());
    expect(records).toContain('owner.login'); expect(records).not.toContain(password); expect(records).not.toContain(initial.secret);
  });
});
