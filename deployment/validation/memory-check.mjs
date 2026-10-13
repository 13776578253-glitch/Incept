import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import v8 from 'node:v8';
import { Worker } from 'node:worker_threads';

// This runner is restricted to the disposable readiness database and its synthetic credentials.
assert.equal(process.env.INCEPT_TEST_DEPLOYMENT, '1');
assert.equal(new URL(process.env.DATABASE_URL).pathname, '/incept_readiness');
const mode = process.argv[2];
const MiB = 1024 * 1024;
if (mode === 'heap') {
  const mainHeapMiB = v8.getHeapStatistics().heap_size_limit / MiB;
  const workerHeapMiB = await new Promise((resolve, reject) => {
    const worker = new Worker("require('node:worker_threads').parentPort.postMessage(require('node:v8').getHeapStatistics().heap_size_limit)", { eval: true, execArgv: [] });
    worker.once('message', bytes => resolve(bytes / MiB));
    worker.once('error', reject);
  });
  assert.equal(mainHeapMiB, 280);
  assert.equal(workerHeapMiB, 280);
  const memoryMax = Number(await fs.readFile('/sys/fs/cgroup/memory.max', 'utf8'));
  const swapMax = Number(await fs.readFile('/sys/fs/cgroup/memory.swap.max', 'utf8'));
  assert.equal(memoryMax, 768 * MiB);
  assert.equal(swapMax, 256 * MiB);
  for (const directory of ['/tmp', '/app/apps/web/.next/cache']) {
    const stat = await fs.statfs(directory);
    assert.equal(stat.bsize * stat.blocks, 64 * MiB);
  }
  console.log(JSON.stringify({ event: 'heap_and_cgroup_passed', mainHeapMiB, workerHeapMiB, memoryMax, swapMax, tmpfsMiB: 64 }));
} else if (mode === 'http') {
  const fixture = JSON.parse(await fs.readFile('/data/fixture-state.json', 'utf8'));
  const base = process.env.INCEPT_TEST_BASE_URL ?? 'http://app:3000';
  async function request(route, options = {}, owner = false) {
    const headers = new Headers(options.headers);
    if (owner) headers.set('cookie', `incept-access-session=${fixture.owner}`);
    if (options.method) headers.set('origin', base);
    return fetch(base + route, { ...options, headers, signal: AbortSignal.timeout(90_000) });
  }
  for (const [locale, title] of [['en', 'Readiness article'], ['zh', '上线验收文章']]) {
    const response = await request(`/${locale}/docs/fixture-guest`);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(body.includes(title) && body.includes('ready') && body.includes('<pre'));
  }
  const refreshStarted = Date.now();
  const refresh = await request('/api/dashboard/usage?refresh=1', {}, true);
  assert.equal(refresh.status, 200);
  const usage = await refresh.json();
  assert.ok(Date.parse(usage.checkedAt) >= refreshStarted - 1000);
  const libraryResponse = await request('/api/internal/music/libraries', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Memory boundary fixture' }),
  }, true);
  assert.equal(libraryResponse.status, 201);
  const { library } = await libraryResponse.json();
  // Exercise the supported 128MiB upload boundary from a separate client container.
  const wav = Buffer.alloc(128 * MiB);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(88200, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  wav[44] = 1;
  const upload = await request(`/api/internal/music/tracks?filename=memory-boundary.wav&library=${encodeURIComponent(library.key)}`, { method: 'POST', body: wav }, true);
  assert.ok([200, 201].includes(upload.status), `Upload status ${upload.status}: ${await upload.clone().text()}`);
  const { track } = await upload.json();
  const range = await request(track.audioUrl, { headers: { range: 'bytes=0-43' } });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 44);
  const responses = await Promise.all(Array.from({ length: 10 }, (_, index) => request(index % 2 ? '/en/docs/fixture-guest' : '/api/health/ready')));
  for (const response of responses) { assert.equal(response.status, 200); await response.arrayBuffer(); }
  console.log(JSON.stringify({ event: 'small_memory_http_passed', bilingualSSR: true, dashboardRefresh: true, uploadMiB: 128, range: true, concurrentReads: 10 }));
} else {
  throw new Error('Usage: memory-check.mjs heap|http');
}
