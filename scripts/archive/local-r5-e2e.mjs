// Synthetic source-format fixtures against the real, isolated r5 HTTP service.
// No production state, DPAPI, user home, external endpoint or host network changes.
import assert from 'node:assert/strict';
import {createServer, request as httpRequest} from 'node:http';
import {mkdirSync, readFileSync, writeFileSync, existsSync, realpathSync} from 'node:fs';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {AgentState, SyncEngine, AgentHttp, captureHome} from '../../apps/sync-agent/dist/library.mjs';
import {fixtures as f} from '../../apps/sync-agent/tests/helpers.mjs';

const sources = ['codex', 'commandcode', 'claudeCode', 'geminiCli', 'antigravity', 'opencode', 'zcode'];
const target = 'http://127.0.0.1:3305';
const phase = process.argv.includes('--phase') ? process.argv[process.argv.indexOf('--phase') + 1] : 'before-restart';
assert(['before-restart', 'after-restart'].includes(phase), 'INVALID_PHASE');
assert(process.env.INCEPT_V4_ACCEPTANCE_DIR, 'ACCEPTANCE_DIRECTORY_REQUIRED');
const directory = realpathSync(resolve(process.env.INCEPT_V4_ACCEPTANCE_DIR));
const configured = JSON.parse(readFileSync(join(directory, 'config.json'), 'utf8'));
assert.equal(configured.endpoint, target, 'FIXED_LOCAL_ENDPOINT_REQUIRED');
assert(process.env.INCEPT_V4_DEVICE_ID, 'EXPECTED_TEST_DEVICE_ID_REQUIRED');
assert.equal(configured.deviceId, process.env.INCEPT_V4_DEVICE_ID, 'TEST_DEVICE_REQUIRED');
assert.equal(configured.allowLoopbackHttp, true);
assert.equal(configured.remote, false);
assert.deepEqual([...configured.allowedSources].sort(), [...sources].sort());
const token = readFileSync(join(directory, 'token.txt'), 'utf8').trim();
assert(token.length > 10, 'TEST_TOKEN_REQUIRED');
const reportPath = join(directory, 'e2e-report.json');
let report;
if (phase === 'after-restart') {
  report = JSON.parse(readFileSync(reportPath, 'utf8'));
  assert.equal(report.status, 'awaiting-isolated-service-restart');
} else {
  if (existsSync(reportPath)) {
    assert(process.argv.includes('--new-run'), 'REPORT_ALREADY_EXISTS_USE_NEW_RUN_OR_NEW_PRIVATE_DIRECTORY');
    // Preserve the complete prior report/state/home; start a new session namespace.
    const previous = readFileSync(reportPath, 'utf8');
    writeFileSync(join(directory, 'e2e-report-previous-' + Date.now() + '-' + randomUUID().slice(0, 8) + '.json'), previous, {flag: 'wx', mode: 0o600});
  }
  report = {version: 1, run: Date.now() + '-' + randomUUID().slice(0, 8), fixtureKind: 'synthetic-source-format-fixtures',
    baselineKind: configured.baselineKind ?? 'accepted v4 independent database copy; original359 reconciliation reused',
    endpoint: target, historical359: 'previously passed; not rechecked', startedAt: new Date().toISOString(), steps: [], status: 'running'};
}
const runDirectory = resolve(directory, 'synthetic-' + report.run);
const within = relative(directory, runDirectory);
assert(within && !within.startsWith('..') && !isAbsolute(within), 'PRIVATE_PATH_REQUIRED');
if (phase === 'before-restart') mkdirSync(runDirectory, {recursive: false, mode: 0o700});
else assert.equal(realpathSync(runDirectory), runDirectory);
const config = {...configured, version: 1, home: join(runDirectory, 'fixture-home')};
const stateDirectory = join(runDirectory, 'state');
const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2), {mode: 0o600});
function record(name, details = {}) {
  report.steps.push({name, passed: true, at: new Date().toISOString(), ...details});
  save();
  console.log(JSON.stringify({step: name, passed: true}));
}
function fixture(source, count) {
  f.writePhase0Source(config.home, source, {count, session: 'local-r5-' + report.run + '-' + source,
    id: 'local-r5-' + report.run + '-' + source, at: f.PHASE0_AT});
}

