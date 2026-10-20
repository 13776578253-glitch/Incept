import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashCredential, decryptTotp, totpAt, OWNER_TTL_MS } from '@incept/db/owner/security';

const url = process.env.INCEPT_AUTH_TEST_DATABASE_URL;
let owner: typeof import('@incept/db/owner');
let access: typeof import('@incept/db/access');
let prisma: typeof import('@incept/db')['prisma'];
const password = 'isolated-owner-password-2026';
const browser = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const otherBrowser = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0';
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

  async function challengeLogin(input: Parameters<typeof owner.startOwnerLogin>[0]) {
    const login = await owner.startOwnerLogin(input);
    if (!('challengeToken' in login)) throw new Error('Expected a verification challenge');
    return { ...login, challengeToken: login.challengeToken };
  }

  async function initialized(trustDevice = true) {
    const setup = await owner.initializeOwner('owner', password, false, now);
    const login = await challengeLogin({ username: 'owner', password, deviceLabel: browser, networkHash: 'network-one', now });
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
    const login = await challengeLogin({ username: 'owner', password, deviceLabel: 'Unknown browser', networkHash: 'network-two', now: time });
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
    const login = await challengeLogin({ username: 'owner', password, deviceLabel: 'browser', networkHash: 'network', now });
    expect(await owner.completeOwnerChallenge({ challengeToken: login.challengeToken, code: 'not-a-permit', now })).toEqual({ error: 'invalid_code' });
    const outcomes = await Promise.allSettled(Array.from({ length: 3 }, () => owner.completeOwnerChallenge({ challengeToken: login.challengeToken, code: setup.setupCode, now })));
    expect(outcomes.filter(result => result.status === 'fulfilled' && result.value.stage === 'enroll')).toHaveLength(1);
    expect(await prisma.accessSession.count({ where: { role: 'owner' } })).toBe(0);
  });

  it('rejects password failures, expired challenges and exhausted verification attempts', async () => {
    await owner.initializeOwner('owner', password, false, now);
    await expect(owner.startOwnerLogin({ username: 'owner', password: 'wrong', deviceLabel: 'browser', networkHash: 'network', now })).rejects.toMatchObject({ code: 'invalid_credentials' });
    const login = await challengeLogin({ username: 'owner', password, deviceLabel: 'browser', networkHash: 'network', now });
    for (let attempt = 0; attempt < 5; attempt++) expect(await owner.completeOwnerChallenge({ challengeToken: login.challengeToken, code: 'wrong', now })).toHaveProperty('error');
    await expect(owner.completeOwnerChallenge({ challengeToken: login.challengeToken, code: 'wrong', now })).rejects.toMatchObject({ code: 'challenge_expired' });
    const expired = await challengeLogin({ username: 'owner', password, deviceLabel: 'browser', networkHash: 'network', now });
    await expect(owner.completeOwnerChallenge({ challengeToken: expired.challengeToken, code: 'anything', now: later(300001) })).rejects.toMatchObject({ code: 'challenge_expired' });
  });

  it('does not create Owner before unknown-device approval and rejects Pro codes or cross-challenge approval', async () => {
    const initial = await initialized();
    const login = await unknownLogin(initial.secret);
    expect(await prisma.accessSession.count({ where: { role: 'owner' } })).toBe(1);
    const grant = await owner.createTemporaryProGrant(initial.session.id, { kind: 'single', label: 'Pro', lifetimeDays: 7 }, now);
    expect(await owner.completeOwnerChallenge({ challengeToken: login.challengeToken, code: grant.code, now: login.time })).toHaveProperty('error');
    const permit = await owner.issueLoginApproval(login.challengeId, undefined, login.time);
    const other = await unknownLogin(initial.secret, later(62000));
    expect(await owner.completeOwnerChallenge({ challengeToken: other.challengeToken, code: permit.code, now: other.time })).toHaveProperty('error');
    const results = await Promise.allSettled(Array.from({ length: 3 }, () => owner.completeOwnerChallenge({ challengeToken: login.challengeToken, code: permit.code, now: login.time })));
    expect(results.filter(result => result.status === 'fulfilled' && result.value.stage === 'complete')).toHaveLength(1);
  });

  it('skips TOTP for a trusted environment even after an IP change without granting recent authentication', async () => {
    const initial = await initialized();
    const time = later(31000);
    const expiry = (await prisma.ownerDevice.findFirstOrThrow()).expiresAt;
    for (const networkHash of ['network-one', 'changed']) {
      const result = await owner.startOwnerLogin({ username: 'owner', password, deviceToken: initial.deviceToken,
        deviceLabel: browser.replace('130.0', '131.0'), networkHash, now: time });
      expect(result.stage).toBe('complete');
      if (!('sessionToken' in result)) throw new Error('Expected password-only completion');
      expect(result.sessionToken).toBeTruthy();
      const session = await access.findActiveAccessSessionByTokenHash(hashCredential(result.sessionToken!), { now: time });
      expect(session?.authenticatedAt).toBeNull();
      expect(session?.expiresAt!.getTime()).toBe(time.getTime() + OWNER_TTL_MS);
      expect((await owner.getOwnerManagementState(session!.id, time)).recentAuthUntil).toBeNull();
      await expect(owner.createTemporaryProGrant(session!.id, { kind: 'single', label: '', lifetimeDays: 7 }, time)).rejects.toMatchObject({ status: 428 });
      for (const action of ['password', 'recovery-codes', 'totp', 'sessions-all', 'session', 'device', 'permit']) {
        await expect(owner.manageOwner(session!.id, action, action === 'password' ? 'another-valid-password-2026' : 'unused', time)).rejects.toMatchObject({ status: 428 });
      }
      await expect(owner.issueLoginApproval('unused', session!.id, time)).rejects.toMatchObject({ status: 428 });
    }
    expect((await prisma.ownerDevice.findFirstOrThrow()).expiresAt).toEqual(expiry);
    expect(await prisma.ownerChallenge.count({ where: { consumedAt: null } })).toBe(0);
  });

  it('requires only TOTP for environment changes, updates the environment and rejects replay', async () => {
    const initial = await initialized(), time = later(31000);
    const login = await challengeLogin({ username: 'owner', password, deviceToken: initial.deviceToken, deviceLabel: otherBrowser, networkHash: 'changed', now: time });
    expect(login.needsApproval).toBe(false);
    const code = totpAt(initial.secret, Math.floor(time.getTime() / 30000));
    expect((await owner.completeOwnerChallenge({ challengeToken: login.challengeToken, code, now: time })).stage).toBe('complete');
    const repeat = await challengeLogin({ username: 'owner', password, deviceToken: initial.deviceToken, deviceLabel: browser, networkHash: 'changed', now: time });
    expect(await owner.completeOwnerChallenge({ challengeToken: repeat.challengeToken, code, now: time })).toHaveProperty('error');
    expect((await owner.startOwnerLogin({ username: 'owner', password, deviceToken: initial.deviceToken, deviceLabel: otherBrowser, networkHash: 'changed', now: time })).stage).toBe('complete');
  });

  it('requires full approval for expired, revoked, forged and old-version device credentials', async () => {
    const initial = await initialized();
    const device = await prisma.ownerDevice.findFirstOrThrow();
    for (const update of [{ expiresAt: later(-1) }, { expiresAt: later(86400000), revokedAt: now }, { revokedAt: null, credentialVersion: 0 }]) {
      await prisma.ownerDevice.update({ where: { id: device.id }, data: update });
      const login = await challengeLogin({ username: 'owner', password, deviceToken: initial.deviceToken, deviceLabel: browser, networkHash: 'network-one', now: later(31000) });
      expect(login.needsApproval).toBe(true);
    }
    const forged = await challengeLogin({ username: 'owner', password, deviceToken: 'forged', deviceLabel: browser, networkHash: 'network-one', now: later(31000) });
    expect(forged.needsApproval).toBe(true);
  });

  it('escalates repeated password failures on the related device and clears risk only after full verification', async () => {
    const initial = await initialized(), time = later(31000);
    const input = { username: 'owner', password, deviceToken: initial.deviceToken, deviceLabel: browser, networkHash: 'network-one', now: time };
    for (let i = 0; i < 5; i++) await expect(owner.startOwnerLogin({ ...input, password: 'incorrect' })).rejects.toMatchObject({ code: 'invalid_credentials' });
    const login = await challengeLogin({ ...input, networkHash: 'new-network' });
    expect(login.needsApproval).toBe(true);
    expect((await owner.completeOwnerChallenge({ challengeToken: login.challengeToken, code: totpAt(initial.secret, Math.floor(time.getTime() / 30000)), now: time })).stage).toBe('approval');
    const approval = await owner.issueLoginApproval(login.challengeId!, undefined, time);
    expect((await owner.completeOwnerChallenge({ challengeToken: login.challengeToken, code: approval.code, now: later(32000) })).stage).toBe('complete');
    expect((await owner.startOwnerLogin({ ...input, networkHash: 'new-network', now: later(33000) })).stage).toBe('complete');
  });

  it('keeps unrelated failures isolated and expires related password risk after ten minutes', async () => {
    const initial = await initialized(), time = later(31000);
    for (let i = 0; i < 5; i++) await expect(owner.startOwnerLogin({ username: 'owner', password: 'wrong', deviceLabel: browser, networkHash: 'stranger', now: time })).rejects.toMatchObject({ code: 'invalid_credentials' });
    const input = { username: 'owner', password, deviceToken: initial.deviceToken, deviceLabel: browser, networkHash: 'network-one', now: time };
    expect((await owner.startOwnerLogin(input)).stage).toBe('complete');
    for (let i = 0; i < 5; i++) await expect(owner.startOwnerLogin({ ...input, password: 'wrong' })).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect((await challengeLogin(input)).needsApproval).toBe(true);
    expect((await owner.startOwnerLogin({ ...input, now: later(631001) })).stage).toBe('complete');
  });

  it('recognizes same-network failures without cookies and step-up stays local to the quick-login session', async () => {
    const initial = await initialized(), time = later(31000);
    const input = { username: 'owner', password, deviceToken: initial.deviceToken, deviceLabel: browser, networkHash: 'network-one', now: time };
    const quick = await owner.startOwnerLogin(input);
    if (!('sessionToken' in quick)) throw new Error('Expected quick login');
    const quickSession = await access.findActiveAccessSessionByTokenHash(hashCredential(quick.sessionToken), { now: time });
    expect(await owner.reauthenticateOwner(quickSession!.id, password, totpAt(initial.secret, Math.floor(time.getTime() / 30000)), time)).toBe(true);
    await owner.createTemporaryProGrant(quickSession!.id, { kind: 'single', label: 'after step-up', lifetimeDays: 7 }, time);
    expect((await prisma.accessSession.findUniqueOrThrow({ where: { id: initial.session.id } })).authenticatedAt).toEqual(now);
    await expect(owner.requireRecentOwnerSession(quickSession!.id, later(331000))).rejects.toMatchObject({ status: 428 });
    for (let i = 0; i < 5; i++) await expect(owner.startOwnerLogin({ ...input, deviceToken: undefined, password: 'wrong' })).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect((await challengeLogin(input)).needsApproval).toBe(true);
  });

  it('rechecks risk and revocation while a TOTP challenge is pending', async () => {
    const initial = await initialized(), time = later(31000);
    const input = { username: 'owner', password, deviceToken: initial.deviceToken, deviceLabel: otherBrowser, networkHash: 'network-one', now: time };
    const pending = await challengeLogin(input);
    expect(pending.needsApproval).toBe(false);
    const attacked = await challengeLogin(input);
    for (let i = 0; i < 5; i++) await owner.completeOwnerChallenge({ challengeToken: attacked.challengeToken, code: 'wrong', now: time });
    expect((await owner.completeOwnerChallenge({ challengeToken: pending.challengeToken, code: totpAt(initial.secret, Math.floor(time.getTime() / 30000)), now: later(32000) })).stage).toBe('approval');
    const other = await challengeLogin({ ...input, now: later(33000) });
    const device = await prisma.ownerDevice.findFirstOrThrow();
    await owner.manageOwner(initial.session.id, 'device', device.id, later(34000));
    await expect(owner.completeOwnerChallenge({ challengeToken: other.challengeToken, code: 'anything', now: later(35000) })).rejects.toMatchObject({ code: 'challenge_expired' });
  });

  it('keeps Owner signed in while idle, expires exactly at seven days and refuses historical secret sessions', async () => {
    const initial = await initialized();
    expect(OWNER_TTL_MS).toBe(7 * 86400000);
    expect(initial.session.expiresAt!.getTime()).toBe(later(OWNER_TTL_MS).getTime());
    expect(await access.findActiveAccessSessionByTokenHash(hashCredential(initial.sessionToken!), { now: later(6 * 86400000) })).not.toBeNull();
    const state = await owner.getOwnerManagementState(initial.session.id, later(6 * 86400000));
    expect(state.sessions.map(session => session.id)).toContain(initial.session.id);
    expect((await prisma.accessSession.findUniqueOrThrow({ where: { id: initial.session.id } })).expiresAt!.getTime()).toBe(later(OWNER_TTL_MS).getTime());
    expect(await access.findActiveAccessSessionByTokenHash(hashCredential(initial.sessionToken!), { now: later(OWNER_TTL_MS - 1) })).not.toBeNull();
    expect(await access.findActiveAccessSessionByTokenHash(hashCredential(initial.sessionToken!), { now: later(OWNER_TTL_MS) })).toBeNull();
    await expect(owner.getOwnerManagementState(initial.session.id, later(OWNER_TTL_MS))).rejects.toMatchObject({ code: 'session_expired' });
    const legacy = await access.createOwnerAccessSession({ tokenHash: token('legacy'), now });
    expect(await access.findActiveAccessSessionByTokenHash(legacy.tokenHash, { now })).toBeNull();
  });

  it('uses the issued expiry without a hidden creation or idle cutoff and respects shorter existing sessions', async () => {
    const initial = await initialized();
    await prisma.accessSession.update({ where: { id: initial.session.id }, data: { createdAt: later(-30 * 86400000), lastUsedAt: null, expiresAt: later(12 * 3600000) } });
    expect(await access.findActiveAccessSessionByTokenHash(hashCredential(initial.sessionToken!), { now: later(3600000) })).not.toBeNull();
    expect(await owner.getOwnerManagementState(initial.session.id, later(3600000))).toHaveProperty('sessionId', initial.session.id);
    expect(await access.findActiveAccessSessionByTokenHash(hashCredential(initial.sessionToken!), { now: later(12 * 3600000) })).toBeNull();
  });

  it('requires step-up for every security action after inactivity without ending the seven-day session', async () => {
    const initial = await initialized();
    const time = later(2 * 86400000);
    for (const action of ['password', 'recovery-codes', 'totp', 'sessions-all', 'session', 'device', 'permit']) {
      await expect(owner.manageOwner(initial.session.id, action, action === 'password' ? 'another-owner-password-2026' : 'unused-id', time)).rejects.toMatchObject({ status: 428 });
    }
    await expect(owner.createTemporaryProGrant(initial.session.id, { kind: 'single', label: '', lifetimeDays: 7 }, time)).rejects.toMatchObject({ status: 428 });
    await expect(owner.revokeTemporaryProGrant(initial.session.id, 'unused-id', time)).rejects.toMatchObject({ status: 428 });
    await expect(owner.issueLoginApproval('unused-id', initial.session.id, time)).rejects.toMatchObject({ status: 428 });
    expect(await access.findActiveAccessSessionByTokenHash(hashCredential(initial.sessionToken!), { now: time })).not.toBeNull();
    expect(await owner.reauthenticateOwner(initial.session.id, password, totpAt(initial.secret, Math.floor(time.getTime() / 30000)), time)).toBe(true);
    await owner.requireRecentOwnerSession(initial.session.id, time);
    expect(await owner.createTemporaryProGrant(initial.session.id, { kind: 'shared', label: 'after step-up', lifetimeHours: 6, limit: 2 }, time)).toHaveProperty('grantId');
    expect((await prisma.accessSession.findUniqueOrThrow({ where: { id: initial.session.id } })).expiresAt!.getTime()).toBe(later(OWNER_TTL_MS).getTime());
    await expect(owner.requireRecentOwnerSession(initial.session.id, new Date(time.getTime() + 300000))).rejects.toMatchObject({ status: 428 });
    expect(await access.findActiveAccessSessionByTokenHash(hashCredential(initial.sessionToken!), { now: new Date(time.getTime() + 300000) })).not.toBeNull();
  });

  it('requires recent authentication and revokes sessions and trusted devices on password change', async () => {
    const initial = await initialized();
    await expect(owner.createTemporaryProGrant(initial.session.id, { kind: 'single', label: '', lifetimeDays: 7 }, later(300001))).rejects.toMatchObject({ status: 428 });
    expect(await owner.reauthenticateOwner(initial.session.id, password, totpAt(initial.secret, Math.floor(later(310000).getTime() / 30000)), later(310000))).toBe(true);
    await owner.manageOwner(initial.session.id, 'password', '12345678', later(311000));
    expect(await access.findActiveAccessSessionByTokenHash(hashCredential(initial.sessionToken!), { now: later(312000) })).toBeNull();
    expect(await prisma.ownerDevice.count({ where: { revokedAt: null } })).toBe(0);
    await expect(owner.startOwnerLogin({ username: 'owner', password, deviceLabel: 'Known', networkHash: 'network', now: later(312000) })).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect((await owner.startOwnerLogin({ username: 'owner', password: '12345678', deviceLabel: browser, networkHash: 'network', now: later(313000) })).stage).toBe('totp');
  });

  it('consumes recovery once, revokes old state and supports SSH recovery after losing the encryption key', async () => {
    const initial = await initialized();
    const login = await challengeLogin({ username: 'owner', password, deviceLabel: 'Recovery', networkHash: 'network', now: later(31000) });
    expect((await owner.completeOwnerChallenge({ challengeToken: login.challengeToken, code: initial.recoveryCodes![0], recovery: true, now: later(31000) })).stage).toBe('approval');
    expect(await access.findActiveAccessSessionByTokenHash(hashCredential(initial.sessionToken!), { now: later(31000) })).toBeNull();
    const repeated = await challengeLogin({ username: 'owner', password, deviceLabel: 'Recovery', networkHash: 'network', now: later(31000) });
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

  it('permits exactly one concurrent invitation redemption and preserves its issuance deadline', async () => {
    const initial = await initialized();
    const grant = await owner.createTemporaryProGrant(initial.session.id, { kind: 'single', label: 'single', lifetimeDays: 7 }, now);
    const results = await Promise.all(Array.from({ length: 6 }, (_, index) => owner.redeemTemporaryProGrant(hashCredential(grant.code), token(`pro-${index}`), token(`device-${index}`), now)));
    const successes = results.filter(result => result !== null);
    expect(successes).toHaveLength(1);
    expect((await prisma.accessGrant.findUniqueOrThrow({ where: { id: grant.grantId } })).redeemedCount).toBe(1);
    const session = successes[0]!.session;
    expect(await access.findActiveAccessSessionByTokenHash(session.tokenHash, { now: later(1800001) })).not.toBeNull();
    expect(await access.findActiveAccessSessionByTokenHash(session.tokenHash, { now: later(7 * 86400000) })).toBeNull();
    await owner.revokeTemporaryProGrant(initial.session.id, grant.grantId, later(1000));
    expect(await access.findActiveAccessSessionByTokenHash(session.tokenHash, { now: later(1001) })).toBeNull();
  });

  it('caps shared redemptions atomically, counts repeated browser credentials once and uses one absolute expiry', async () => {
    const initial = await initialized();
    const grant = await owner.createTemporaryProGrant(initial.session.id, { kind: 'shared', label: 'shared', lifetimeHours: 24, limit: 2 }, now);
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
    const grant = await owner.createTemporaryProGrant(initial.session.id, { kind: 'shared', label: 'bounded', lifetimeHours: 24, limit: 2 }, now);
    await expect(access.rotateSharedAccessGrant({ grantId: grant.grantId, credentialHash: token('rotated'), now })).rejects.toThrow('Temporary Pro grants');
    expect((await prisma.accessGrant.findUniqueOrThrow({ where: { id: grant.grantId } })).revokedAt).toBeNull();
  });

  it('does not extend invitations or sharing when redeemed shortly before their issuance deadline', async () => {
    const initial = await initialized();
    for (const input of [{ kind: 'single' as const, label: 'late invitation', lifetimeDays: 7 }, { kind: 'shared' as const, label: 'late sharing', lifetimeHours: 6, limit: 2 }]) {
      const grant = await owner.createTemporaryProGrant(initial.session.id, input, now);
      const stored = await prisma.accessGrant.findUniqueOrThrow({ where: { id: grant.grantId } });
      const cutoff = stored.expiresAt!;
      const result = await owner.redeemTemporaryProGrant(hashCredential(grant.code), token('late'), token('late-browser'), new Date(cutoff.getTime() - 1000));
      expect(result!.principal.expiresAt!.getTime()).toBe(cutoff.getTime());
      expect(await access.findActiveAccessSessionByTokenHash(result!.session.tokenHash, { now: cutoff })).toBeNull();
      expect(await owner.redeemTemporaryProGrant(hashCredential(grant.code), token('too-late'), token('other'), cutoff)).toBeNull();
    }
  });

  it('keeps permanent invitations redeemable and readable until explicit revocation', async () => {
    const initial = await initialized();
    const grant = await owner.createTemporaryProGrant(initial.session.id, { kind: 'single', label: 'permanent', lifetimeDays: null }, now);
    const stored = await prisma.accessGrant.findUniqueOrThrow({ where: { id: grant.grantId } });
    expect(stored.expiresAt).toBeNull(); expect(stored.redeemExpiresAt).toBeNull(); expect(stored.entitlementSeconds).toBeNull();
    const distant = later(3650 * 86400000);
    const result = await owner.redeemTemporaryProGrant(hashCredential(grant.code), token('permanent'), token('permanent-browser'), distant);
    expect(result!.principal.expiresAt).toBeNull();
    expect(await access.findActiveAccessSessionByTokenHash(result!.session.tokenHash, { now: distant })).not.toBeNull();
    expect(await owner.redeemTemporaryProGrant(hashCredential(grant.code), token('repeat'), token('other'), distant)).toBeNull();
    await owner.revokeTemporaryProGrant(initial.session.id, grant.grantId, later(1000));
    expect(await access.findActiveAccessSessionByTokenHash(result!.session.tokenHash, { now: distant })).toBeNull();
  });

  it('accepts explicit day/hour lifetimes and rejects implicit, mismatched or unbounded sharing', async () => {
    const initial = await initialized();
    for (const lifetimeDays of [1, 30]) {
      const invitation = await owner.createTemporaryProGrant(initial.session.id, { kind: 'single', label: 'days', lifetimeDays }, now);
      expect((await prisma.accessGrant.findUniqueOrThrow({ where: { id: invitation.grantId } })).expiresAt!.getTime()).toBe(now.getTime() + lifetimeDays * 86400000);
    }
    const shared = await owner.createTemporaryProGrant(initial.session.id, { kind: 'shared', label: 'hour', lifetimeHours: 1, limit: 10 }, now);
    expect((await prisma.accessGrant.findUniqueOrThrow({ where: { id: shared.grantId } })).expiresAt!.getTime()).toBe(now.getTime() + 3600000);
    for (const lifetimeDays of [0, 6, 24, NaN, undefined]) await expect(owner.createTemporaryProGrant(initial.session.id, { kind: 'single', label: '', lifetimeDays: lifetimeDays as number }, now)).rejects.toMatchObject({ code: 'invalid_request' });
    for (const lifetimeHours of [0, 3, 7, 168, NaN, null]) await expect(owner.createTemporaryProGrant(initial.session.id, { kind: 'shared', label: '', lifetimeHours: lifetimeHours as number, limit: 10 }, now)).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(prisma.accessGrant.create({ data: { type: 'sharedCode', mode: 'single', label: 'invalid shape', credentialHash: token('invalid-shape'), maxRedemptions: 1, expiresAt: later(86400000) } })).rejects.toThrow();
  });

  it('preserves previously issued relative invitations without silently granting permanence', async () => {
    await initialized();
    const credentialHash = token('old-relative');
    await prisma.accessGrant.create({ data: { type: 'sharedCode', mode: 'single', label: 'Previously issued', credentialHash,
      redeemExpiresAt: later(1800000), entitlementSeconds: 86400, maxRedemptions: 1 } });
    const result = await owner.redeemTemporaryProGrant(credentialHash, token('legacy-session'), token('legacy-browser'), now);
    expect(result!.principal.expiresAt!.getTime()).toBe(now.getTime() + 86400000);
    expect(await access.findActiveAccessSessionByTokenHash(result!.session.tokenHash, { now: later(1800001) })).not.toBeNull();
    expect(await access.findActiveAccessSessionByTokenHash(result!.session.tokenHash, { now: later(86400001) })).toBeNull();
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
