const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const [candidateArg, artifactsArg, rounds = '3'] = process.argv.slice(2);
assert(candidateArg && artifactsArg, 'Pass isolated Next build directory and output directory');
const candidate = path.resolve(candidateArg);
const artifacts = path.resolve(artifactsArg);
const work = path.dirname(candidate);
assert(candidate.includes(path.sep + '.scratch' + path.sep), 'Use an isolated source and build copy');
const app = path.join(candidate, 'apps/web');
assert(fs.existsSync(path.join(app, '.next/BUILD_ID')), 'Run next build in the copy first');
fs.mkdirSync(artifacts, { recursive: true });
const dev = 'http://localhost:3000';
const ownerCold = process.env.DASHBOARD_RANGE_PRODUCTION_MODE?.startsWith('owner-') ?? false;
const ownerSequence = process.env.DASHBOARD_RANGE_PRODUCTION_MODE === 'owner-sequence';
const mode = (ownerSequence ? 'owner-sequence' : ownerCold ? 'owner-cold-all' : 'guest') +
  (process.env.DASHBOARD_RANGE_LOCALE === 'zh' ? '-zh' : '');
const port = ownerCold ? 32148 : 32147;
const prod = 'http://127.0.0.1:' + port;
const usage = '/api/dashboard/usage?range=';
const home = ownerCold ? require('node:os').homedir() : path.join(work, 'empty-home');
const imports = path.join(work, 'fixture-imports.db');
const overrides = path.join(work, 'fixture-overrides.json');
const snapshotFile = path.join(work, 'fixture-' + mode + '-snapshot.json');
const env = {
  ...process.env, NEXT_TELEMETRY_DISABLED: '1', DASHBOARD_AUDIT_PROJECT_ROOT: process.cwd(),
  DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:59999/fixture?connect_timeout=1',
  INCEPT_DASHBOARD_HOME: home, INCEPT_DASHBOARD_IMPORTS_FILE: imports,
  INCEPT_DASHBOARD_CACHE_FILE: snapshotFile, INCEPT_DASHBOARD_OVERRIDES_FILE: overrides,
  INCEPT_SYNC_ENABLED: '0', INCEPT_SYNC_REMOTE_ENABLED: '0', INCEPT_SYNC_TRUSTED_MODE: '0',
  INCEPT_SYNC_READ_MODE: 'v1', INCEPT_BILLING_READ_MODE: '', INCEPT_BILLING_UI_MODE: '',
  DASHBOARD_AUDIT_FIXTURE_ROLE: ownerCold ? 'owner' : '',
  DASHBOARD_RANGE_EXPECT_RESPONSE: ownerCold ? '1' : '',
  DASHBOARD_RANGE_LIVE_PLAN: ownerSequence ? '7d,30d,all,30d,7d' : 'all',
};
if (ownerCold) {
  const worker = path.join(work, 'owner-all/worker.mjs');
  if (fs.existsSync(worker)) env.INCEPT_DASHBOARD_WORKER_FILE = worker;
}
delete env.INCEPT_COMMANDCODE_CATALOG_FILE;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const snapshots = {};
  for (const range of ['7d', '30d', 'all']) {
    const response = await fetch(dev + usage + range);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Incept-Dashboard-Role'), 'guest');
    const data = await response.json();
    assert.equal(data.range, range);
    assert.equal(data.projects.length + data.sessions.length, 0);
    snapshots[range] = data;
  }
  const scope = createHash('sha256').update(JSON.stringify(['commandcode-peak-v1', home, imports, overrides, undefined])).digest('hex');
  fs.writeFileSync(snapshotFile, JSON.stringify({ version: 1, scope, snapshots }));
  const log = fs.openSync(path.join(artifacts, 'production-' + mode + '-server.log'), 'w');
  const server = spawn(process.execPath, [path.join(app, 'node_modules/next/dist/bin/next'), 'start',
    '--hostname', '127.0.0.1', '--port', String(port)], { cwd: app, env, stdio: ['ignore', log, log], windowsHide: true });
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const response = await fetch(prod + (ownerCold ? '/icon.svg' : usage + '30d'), { signal: AbortSignal.timeout(1000) });
        if (response.ok) {
          if (!ownerCold) {
            assert.equal(response.headers.get('X-Incept-Dashboard-Role'), 'guest');
            const data = await response.json();
            assert.equal(data.totals.totalTokens, snapshots['30d'].totals.totalTokens);
          }
          break;
        }
      } catch (error) {
        if (error.code === 'ERR_ASSERTION') throw error;
      }
      if (attempt === 59 || server.exitCode !== null) throw Error('Isolated Next production server unavailable');
      await pause(300);
    }
    for (const range of ownerCold ? [] : ['7d', '30d', 'all']) {
      const response = await fetch(prod + usage + range);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), snapshots[range]);
    }
    const probe = spawn(process.execPath, [path.join(__dirname, 'dashboard-ranges.cjs'),
      prod, path.join(artifacts, 'production-' + mode + '.json'),
      rounds], { env, stdio: 'inherit', windowsHide: true });
    const status = await new Promise((resolve, reject) => { probe.once('exit', resolve); probe.once('error', reject); });
    if (status !== 0) throw Error('Browser probe did not pass all cases');
  } finally {
    if (server.exitCode === null) {
      const stopped = new Promise(resolve => server.once('exit', resolve));
      server.kill();
      await stopped;
    }
    fs.closeSync(log);
    if (ownerCold) fs.rmSync(snapshotFile, { force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
