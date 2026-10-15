import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../packages/db/src/client';
import { importDocsArticleDraft, confirmDocsImportDraft } from '../packages/db/src/docs';
import type { DocsImportWriteSource } from '../packages/db/src/docs/import';
import { emptyDashboard } from '../packages/dashboard/src/domain';
import { saveDashboardSnapshot } from '../packages/dashboard/src/adapters/runtime/snapshot-store';
import { DatabaseSync } from 'node:sqlite';
import { ImportStore } from '../packages/dashboard/src/adapters/local/imports/store';
import { initializeOwner, startOwnerLogin, completeOwnerChallenge, issueLoginApproval } from '../packages/db/src/owner';
import { totpAt } from '../packages/db/src/owner/security';

// This fixture runner must never target the developer's or production database.
assert.equal(process.env.INCEPT_TEST_DEPLOYMENT, '1');
assert.ok(['/incept_readiness', '/incept_readiness_restored'].includes(new URL(process.env.DATABASE_URL!).pathname));
const data = '/data';
const mode = process.argv[2] ?? 'seed';
const hash = (bytes: Buffer | string) => crypto.createHash('sha256').update(bytes).digest('hex');
const at = new Date().toISOString();
const source = (slug: string, role: 'guest' | 'pro' | 'private', url?: string): DocsImportWriteSource => ({
  meta: { documentKey: slug, locale: 'en', routeType: 'singleArticle', kind: 'article', layoutMode: 'contentOnly',
    accessRole: role, isListed: true, slug, title: slug, summary: 'Readiness fixture.', publishedAt: at },
  body: { sections: [{ id: 'main', title: 'Fixture', blocks: url ? [{ id: 'image', type: 'image', src: url, alt: 'Fixture image' }] : [] }] },
});
type Fixture = { owner: string; ownerPassword: string; ownerTotp: string; pro: string; principalId: string; media: Record<string, string> };
async function state() { return JSON.parse(await fs.readFile(path.join(data, 'fixture-state.json'), 'utf8')) as Fixture; }

async function seed() {
  assert.equal(await prisma.docsDocument.count(), 0, 'Refuse to seed an existing dataset.');
  const ownerPassword = crypto.randomBytes(32).toString('base64url'), pro = crypto.randomBytes(32).toString('base64url');
  const initialized = await initializeOwner('owner', ownerPassword);
  const started = await startOwnerLogin({ username: 'owner', password: ownerPassword, deviceLabel: 'Linux acceptance', networkHash: 'fixture' });
  if (!('challengeToken' in started)) throw new Error('Expected initial Owner enrollment');
  const enrollment = await completeOwnerChallenge({ challengeToken: started.challengeToken, code: initialized.setupCode });
  if (!('secret' in enrollment) || !enrollment.secret) throw new Error('Owner enrollment failed');
  const ownerTotp = enrollment.secret;
  const completed = await completeOwnerChallenge({ challengeToken: started.challengeToken, code: totpAt(ownerTotp, Math.floor(Date.now() / 30000)) });
  if (!('sessionToken' in completed) || !completed.sessionToken) throw new Error('Owner authentication failed');
  const owner = completed.sessionToken;
  const principal = await prisma.accessPrincipal.create({ data: { type: 'anonymous', label: 'Readiness Pro' } });
  const grant = await prisma.accessGrant.create({ data: { type: 'sharedCode', label: 'Readiness grant', credentialHash: hash('test-shared-grant') } });
  await prisma.accessSession.create({ data: { role: 'pro', tokenHash: hash(pro), principalId: principal.id, grantId: grant.id } });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSAAAAABJRU5ErkJggg==', 'base64');
  const media: Record<string, string> = {};
  await fs.mkdir(process.env.INCEPT_DOCS_MEDIA_DIR!, { recursive: true });
  await fs.mkdir(process.env.INCEPT_DOCS_DRAFTS_DIR!, { recursive: true });
  for (const role of ['guest', 'pro', 'private'] as const) {
    const bytes = Buffer.concat([png, Buffer.from(role)]), name = `${hash(bytes)}.png`;
    await fs.writeFile(path.join(process.env.INCEPT_DOCS_MEDIA_DIR!, name), bytes);
    media[role] = `/_docs-media/${name}`;
    await importDocsArticleDraft({ source: source(`fixture-${role}`, role, media[role]), replace: false });
  }
  const project = await prisma.roadmapProject.create({ data: { key: 'readiness-project', nameEn: 'Readiness', nameZh: '上线验收', position: 0 } });
  await prisma.roadmap.create({ data: { key: 'readiness-board', nameEn: 'Release', nameZh: '发布', position: 0, projectId: project.id,
    columns: { create: { status: 'unstarted', labelEn: 'Not started', labelZh: '未开始', position: 0 } } } });
  const record: Fixture = { owner, ownerPassword, ownerTotp, pro, principalId: principal.id, media };
  await fs.writeFile(path.join(data, 'fixture-state.json'), JSON.stringify(record), { mode: 0o600 });
  for (const [name, token] of [['owner', owner], ['pro', pro]]) await fs.writeFile(path.join(data, `browser-${name}.json`), JSON.stringify({
    cookies: [{ name: 'incept-access-session', value: token, domain: 'localhost', path: '/', httpOnly: true, secure: true, sameSite: 'Lax', expires: Math.floor(Date.now() / 1000) + 86400 }], origins: [],
  }), { mode: 0o600 });
  const dataset = { ...emptyDashboard(), checkedAt: at };
  dataset.totals.totalTokens = 42;
  dataset.collectionIssues = ['readiness-sensitive-error'];
  dataset.projects = [{ ...dataset.totals, projectKey: 'private-project', projectName: 'Private project', workspacePath: '/private/readiness',
    shareOfTokens: 1, shareOfCost: 1, lastActivity: at, modelsUsed: [] }];
  dataset.sessions = [{ ...dataset.totals, sessionId: 'private-session', projectKey: 'private-project', projectName: 'Private project',
    title: 'readiness-sensitive-title', workspacePath: '/private/readiness', source: 'codex', deviceLabel: 'private-device',
    firstActivity: at, lastActivity: at, durationMinutes: 1, modelsUsed: [], modelBreakdowns: [] }];
  await saveDashboardSnapshot(dataset);
  new ImportStore().close();
  const sqlite = new DatabaseSync(process.env.INCEPT_DASHBOARD_IMPORTS_FILE!);
  sqlite.exec("CREATE TABLE readiness_fixture (value TEXT); INSERT INTO readiness_fixture VALUES ('restore-check');");
  sqlite.close();
  console.log(JSON.stringify({ event: 'fixture_seeded', documents: 3 }));
}

