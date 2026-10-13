import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';

// Loopback-only synthetic acceptance; this runner cannot target a public deployment.
assert.equal(process.env.INCEPT_TEST_DEPLOYMENT, '1');
const root = await fs.realpath(process.env.INCEPT_VALIDATION_ROOT);
const context = JSON.parse(await fs.readFile(path.join(root, 'context.json'), 'utf8'));
assert.match(context.Project, /^incept-ops-[a-z0-9-]+$/);
const ca = await fs.readFile(path.join(root, 'issued-root-ca.pem'));
const owner = JSON.parse(await fs.readFile(path.join(root, 'browser-owner-api.json'), 'utf8')).cookies[0].value;
const fixture = JSON.parse(await fs.readFile(path.join(root, 'shared/fixture-state.json'), 'utf8'));
async function request(url, { tls = true, method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = (tls ? https : http).request({ hostname: '127.0.0.1', servername: 'incept.test',
      port: tls ? 33643 : 33280, path: url, method, ...(tls ? { ca } : {}),
      headers: { Host: tls ? 'incept.test:33643' : 'incept.test', ...headers } }, response => {
      const chunks = []; response.on('data', value => { chunks.push(value); });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject); req.setTimeout(10_000, () => req.destroy(new Error('Probe timed out')));
    req.end(body);
  });
}
const ready = await request('/api/health/ready');
assert.equal(ready.status, 200);
assert.equal(ready.headers['referrer-policy'], 'same-origin');
assert.match(ready.headers['strict-transport-security'], /max-age/);
for (const [locale, title] of [['en', 'Readiness article'], ['zh', '上线验收文章']]) {
  const article = await request(`/${locale}/docs/fixture-guest`);
  assert.equal(article.status, 200, 'A healthy probe must also pass the real highlighted document route');
  assert.ok(article.body.includes(title) && article.body.includes('<pre'), 'Document SSR was incomplete');
}
for (const prefix of ['', '/en', '/zh']) {
  const url = prefix + '/settings/access/readiness-redaction-marker';
  assert.equal((await request(url)).headers['referrer-policy'], 'no-referrer');
  const redirect = await request(url, { tls: false });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers['referrer-policy'], 'no-referrer');
}
assert.equal((await request('/api/internal/roadmap/roadmaps', { headers: { Cookie: `incept-access-session=${owner}` } })).status, 200);
for (const token of [undefined, fixture.pro]) {
  const dashboard = await request('/en/dashboard', { headers: token ? { Cookie: `incept-access-session=${token}` } : {} });
  assert.equal(dashboard.status, 200);
  for (const marker of ['private-project', '/private/readiness', 'private-session', 'readiness-sensitive']) {
    assert.ok(!dashboard.body.includes(marker), 'Public SSR exposed a raw dashboard field');
  }
}
assert.equal((await request('/api/auth/owner/login', { method: 'POST', headers: {
  Origin: 'https://foreign.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
assert.equal((await request('/api/auth/owner/login', { method: 'POST', headers: {
  Origin: 'https://incept.test:33643', 'Content-Type': 'application/json' }, body: 'x'.repeat(5000) })).status, 413);
console.log(JSON.stringify({ event: 'final_https_proxy_passed', verifiedCA: true,
  ordinaryReferrerPolicy: 'same-origin', invitationReferrerPolicy: 'no-referrer',
  ownerReadWithoutOrigin: true, bilingualDocumentSSR: true, publicDashboardSSRRedacted: true, foreignOriginRejected: true, bodyLimit: 413 }));
