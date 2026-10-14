import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';

// Only the synthetic loopback fixture may provide credentials and its private CA.
assert.equal(process.env.INCEPT_TEST_DEPLOYMENT, '1');
const root = await fs.realpath(process.env.INCEPT_VALIDATION_ROOT);
const context = JSON.parse(await fs.readFile(path.join(root, 'context.json'), 'utf8'));
assert.match(context.Project, /^incept-(final|caddy-recovery)-[a-z0-9-]+$/);
const ca = await fs.readFile(path.join(context.CaddyState, 'data/caddy/pki/authorities/local/root.crt'));
const fixture = JSON.parse(await fs.readFile(path.join(context.Shared, 'fixture-state.json'), 'utf8'));
const base = `https://incept.test:${context.TlsPort}`;
async function request(route, { tls = true, owner = false, method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = (tls ? https : http).request({ hostname: '127.0.0.1', servername: 'incept.test', ca,
      port: tls ? context.TlsPort : context.HttpPort, path: route, method,
      headers: { host: tls ? `incept.test:${context.TlsPort}` : 'incept.test', ...(owner ? { cookie: `incept-access-session=${fixture.owner}` } : {}),
        ...(method !== 'GET' ? { origin: base } : {}), ...(body ? { 'content-length': Buffer.byteLength(body) } : {}), ...headers } }, response => {
      const chunks = []; response.on('data', part => chunks.push(part));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject); req.setTimeout(30_000, () => req.destroy(new Error('Caddy probe timed out'))); req.end(body);
  });
}
const ready = await request('/api/health/ready');
assert.equal(ready.status, 200);
assert.equal(ready.headers['referrer-policy'], 'same-origin');
assert.match(ready.headers['strict-transport-security'], /max-age/);
for (const [locale, title] of [['en', 'Readiness article'], ['zh', '上线验收文章']]) {
  const article = await request(`/${locale}/docs/fixture-guest`);
  assert.equal(article.status, 200); assert.ok(article.body.includes(title) && article.body.includes('<pre'));
}
for (const prefix of ['', '/en', '/zh']) {
  const route = `${prefix}/settings/access/caddy-redaction-marker?private=caddy-query-marker`;
  assert.equal((await request(route)).headers['referrer-policy'], 'no-referrer');
  const redirect = await request(route, { tls: false });
  assert.equal(redirect.status, 308); assert.equal(redirect.headers['referrer-policy'], 'no-referrer');
}
assert.equal((await request('/api/internal/roadmap/roadmaps', { owner: true })).status, 200);
assert.equal((await request(fixture.media.private)).status, 404);
assert.equal((await request(fixture.media.private, { owner: true })).status, 200);
assert.equal((await request('/api/dashboard/usage?refresh=1')).status, 403);
const spoof = await request('/api/auth/owner/login', { method: 'POST', headers: { origin: 'https://evil.example',
  'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'http', 'x-forwarded-for': '127.0.0.1', 'content-type': 'application/json' }, body: '{}' });
assert.equal(spoof.status, 403);
const tooLarge = await request('/api/auth/owner/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: 'x'.repeat(5000) }) });
assert.equal(tooLarge.status, 413);
const preview = await request('/api/dashboard/imports/preview', { owner: true, method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
assert.equal(preview.status, 400, 'Public HTTPS origin must reach validation rather than fail CSRF');
const created = await request('/api/internal/music/libraries', { owner: true, method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: `Caddy concurrency ${Date.now()}` }) });
assert.equal(created.status, 201);
const { library } = JSON.parse(created.body);
const wav = Buffer.alloc(44 + 16000);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
let stream;
const first = new Promise((resolve, reject) => {
  stream = https.request({ hostname: '127.0.0.1', port: context.TlsPort, servername: 'incept.test', ca, method: 'POST',
    path: `/api/internal/music/tracks?filename=concurrent.wav&library=${encodeURIComponent(library.key)}`, headers: {
      host: `incept.test:${context.TlsPort}`, origin: base, cookie: `incept-access-session=${fixture.owner}`, 'content-length': wav.length,
    } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
  stream.on('error', reject); stream.write(wav.subarray(0, 44));
});
let busy;
try {
  await new Promise(resolve => setTimeout(resolve, 500));
  busy = await request('/api/dashboard/imports/preview', { owner: true, method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
} finally { stream.end(wav.subarray(44)); }
assert.ok([200, 201].includes(await first));
assert.equal(busy.status, 429, 'Concurrent import must not allocate while a music body is in progress');
assert.equal((await request('/api/dashboard/imports/preview', { owner: true, method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 400);
console.log(JSON.stringify({ event: 'caddy_https_security_passed', trustedTLS: true, bilingualSSR: true, invitationPolicy: true,
  mediaAuthorization: true, spoofRejected: true, publicImportOrigin: true, bodyLimit: true, crossRouteUploadAdmission: true }));
