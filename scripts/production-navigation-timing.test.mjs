import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const probe = String.raw`
  const assert = require('node:assert/strict');
  const { createServer } = require('node:http');
  const { setTimeout: delay } = require('node:timers/promises');
  const trace = globalThis[Symbol.for('incept.navigationTiming')];
  const server = createServer(async (request, response) => {
    await trace(request.url.includes('/series/') ? 'series' : 'article', () => delay(5));
    response.setHeader('Content-Type', 'text/x-component');
    response.write('payload');
    response.end('end');
  });
  (async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = 'http://127.0.0.1:' + server.address().port;
    try {
      const ids = ['43173d9a-8b32-437a-8f8d-15f62c2c37c6', '41fd6363-98c4-4a31-aecb-93a891b9b379'];
      const responses = await Promise.all(['/en/docs/private-slug?_rsc=private-query', '/zh/docs/series/group/item'].map((path, i) =>
        fetch(url + path, { headers: { rsc: '1', 'x-request-id': ids[i] } })));
      for (const [i, response] of responses.entries()) {
        assert.equal(response.headers.get('x-request-id'), ids[i]);
        assert.equal(await response.text(), 'payloadend');
      }
      const ignored = await fetch(url + '/en/settings/access/private-credential', { headers: { rsc: '1' } });
      assert.equal(ignored.headers.get('x-request-id'), null);
      await ignored.text();
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  })().catch(error => { console.error(error); process.exitCode = 1; });
`;

test('navigation timing correlates concurrent requests without logging paths or secrets', () => {
  const preload = fileURLToPath(new URL('./navigation-timing.cjs', import.meta.url));
  const result = spawnSync(process.execPath, ['--require', preload, '-e', probe], {
    env: { ...process.env, INCEPT_NAV_TRACE_SAMPLE_RATE: '1' },
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /private-slug|private-query|private-credential/);
  const samples = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(samples.length, 2);
  for (const [route, phase] of [['docs-article', 'article'], ['docs-series', 'series']]) {
    const sample = samples.find(item => item.route === route);
    assert.ok(sample);
    assert.equal(sample.event, 'navigation_timing');
    assert.equal(sample.status, 200);
    assert.equal(sample.finished, true);
    assert.equal(sample.bytes, 10);
    assert.deepEqual(Object.keys(sample.phases), [phase]);
    assert.equal(sample.phases[phase].count, 1);
    assert.ok(sample.totalMs >= sample.lastWriteMs && sample.lastWriteMs >= sample.firstWriteMs);
  }
});