async function transactions() {
  const slug = `rollback-${crypto.randomUUID()}`;
  await assert.rejects(confirmDocsImportDraft(crypto.randomUUID(), async db => {
    const result = await importDocsArticleDraft({ source: source(slug, 'guest'), replace: false, db });
    assert.ok(result.documentId);
    throw new Error('Injected failure after body and publication event');
  }));
  assert.equal(await prisma.docsDocument.count({ where: { documentKey: slug } }), 0);
  const draftId = crypto.randomUUID(), sameSource = source(`idempotent-${draftId}`, 'guest');
  let writes = 0;
  const write = async (db: Parameters<Parameters<typeof confirmDocsImportDraft>[1]>[0]) => {
    writes++;
    const result = await importDocsArticleDraft({ source: sameSource, replace: false, db });
    return { documentId: result.documentId, redirectPath: '/en/docs' };
  };
  const [first, second] = await Promise.all([confirmDocsImportDraft(draftId, write), confirmDocsImportDraft(draftId, write)]);
  assert.equal(first.documentId, second.documentId); assert.equal(writes, 1);
  assert.equal(await prisma.docsPublicationEvent.count({ where: { documentId: first.documentId } }), 1);
  const role = await prisma.$queryRaw<Array<{ rolsuper: boolean }>>`SELECT rolsuper FROM pg_roles WHERE rolname=current_user`;
  assert.equal(role[0].rolsuper, false);
  await assert.rejects(prisma.$executeRaw`CREATE TABLE readiness_should_not_exist (id integer)`);
  console.log(JSON.stringify({ event: 'real_postgres_transactions_passed', rollback: true, concurrentConfirmation: true, applicationRoleRestricted: true }));
}