// Bound to loopback and forwarding only to the fixed local acceptance App.
// Faults destroy a socket immediately; they never change host networking.
async function proxy() {
  const control = {mode: 'normal', hits: 0, batch: null, offset: null};
  const server = createServer((req, res) => {
    if (!req.url?.startsWith('/api/dashboard/sync/')) {res.writeHead(404).end(); return;}
    if (control.mode === 'offline') {control.hits++; req.socket.destroy(); return;}
    const page = req.url.match(/\/batches\/([^/]+)\/pages\/(\d+)$/);
    if (control.mode === 'page' && page && Number(page[2]) >= 500) {
      control.hits++; control.batch = page[1]; control.offset = Number(page[2]); req.socket.destroy(); return;
    }
    const upstream = httpRequest({hostname: '127.0.0.1', port: 3305, path: req.url, method: req.method,
      headers: {...req.headers, host: '127.0.0.1:3305', connection: 'close'}}, incoming => {
      const chunks = [];
      incoming.on('data', chunk => chunks.push(chunk));
      incoming.on('end', () => {
        const body = Buffer.concat(chunks);
        if (control.mode === 'commit' && req.url.endsWith('/commit') && incoming.statusCode === 200) {
          const reply = JSON.parse(body.toString('utf8'));
          if (reply.receipt?.status === 'committed') {
            control.hits++; control.batch = req.url.split('/').at(-2);
            req.socket.destroy(); return;
          }
        }
        res.writeHead(incoming.statusCode, incoming.headers); res.end(body);
      });
      incoming.on('error', () => res.destroy());
    });
    upstream.on('error', () => res.destroy());
    req.pipe(upstream);
  });
  await new Promise((yes, no) => {server.once('error', no); server.listen(0, '127.0.0.1', yes);});
  return {control, endpoint: 'http://127.0.0.1:' + server.address().port,
    close: () => new Promise(yes => {server.close(yes); server.closeAllConnections();})};
}

