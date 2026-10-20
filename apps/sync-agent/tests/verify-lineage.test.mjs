import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdtempSync, writeFileSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {verifyLineage, V4_BASELINE} from '../dist/library.mjs';

// Match the production canonical identity hash without rebuilding fixture bundles.
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const identity = {deviceId: 'synthetic-device', endpoint: 'http://127.0.0.1:1'};
const imageEvidence = JSON.parse(readFileSync(new URL('./fixtures/r5-image-evidence.json', import.meta.url), 'utf8'));
function fixture(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE lineage(scope TEXT PRIMARY KEY,parent_json TEXT,receipt_json TEXT); CREATE TABLE receipts(batch TEXT PRIMARY KEY,json TEXT); CREATE TABLE heads(scope TEXT); CREATE TABLE outbox(batch TEXT);');
  const snapshot = {version: 1, service: {...identity, databaseFile: V4_BASELINE.databaseFile, imageIdentity: structuredClone(imageEvidence)},
    dataRevision: 359, tokenTotal: V4_BASELINE.tokenTotal, scopes: [], receipts: []};
  for (let i = 0; i < 359; i++) {
    const scope = {deviceId: identity.deviceId, source: 'codex', sessionId: 'synthetic-' + i, originId: 'origin-' + i};
    const manifest = {scope, manifestHash: hash(['manifest', i]), generationId: hash(['generation', i])};
    const header = {batchId: 'batch-' + i, manifest};
    const receipt = {batchId: header.batchId, status: 'committed', manifestHash: manifest.manifestHash,
      generationId: manifest.generationId, payloadHash: hash(header), dataRevision: i + 1};
    snapshot.scopes.push({...manifest, tokenTotal: i ? 1 : V4_BASELINE.tokenTotal - 358});
    snapshot.receipts.push(receipt);
    db.prepare('INSERT INTO lineage VALUES(?,?,?)').run(hash([scope.source, scope.sessionId]), JSON.stringify({header}), JSON.stringify(receipt));
    db.prepare('INSERT INTO receipts VALUES(?,?)').run(header.batchId, JSON.stringify(receipt));
  }
  const calls = [];
  const request = async (path, method, body) => {
    calls.push({path, method, body});
    if (path === '/agent') return {...identity, allowedSources: ['codex']};
    if (path === '/scopes/resolve') {
      const row = snapshot.scopes.find(row => row.scope.source === body.source && row.scope.sessionId === body.sessionId);
      return {scope: row.scope, headManifest: row.manifestHash};
    }
    if (path.startsWith('/batches/')) return {receipt: snapshot.receipts.find(receipt => receipt.batchId === path.slice('/batches/'.length)), dataRevision: snapshot.dataRevision};
    throw Error('Unexpected request: ' + path);
  };
  return {db, snapshot, request, calls};
}
async function rejection(mutate, expected) {
  const f = fixture();
  try {
    mutate(f);
    const result = await verifyLineage(f.db, f.snapshot, identity);
    assert.equal(result.passed, false);
    assert.ok([...result.errors, ...result.mismatches.map(row => row.code)].includes(expected), JSON.stringify(result));
  } finally { f.db.close(); }
}