async function http() {
  const fixture = await state(), base = process.env.INCEPT_TEST_BASE_URL ?? 'http://app:3000';
  async function request(url: string, token?: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set('x-forwarded-host', new URL(base).host);
    headers.set('x-forwarded-proto', new URL(base).protocol.slice(0, -1));
    if (token) headers.set('cookie', `incept-access-session=${token}`);
    if (init.method && init.method !== 'GET') headers.set('origin', base);
    return fetch(base + url, { ...init, headers, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  }
  const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const reauthenticated = await request('/api/auth/owner/reauthenticate', fixture.owner,
    json({ password: fixture.ownerPassword, code: totpAt(fixture.ownerTotp, Math.floor(Date.now() / 30000)) }));
  assert.equal(reauthenticated.status, 200, await reauthenticated.clone().text());
  assert.equal((await request('/api/health/ready')).status, 200);
  assert.equal((await request('/api/dashboard/usage?refresh=1')).status, 403);
  const publicData = await (await request('/api/dashboard/usage')).text();
  assert.ok(!publicData.includes('private-') && !publicData.includes('/private/') && !publicData.includes('readiness-sensitive'));
  for (const [role, allowed] of [['guest', undefined], ['pro', fixture.pro], ['private', fixture.owner]] as const) {
    assert.equal((await request(fixture.media[role], allowed)).status, 200);
  }
  assert.equal((await request(fixture.media.pro)).status, 404);
  assert.equal((await request(fixture.media.private, fixture.pro)).status, 404);
  for (const [token, role] of [[undefined, 'guest'], [fixture.pro, 'pro'], [fixture.owner, 'owner']] as const) {
    assert.equal((await request('/en/docs/fixture-guest', token)).status, 200);
    assert.equal((await request('/en/docs/fixture-pro', token)).status, role === 'guest' ? 404 : 200);
    assert.equal((await request('/en/docs/fixture-private', token)).status, role === 'owner' ? 200 : 404);
    assert.equal((await request('/en/studio/roadmap', token)).status, role === 'owner' ? 200 : 404);
    assert.equal((await request('/api/dashboard/imports', token)).status, role === 'owner' ? 200 : 404);
    const management = await request('/api/auth/owner/state', token);
    const publicState = await management.json() as { management?: unknown };
    assert.equal(!!publicState.management, role === 'owner');
  }
  assert.equal((await request('/api/internal/roadmap/roadmaps')).status, 404);
  assert.equal((await request('/api/internal/roadmap/roadmaps', fixture.owner)).status, 200);
  const draftId = crypto.randomUUID(), draftSource = source(`http-published-${draftId}`, 'guest', fixture.media.guest);
  const previewBytes = Buffer.concat([await fs.readFile(path.join(process.env.INCEPT_DOCS_MEDIA_DIR!, path.basename(fixture.media.guest))), Buffer.from(draftId)]);
  const previewName = `${hash(previewBytes)}.png`, previewUrl = `/_docs-media/${previewName}`;
  await fs.writeFile(path.join(process.env.INCEPT_DOCS_MEDIA_DIR!, previewName), previewBytes);
  draftSource.body.sections[0].blocks = [{ id: 'image', type: 'image', src: previewUrl, alt: 'Preview image' }];
  assert.equal((await request(previewUrl, fixture.owner)).status, 200);
  assert.equal((await request(previewUrl)).status, 404);
  await fs.writeFile(path.join(process.env.INCEPT_DOCS_DRAFTS_DIR!, `${draftId}.json`), JSON.stringify({
    id: draftId, source: draftSource, issues: [], replace: false,
  }));
  const confirmUrl = `/en/docs/import-preview/${draftId}/confirm`;
  const confirmed = await request(confirmUrl, fixture.owner, { method: 'POST' });
  assert.equal(confirmed.status, 303, await confirmed.clone().text());
  assert.ok(confirmed.headers.get('location')?.startsWith(base + '/en/docs/'));
  const replay = await request(confirmUrl, fixture.owner, { method: 'POST' });
  assert.equal(replay.status, 303);
  assert.equal(replay.headers.get('x-docs-import-document-id'), confirmed.headers.get('x-docs-import-document-id'));
  assert.equal(await prisma.docsPublicationEvent.count({ where: { documentId: Number(confirmed.headers.get('x-docs-import-document-id')) } }), 1);
  assert.equal((await request(previewUrl)).status, 200);
  const created = await request('/api/internal/roadmap/entries', fixture.owner, json({ key: `entry-${crypto.randomUUID()}`, roadmapKey: 'readiness-board',
    status: 'unstarted', type: 'feature', priority: 'high', title: { en: 'Release check', zh: '发布检查' }, summary: { en: 'Check', zh: '检查' } }));
  assert.equal(created.status, 201, await created.text());
  assert.equal((await request('/api/internal/roadmap/roadmaps', fixture.owner)).status, 200);
  const login = await request('/api/auth/owner/login', undefined, json({ secret: 'retired-master-secret' }));
  assert.equal(login.status, 401, 'Legacy master-secret login must stay disabled.');
  const started = await request('/api/auth/owner/login', undefined, json({ username: 'owner', password: fixture.ownerPassword }));
  assert.equal(started.status, 200);
  const pendingCookie = (started.headers.get('set-cookie') ?? '').split(';')[0];
  const verification = (body: unknown) => request('/api/auth/owner/verify', undefined, { ...json(body), headers: { 'Content-Type': 'application/json', cookie: pendingCookie } });
  const otp = await verification({ code: totpAt(fixture.ownerTotp, Math.floor(Date.now() / 30000) + 1) });
  assert.equal(otp.status, 200);
  const challenge = await otp.json() as { stage: string; challengeId: string };
  assert.equal(challenge.stage, 'approval');
  const approval = await issueLoginApproval(challenge.challengeId);
  const approved = await verification({ code: approval.code });
  assert.equal(approved.status, 200);
  const cookie = approved.headers.get('set-cookie') ?? '';
  assert.match(cookie, /HttpOnly/i); assert.match(cookie, /Secure/i); assert.match(cookie, /SameSite=Lax/i);
  const libraryResponse = await request('/api/internal/music/libraries', fixture.owner, json({ name: 'Readiness upload' }));
  assert.ok([200, 201].includes(libraryResponse.status));
  const { library } = await libraryResponse.json() as { library: { key: string } };
  const wav = Buffer.alloc(44 + 8000 * 15 * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  wav[44] = crypto.randomInt(1, 255);
  const uploadUrl = `/api/internal/music/tracks?filename=readiness.wav&library=${encodeURIComponent(library.key)}`;
  const uploaded = await request(uploadUrl, fixture.owner, { method: 'POST', body: wav });
  assert.ok([200, 201].includes(uploaded.status), await uploaded.clone().text());
  const { track } = await uploaded.json() as { track: { audioUrl: string } };
  const range = await request(track.audioUrl, undefined, { headers: { Range: 'bytes=0-43' } });
  assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 44);
  const duplicate = await request(uploadUrl, fixture.owner, { method: 'POST', body: wav });
  assert.equal(duplicate.status, 200);
  await prisma.accessPrincipal.update({ where: { id: fixture.principalId }, data: { revokedAt: new Date() } });
  assert.equal((await request(fixture.media.pro, fixture.pro)).status, 404);
  await prisma.accessPrincipal.update({ where: { id: fixture.principalId }, data: { revokedAt: null } });
  assert.equal((await request('/api/music/tracks')).status, 200);
  console.log(JSON.stringify({ event: 'production_http_passed', guestProOwner: true, revocation: true, ownerGetWithoutOrigin: true,
    secureCookie: true, uploadAfterStart: true, range: true, duplicateUpload: true }));
}

async function restoreCheck() {
  const fixture = await state();
  const account = await prisma.ownerAccount.findUniqueOrThrow({ where: { id: 'owner' } });
  const { decryptTotp, verifyPassword } = await import('../packages/db/src/owner/security');
  assert.ok(await verifyPassword(fixture.ownerPassword, account.passwordHash));
  assert.equal(decryptTotp(account.totpCiphertext!), fixture.ownerTotp);
  assert.equal(await prisma.ownerRecoveryCode.count(), 8);
  assert.ok(await prisma.securityAudit.count() > 0);
  const ownerSession = await prisma.accessSession.findUniqueOrThrow({ where: { tokenHash: hash(fixture.owner) } });
  assert.equal(ownerSession.ownerAccountId, account.id);
  assert.equal(ownerSession.credentialVersion, account.credentialVersion);
  assert.equal(await prisma.docsDocument.count({ where: { documentKey: { in: ['fixture-guest', 'fixture-pro', 'fixture-private'] } } }), 3);
  assert.ok(await prisma.musicTrack.count() > 0);
  assert.ok(await prisma.docsImportConfirmation.count() > 0);
  for (const url of Object.values(fixture.media)) assert.ok((await fs.stat(path.join(process.env.INCEPT_DOCS_MEDIA_DIR!, path.basename(url)))).size > 0);
  const sqlite = new DatabaseSync(process.env.INCEPT_DASHBOARD_IMPORTS_FILE!, { readOnly: true });
  assert.equal(sqlite.prepare('SELECT value FROM readiness_fixture').get()?.value, 'restore-check');
  sqlite.close();
  console.log(JSON.stringify({ event: 'restored_database_and_media_verified' }));
}
async function reading() {
  const fixture = await state();
  for (const locale of ['en', 'zh'] as const) {
    const article = source('fixture-guest', 'guest', fixture.media.guest);
    article.meta.locale = locale;
    article.meta.title = locale === 'zh' ? '上线验收文章' : 'Readiness article';
    article.body.sections[0].blocks.push({ id: 'code', type: 'code', code: 'const ready = true;', language: 'typescript' });
    await importDocsArticleDraft({ source: article, replace: true });
  }
  console.log(JSON.stringify({ event: 'bilingual_reading_fixture_created' }));
}
async function main() { try {
  if (mode === 'seed') await seed();
  else if (mode === 'transactions') await transactions();
  else if (mode === 'http') await http();
  else if (mode === 'restore') await restoreCheck();
  else if (mode === 'reading') await reading();
  else throw new Error('Unknown integration mode');
} finally { await prisma.$disconnect(); } }
main().catch(error => { console.error(error); process.exitCode = 1; });