let state;
let gateway;
try {
  save();
  const direct = new AgentHttp(target, token, {allowLoopbackHttp: true});
  const identity = await direct.request('/agent');
  assert.equal(identity.deviceId, config.deviceId, 'SERVICE_DEVICE_MISMATCH');
  assert(sources.every(source => identity.allowedSources?.includes(source)), 'SOURCE_AUTHORIZATION_MISMATCH');
  record('real-http-device-identity-and-seven-source-authorization');
  gateway = await proxy();
  let http = new AgentHttp(gateway.endpoint, token, {allowLoopbackHttp: true});
  const collect = (home, allowed, parents) => captureHome(home, join(runDirectory, 'capture-' + randomUUID()), allowed, parents);
  const engine = () => new SyncEngine(state, {...config, endpoint: gateway.endpoint}, http, collect);
  const reopen = () => {state?.close(); state = new AgentState(stateDirectory);};
  const pendingCount = () => Number(state.db.prepare('SELECT COUNT(*) n FROM outbox').get().n);
  const receipts = () => state.db.prepare('SELECT batch,json FROM receipts ORDER BY batch').all();
  const pendingRows = () => state.db.prepare('SELECT batch FROM outbox ORDER BY serial').all();
  async function flush() {
    // Retry at the durable next_retry timestamp; never rewrite the retry ledger.
    for (let attempt = 0; attempt < 8 && pendingCount(); attempt++) {
      const row = state.db.prepare("SELECT MIN(next_retry) at FROM outbox WHERE state='pending'").get();
      assert(row.at !== null, 'UNEXPECTED_REVIEW_OR_HELD_OUTBOX');
      await new Promise(yes => setTimeout(yes, Math.max(0, Number(row.at) - Date.now()) + 30));
      await engine().flush();
    }
    assert.equal(pendingCount(), 0, 'OUTBOX_NOT_DRAINED');
    assert.equal(state.reviewCount(), 0);
  }
  async function remoteReceipt(batch) {
    const value = await direct.request('/batches/' + batch);
    assert.equal(value.receipt?.status, 'committed', 'REMOTE_RECEIPT_NOT_COMMITTED');
    return value.receipt;
  }
  async function checkReceipts() {
    const rows = receipts();
    assert.equal(new Set(rows.map(row => row.batch)).size, rows.length);
    const revisions = [];
    for (const row of rows) {
      const receipt = await remoteReceipt(row.batch);
      assert.deepEqual(receipt, JSON.parse(row.json), 'REMOTE_LOCAL_RECEIPT_MISMATCH');
      assert(Number.isSafeInteger(receipt.dataRevision)); revisions.push(receipt.dataRevision);
    }
    assert.equal(new Set(revisions).size, rows.length, 'DUPLICATE_COMMIT_REVISION');
    return {receiptCount: rows.length, latestRevision: Math.max(...revisions)};
  }
  reopen();
  if (phase === 'before-restart') {
    assert.equal(pendingCount(), 0);
    f.writePhase0Pricing(config.home);
    for (const source of sources) fixture(source, 1);
    const baseline = await engine().run();
    assert.equal(baseline.sent, 7); assert.equal(baseline.blockingIssues, 0); assert.equal(baseline.confirmedScopes, 7);
    assert.equal(pendingCount(), 0);
    record('synthetic-seven-source-baseline-real-http', {sent: baseline.sent});
    for (const source of sources) fixture(source, 2);
    const append = await engine().run();
    assert.equal(append.sent, 7); assert.equal(append.blockingIssues, 0); assert.equal(pendingCount(), 0);
    record('synthetic-seven-source-append-real-http', {sent: append.sent});

    gateway.control.mode = 'offline';
    for (const source of sources) fixture(source, 3);
    const offline = await engine().run();
    assert.equal(offline.sent, 0); assert.equal(pendingCount(), 7); assert(gateway.control.hits > 0);
    const durable = pendingRows(); reopen(); assert.deepEqual(pendingRows(), durable);
    gateway.control.mode = 'normal'; await flush();
    record('loopback-offline-durable-queue-and-agent-state-reopen', {queued: durable.length});

    fixture('claudeCode', 504);
    gateway.control.mode = 'page'; gateway.control.hits = 0;
    await engine().run();
    assert(gateway.control.hits > 0, 'PAGE_FAULT_NOT_TRIGGERED'); assert.equal(pendingCount(), 1);
    const staged = await direct.request('/batches/' + gateway.control.batch);
    assert.equal(staged.nextOffset, 500, 'FIRST_PAGE_NOT_DURABLE'); assert(!staged.receipt);
    const pageBatch = gateway.control.batch;
    reopen(); gateway.control.mode = 'normal'; await flush();
    await remoteReceipt(pageBatch);
    record('upload-second-page-disconnect-and-state-reopen-resume', {durableOffset: staged.nextOffset});

    fixture('claudeCode', 505);
    gateway.control.mode = 'commit'; gateway.control.hits = 0;
    await engine().run();
    assert.equal(gateway.control.hits, 1, 'COMMIT_RESPONSE_LOSS_NOT_TRIGGERED'); assert.equal(pendingCount(), 1);
    const lostReceipt = await remoteReceipt(gateway.control.batch);
    const countBefore = receipts().length;
    reopen(); gateway.control.mode = 'normal'; await flush();
    assert.equal(receipts().length, countBefore + 1);
    assert.deepEqual(await remoteReceipt(gateway.control.batch), lostReceipt);
    record('committed-response-lost-agent-state-reopen-idempotent-receipt', {dataRevision: lostReceipt.dataRevision});

    const stable = await engine().run();
    assert.equal(stable.sent, 0); assert.equal(stable.reviewNew, 0); assert.equal(pendingCount(), 0);
    report.beforeRestart = await checkReceipts();
    assert.equal(report.beforeRestart.receiptCount, 23);
    record('completed-no-change-and-all-synthetic-receipts-match', report.beforeRestart);
    report.status = 'awaiting-isolated-service-restart';
    report.restartInstruction = 'Restart only isolated local r5 App and PostgreSQL containers externally, then run --phase after-restart. Formal Agent stays stopped.';
  } else {
    const checked = await checkReceipts();
    assert.deepEqual(checked, report.beforeRestart, 'SERVICE_RESTART_CHANGED_RECEIPTS');
    const stable = await engine().run();
    assert.equal(stable.sent, 0); assert.equal(stable.reviewNew, 0); assert.equal(stable.blockingIssues, 0); assert.equal(pendingCount(), 0);
    record('isolated-app-postgresql-restart-persistence-and-no-change', checked);
    report.status = 'passed'; report.completedAt = new Date().toISOString();
  }
  save();
  console.log(JSON.stringify({status: report.status, fixtureKind: report.fixtureKind, report: reportPath}));
} catch (error) {
  report.status = 'failed';
  // Codes only: do not print raw requests, source rows, token, stack or headers.
  report.failure = {phase, code: typeof error?.code === 'string' ? error.code : error?.name || 'E2E_FAILED',
    assertion: error?.name === 'AssertionError' ? String(error.message).split('\n')[0].slice(0, 150) : 'E2E_OPERATION_FAILED',
    at: new Date().toISOString()};
  save(); console.error(JSON.stringify({status: 'failed', ...report.failure})); process.exitCode = 1;
} finally {
  state?.close();
  await gateway?.close();
}