test('359 scopes and receipts reconcile with fixed Token total in snapshot-only mode', async () => {
  const f = fixture();
  try {
    const result = await verifyLineage(f.db, f.snapshot, identity);
    assert.equal(result.passed, true);
    assert.equal(result.mode, 'snapshot-only');
    assert.equal(result.onlineVerified, false);
    assert.equal(result.checked, 359);
    assert.equal(result.ok, 359);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.mismatches, []);
  } finally { f.db.close(); }
});
test('online mode verifies device then all 359 scope and receipt pairs', async () => {
  const f = fixture();
  try {
    const result = await verifyLineage(f.db, f.snapshot, identity, f.request);
    assert.equal(result.passed, true);
    assert.equal(result.onlineVerified, true);
    assert.equal(result.ok, 359);
    assert.equal(f.calls.length, 719);
    assert.equal(f.calls[0].path, '/agent');
    assert.equal(f.calls.filter(call => call.path === '/scopes/resolve' && call.method === 'POST').length, 359);
  } finally { f.db.close(); }
});
for (const [name, mutate, error] of [
  ['empty local lineage', f => f.db.exec('DELETE FROM lineage; DELETE FROM receipts'), 'LOCAL_SCOPE_COUNT_MISMATCH'],
  ['empty remote inventory', f => { f.snapshot.scopes = []; f.snapshot.receipts = []; }, 'REMOTE_SCOPE_COUNT_MISMATCH'],
  ['remote scope count', f => f.snapshot.scopes.pop(), 'REMOTE_SCOPE_COUNT_MISMATCH'],
  ['remote receipt count', f => f.snapshot.receipts.pop(), 'REMOTE_RECEIPT_COUNT_MISMATCH'],
  ['local receipt count', f => f.db.exec("DELETE FROM receipts WHERE batch='batch-0'"), 'LOCAL_RECEIPT_COUNT_MISMATCH'],
  ['Token root total', f => f.snapshot.tokenTotal++, 'REMOTE_TOKEN_TOTAL_MISMATCH'],
  ['Token scope sum', f => f.snapshot.scopes[0].tokenTotal++, 'SCOPE_TOKEN_TOTAL_MISMATCH'],
  ['duplicate scope', f => { f.snapshot.scopes[1] = {...f.snapshot.scopes[0], tokenTotal: 1}; }, 'DUPLICATE_REMOTE_SCOPE'],
  ['duplicate receipt', f => { f.snapshot.receipts[1] = f.snapshot.receipts[0]; }, 'DUPLICATE_REMOTE_RECEIPT'],
  ['device identity', f => { f.snapshot.service.deviceId = 'other'; }, 'SERVICE_IDENTITY_MISMATCH'],
  ['endpoint identity', f => { f.snapshot.service.endpoint = 'https://wrong.invalid'; }, 'SERVICE_IDENTITY_MISMATCH'],
  ['r5 image identity', f => { f.snapshot.service.imageIdentity.observed.id = 'old-r3'; }, 'RUNTIME_IMAGE_ID_MISMATCH'],
  ['database identity', f => { f.snapshot.service.databaseFile = '/data/sync/v2.db'; }, 'SERVICE_IDENTITY_MISMATCH'],
  ['scope device identity', f => { f.snapshot.scopes[0].scope.deviceId = 'other'; }, 'REMOTE_DEVICE_MISMATCH'],
  ['malformed remote snapshot', f => { f.snapshot.version = 2; }, 'INVALID_REMOTE_SNAPSHOT'],
  ['corrupt local receipt JSON', f => f.db.exec("UPDATE lineage SET receipt_json='broken' WHERE scope=(SELECT scope FROM lineage LIMIT 1)"), 'INVALID_LOCAL_LINEAGE'],
  ['corrupt local stored receipt', f => f.db.exec("UPDATE receipts SET json='{}' WHERE batch='batch-0'"), 'LINEAGE_RECEIPT_MISMATCH'],
  ['remote manifest mismatch', f => { f.snapshot.scopes[0].manifestHash = hash('wrong'); }, 'LINEAGE_RECEIPT_MISMATCH'],
  ['remote receipt payload mismatch', f => { f.snapshot.receipts[0].payloadHash = hash('wrong'); }, 'LINEAGE_RECEIPT_MISMATCH'],
  ['unconfirmed head', f => f.db.exec("INSERT INTO heads VALUES('pending')"), 'LOCAL_UNCONFIRMED_HEADS'],
  ['pending outbox', f => f.db.exec("INSERT INTO outbox VALUES('pending')"), 'LOCAL_OUTBOX_NOT_EMPTY'],
]) test('rejects ' + name, () => rejection(mutate, error));

for (const stage of ['identity', 'resolve', 'receipt']) test('online request exception fails closed at ' + stage, async () => {
  const f = fixture();
  try {
    const result = await verifyLineage(f.db, f.snapshot, identity, async (...args) => {
      if ((stage === 'identity' && args[0] === '/agent') || (stage === 'resolve' && args[0] === '/scopes/resolve') ||
        (stage === 'receipt' && args[0].startsWith('/batches/'))) throw Error('synthetic network failure');
      return f.request(...args);
    });
    assert.equal(result.passed, false);
    assert.equal(result.onlineVerified, false);
    if (stage === 'identity') assert.ok(result.errors.includes('REMOTE_IDENTITY_REQUEST_FAILED'));
    else assert.equal(result.mismatches.filter(row => row.code === 'REMOTE_REQUEST_FAILED').length, 359);
  } finally { f.db.close(); }
});
test('online mismatch and unauthorized source fail closed', async () => {
  const f = fixture();
  try {
    let result = await verifyLineage(f.db, f.snapshot, identity, async (...args) => args[0] === '/scopes/resolve' ? {} : f.request(...args));
    assert.equal(result.passed, false);
    assert.equal(result.mismatches.length, 359);
    result = await verifyLineage(f.db, f.snapshot, identity, async () => ({...identity, allowedSources: []}));
    assert.ok(result.errors.includes('REMOTE_AGENT_IDENTITY_MISMATCH'));
    assert.equal(result.checked, 0);
  } finally { f.db.close(); }
});

for (const late of [false, true]) test('online rejects remote revision change ' + (late ? 'at last receipt' : 'before reconciliation'), async () => {
  const f = fixture();
  let received = 0;
  try {
    const result = await verifyLineage(f.db, f.snapshot, identity, async (...args) => {
      const reply = await f.request(...args);
      if (args[0].startsWith('/batches/') && (++received === 359 || !late)) return {...reply, dataRevision: f.snapshot.dataRevision + 1};
      return reply;
    });
    assert.equal(result.passed, false);
    assert.equal(result.onlineVerified, false);
    assert.equal(result.mismatches.length, late ? 1 : 359);
    assert.ok(result.mismatches.every(row => row.code === 'REMOTE_REVISION_CHANGED'));
    assert.equal(result.ok, late ? 358 : 0);
  } finally { f.db.close(); }
});

test('actual CLI exits 0 on pass and nonzero on empty, mismatch, missing snapshot and online exceptions', () => {
  const directory = mkdtempSync(join(tmpdir(), 'incept-lineage-test-'));
  try {
    const f = fixture(join(directory, 'state.db'));
    f.db.close();
    writeFileSync(join(directory, 'config.json'), JSON.stringify({version: 1, ...identity, home: directory, allowedSources: ['codex'], allowLoopbackHttp: true}));
    const snapshotPath = join(directory, 'snapshot.json');
    const agent = fileURLToPath(new URL('../dist/agent.mjs', import.meta.url));
    const run = (args, preload) => {
      const child = spawnSync(process.execPath, [...(preload ? ['--import', pathToFileURL(preload).href] : []), agent, 'verify-lineage', '--state', directory, ...args],
        {encoding: 'utf8', timeout: 15000, windowsHide: true});
      assert.ifError(child.error);
      assert.ok(child.stdout.trim(), child.stderr || `CLI exited ${child.status} without JSON`);
      return {status: child.status, result: JSON.parse(child.stdout.trim())};
    };
    writeFileSync(snapshotPath, JSON.stringify(f.snapshot));
    let child = run(['--snapshot', snapshotPath, '--snapshot-only']);
    assert.equal(child.status, 0, JSON.stringify(child));
    assert.equal(child.result.ok, 359);
    f.snapshot.scopes[0].manifestHash = hash('mismatch');
    writeFileSync(snapshotPath, JSON.stringify(f.snapshot));
    child = run(['--snapshot', snapshotPath, '--snapshot-only']);
    assert.equal(child.status, 2);
    assert.equal(child.result.passed, false);
    f.snapshot.scopes[0].manifestHash = hash(['manifest', 0]);
    writeFileSync(snapshotPath, JSON.stringify({...f.snapshot, scopes: [], receipts: []}));
    assert.equal(run(['--snapshot', snapshotPath, '--snapshot-only']).status, 2);
    child = run(['--snapshot-only']);
    assert.notEqual(child.status, 0);
    assert.equal(child.result.error, 'REMOTE_SNAPSHOT_REQUIRED');
    for (const flags of [[], ['--online', '--snapshot-only']]) {
      child = run(['--snapshot', snapshotPath, ...flags]);
      assert.notEqual(child.status, 0);
      assert.equal(child.result.error, 'VERIFICATION_MODE_REQUIRED');
    }

    // Synthetic credential and fetch hooks are process-local: no DPAPI operation,
    // credential file, Agent startup or network connection occurs in these cases.
    const preload = join(directory, 'synthetic-online.mjs');
    writeFileSync(preload, `import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module';
      cp.execFileSync = () => Buffer.from('isync_' + 'a'.repeat(43)).toString('base64'); syncBuiltinESMExports();
      globalThis.fetch = async () => { throw Error('synthetic transport failure'); };`);
    writeFileSync(snapshotPath, JSON.stringify(f.snapshot));
    child = run(['--snapshot', snapshotPath, '--online'], preload);
    if (process.platform === 'win32') {
      assert.equal(child.status, 2, JSON.stringify(child));
      assert.ok(child.result.errors.includes('REMOTE_IDENTITY_REQUEST_FAILED'));
    } else {
      // Online verification requires Windows DPAPI before attempting transport.
      assert.equal(child.status, 1, JSON.stringify(child));
      assert.equal(child.result.error, 'WINDOWS_DPAPI_REQUIRED');
    }

    // Preserve the real isRunning probe but inject the race at lock creation.
    // This simulates a competing process taking the lock between probe/acquire.
    const racePreload = join(directory, 'synthetic-lock-race.mjs');
    writeFileSync(racePreload, `import net from 'node:net'; import {EventEmitter} from 'node:events'; import {syncBuiltinESMExports} from 'node:module';
      net.createServer = () => { const server = new EventEmitter(); server.listen = () => { queueMicrotask(() => server.emit('error', Error('synthetic competing lock'))); return server; }; return server; }; syncBuiltinESMExports();`);
    child = run(['--snapshot', snapshotPath, '--snapshot-only'], racePreload);
    assert.notEqual(child.status, 0, JSON.stringify(child));
    assert.equal(child.result.error, 'ALREADY_RUNNING');
  } finally { rmSync(directory, {recursive: true, force: true}); }
});
