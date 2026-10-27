import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CompatibleSyncService } from '../adapters/local/imports/sync/legacy';
import { readSyncDatabaseVersion } from '../sync/database-version';
import { SyncExecutor } from '../sync/executor';
import { emptyDashboard, usageRanges, dashboardDate, type TokenDashboardData } from '../domain';
import type { SyncWork } from '../sync/protocol';
import { fromEvents } from './phase1/fixtures';
import { hash } from '../adapters/local/imports/identity';
import * as commandCode from '../adapters/local/collectors/commandcode';
import * as agents from '../adapters/local/collectors/agents';
import { projection } from '../sync/projection';

const io = vi.hoisted(() => ({ failRename: false }));
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: async (...args: Parameters<typeof actual.rename>) => {
    if (io.failRename) { io.failRename = false; throw Error('synthetic rename failure'); }
    return actual.rename(...args);
  } };
});

let home: string, database: string, file: string;
const workers: SyncExecutor[] = [];
beforeEach(() => {
  io.failRename = false;
  home = mkdtempSync(join(tmpdir(), 'trusted-public-snapshot-'));
  database = join(home, 'usage.db'); file = join(home, 'snapshots.json');
  vi.stubEnv('INCEPT_SYNC_ENABLED', '1'); vi.stubEnv('INCEPT_SYNC_TRUSTED_MODE', '1'); vi.stubEnv('INCEPT_SYNC_READ_MODE', 'v2');
  vi.stubEnv('INCEPT_SYNC_DATABASE_FILE', database); vi.stubEnv('INCEPT_DASHBOARD_HOME', home);
  vi.stubEnv('INCEPT_DASHBOARD_CACHE_FILE', file); vi.stubEnv('INCEPT_DASHBOARD_OVERRIDES_FILE', join(home, 'overrides.json'));
  const service = new CompatibleSyncService(database); service.close();
});
afterEach(async () => {
  for (const executor of workers.splice(0)) await executor.close();
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  rmSync(home, { recursive: true, force: true });
});
const version = () => readSyncDatabaseVersion(database);
function revision(next: number) { const db = new DatabaseSync(database); db.prepare('UPDATE sync_meta SET data_revision=?').run(next); db.close(); }
function batch(work: SyncWork, tokens = 100) {
  if (work.op !== 'projection-snapshots') throw Error('Unexpected job');
  return Object.fromEntries(usageRanges.map(range => {
    const data: TokenDashboardData = { ...emptyDashboard(range), checkedAt: new Date(work.now).toISOString(),
      sync: { readMode: 'v2', dataRevision: work.revision } };
    data.dateRange.to = dashboardDate(work.now); data.totals.totalTokens = tokens;
    return [range, data];
  }));
}
async function fake() {
  const cache = await import('../adapters/runtime/snapshot-store');
  const execute = vi.fn<(work: SyncWork) => Promise<unknown>>(async work => batch(work));
  let commit!: () => void;
  cache.configureTrustedDashboardExecutor({ path: database, execute, onCommitted: (fn: () => void) => { commit = fn; } } as unknown as SyncExecutor);
  return { cache, execute, commit: () => commit() };
}

it('merges concurrent public ranges into one atomic generation without collector jobs', async () => {
  const { cache, execute } = await fake(); let finish!: (value: unknown) => void;
  execute.mockImplementationOnce(() => new Promise(done => { finish = done; }));
  const reads = usageRanges.map(range => cache.readDashboardSnapshot(range));
  await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
  finish(batch(execute.mock.calls[0][0]));
  expect((await Promise.all(reads)).map(data => data?.totals.totalTokens)).toEqual([100, 100, 100, 100]);
  const stored = JSON.parse(readFileSync(file, 'utf8'));
  expect(Object.keys(stored.snapshots).sort()).toEqual([...usageRanges].sort());
  expect(new Set(Object.values(stored.snapshots).map(data => (data as TokenDashboardData).checkedAt)).size).toBe(1);
  expect(stored.sync).toMatchObject(version());
  expect(execute.mock.calls.every(([work]) => work.op === 'projection-snapshots')).toBe(true);
});

it('coalesces a burst of receipts into one snapshot projection', async () => {
  const { cache, execute, commit } = await fake();
  await cache.readDashboardSnapshot('all');
  execute.mockClear();
  revision(1); commit();
  revision(2); commit();
  revision(3); commit();
  expect(execute).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1), { timeout: 3_000, interval: 25 });
  expect(execute.mock.calls[0][0]).toMatchObject({ op: 'projection-snapshots', revision: 3 });
  await cache.refreshTrustedDashboardSnapshots();
  expect((await cache.readDashboardSnapshot('all'))?.sync?.dataRevision).toBe(3);
});

it('drops a candidate invalidated during projection and publishes only the rescheduled revision', async () => {
  const { cache, execute } = await fake();
  execute.mockImplementationOnce(async work => { revision(1); return batch(work, 11); }).mockImplementation(async work => batch(work, 22));
  expect((await cache.readDashboardSnapshot('all'))?.totals.totalTokens).toBe(22);
  expect(execute).toHaveBeenCalledTimes(2);
  const stored = JSON.parse(readFileSync(file, 'utf8'));
  expect(stored.sync.revision).toBe(1);
  expect(Object.values(stored.snapshots).every(data => (data as TokenDashboardData).sync?.dataRevision === 1)).toBe(true);
});

it('retains the last good file and memory on worker failure or a mixed range generation', async () => {
  const { cache, execute } = await fake(); await cache.readDashboardSnapshot('all');
  const previous = readFileSync(file, 'utf8'); revision(1);
  execute.mockRejectedValueOnce(Error('synthetic worker failure'));
  expect((await cache.readDashboardSnapshot('all'))?.totals.totalTokens).toBe(100);
  expect(readFileSync(file, 'utf8')).toBe(previous);
  execute.mockImplementationOnce(async work => { const result = batch(work, 999); result.all.sync!.dataRevision = 0; return result; });
  expect((await cache.readDashboardSnapshot('all'))?.totals.totalTokens).toBe(100);
  expect(readFileSync(file, 'utf8')).toBe(previous);
  expect((await cache.readDashboardSnapshot('all'))?.sync?.dataRevision).toBe(1);
});

it('invalidates process memory after another process atomically publishes a complete file', async () => {
  const { cache, execute } = await fake(); await cache.readDashboardSnapshot('all');
  const stored = JSON.parse(readFileSync(file, 'utf8')); revision(1);
  stored.sync.revision = 1;
  for (const data of Object.values(stored.snapshots) as TokenDashboardData[]) { data.totals.totalTokens = 333; data.sync!.dataRevision = 1; }
  writeFileSync(file + '.external', JSON.stringify(stored)); renameSync(file + '.external', file);
  expect((await cache.readDashboardSnapshot('all'))?.totals.totalTokens).toBe(333);
  expect(execute).toHaveBeenCalledTimes(1);
});

it('keeps the same checkedAt at one revision and rebuilds all windows at the Singapore day boundary', async () => {
  let now = Date.parse('2026-10-19T15:59:59Z'); vi.spyOn(Date, 'now').mockImplementation(() => now);
  const { cache, execute } = await fake(); const before = await cache.readDashboardSnapshot('all');
  now += 500; expect((await cache.readDashboardSnapshot('all'))?.checkedAt).toBe(before?.checkedAt);
  now += 1_000; const after = await cache.readDashboardSnapshot('all');
  expect(after?.dateRange.to).toBe('2026-10-20'); expect(after?.sync?.dataRevision).toBe(before?.sync?.dataRevision);
  expect(execute).toHaveBeenCalledTimes(2);
});

it('does not reuse a same-path replacement database, even when its revision is identical', async () => {
  const { cache, execute } = await fake(); await cache.readDashboardSnapshot('all'); const original = version().identity;
  const replacement = new CompatibleSyncService(database + '.replacement'); replacement.close();
  renameSync(database + '.replacement', database);
  expect(version().identity).not.toBe(original);
  execute.mockRejectedValueOnce(Error('synthetic failure'));
  expect(await cache.readDashboardSnapshot('all')).toBeNull();
  execute.mockImplementation(async work => batch(work, 777));
  expect((await cache.readDashboardSnapshot('all'))?.totals.totalTokens).toBe(777);
});

it('a restart can serve a matching complete on-disk generation without starting a worker', async () => {
  const { cache } = await fake(); await cache.readDashboardSnapshot('all');
  vi.resetModules(); const restarted = await import('../adapters/runtime/snapshot-store');
  expect((await restarted.readDashboardSnapshot('all'))?.totals.totalTokens).toBe(100);
});

it('an atomic rename failure leaves every old range intact and permits a later retry', async () => {
  const { cache } = await fake(); await cache.readDashboardSnapshot('all');
  const previous = readFileSync(file, 'utf8'); revision(1);
  io.failRename = true;
  expect((await cache.readDashboardSnapshot('all'))?.sync?.dataRevision).toBe(0);
  expect(readFileSync(file, 'utf8')).toBe(previous);
  expect((await cache.readDashboardSnapshot('all'))?.sync?.dataRevision).toBe(1);
});

it('a trusted projection never invokes raw source collectors', () => {
  const command = vi.spyOn(commandCode, 'collectCommandCodeEvents');
  const collect = vi.spyOn(agents, 'collectAiusageAndRawAgentEvents');
  const service = new CompatibleSyncService(database);
  try { expect(projection(service, home, 'all').totals.totalTokens).toBe(0); }
  finally { service.close(); }
  expect(command).not.toHaveBeenCalled(); expect(collect).not.toHaveBeenCalled();
});

it('the executor replaces a worker bound to a previous database file identity', async () => {
  const executor = new SyncExecutor(database, { trusted: true }); workers.push(executor);
  const actor = { role: 'owner' as const, subject: 'fixture', reason: 'isolated file replacement regression' };
  await executor.execute({ op: 'capacity', actor });
  // Windows holds an open SQLite file against replacement. Inject the stale
  // identity that a Linux atomic database replacement would leave behind.
  const internal = executor as unknown as { worker: object; workerIdentity: string };
  const previous = internal.worker; internal.workerIdentity = 'synthetic-previous-file';
  expect((await executor.execute<{dataRevision:number}>({ op: 'capacity', actor })).dataRevision).toBe(0);
  expect(internal.worker).not.toBe(previous);
});

it('receipt ACK completes while display publication is pending; the public API then sees that real worker commit', async () => {
  const executor = new SyncExecutor(database, { trusted: true }); workers.push(executor);
  const cache = await import('../adapters/runtime/snapshot-store'); cache.configureTrustedDashboardExecutor(executor);
  const device = { role: 'device' as const, deviceId: 'synthetic-public-device' };
  const scope = { deviceId: device.deviceId, source: 'claudeCode' as const, sessionId: 'synthetic-public-session', originId: 'synthetic-public-origin' };
  const actor = { role: 'owner' as const, subject: 'fixture', reason: 'isolated regression' };
  const candidate = fromEvents([{ eventId: hash('public-event'), source: scope.source, sessionId: scope.sessionId, timestampMs: Date.parse('2026-10-01T00:00:00Z'),
    modelName: 'phase0-fixture-model', projectKey: 'synthetic', projectName: 'Synthetic', inputTokens: 100, outputTokens: 0,
    cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0 }], scope);
  await executor.execute({ op: 'register', scope, label: 'Synthetic', actor });
  await executor.execute({ op: 'begin', header: candidate.header, actor: device });
  await executor.execute({ op: 'stage', device: device.deviceId, batch: candidate.header.batchId, offset: 0, records: candidate.records, actor: device });
  const original = executor.execute.bind(executor); let release!: () => void; let failPublication = false;
  const gate = new Promise<void>(done => { release = done; });
  vi.spyOn(executor, 'execute').mockImplementation(async (work, verify, signal) => {
    if (work.op === 'projection-snapshots') { await gate; if (failPublication) throw Error('synthetic publication failure'); }
    return original(work, verify, signal);
  });
  const receipt = await executor.execute<{ receipt: { status: string } }>({ op: 'commit', device: device.deviceId, batch: candidate.header.batchId, actor: device });
  expect(receipt.receipt.status).toBe('committed');
  failPublication = true; release();
  await expect(cache.refreshTrustedDashboardSnapshots()).rejects.toThrow('synthetic publication failure');
  expect((await original<{receipt:{status:string}}>({op:'status',device:device.deviceId,batch:candidate.header.batchId,actor:device})).receipt.status).toBe('committed');
  failPublication = false;
  const { dashboardUsageGet } = await import('../next/usage-route');
  const response = await dashboardUsageGet(new Request('http://localhost/api/dashboard/usage?range=all'));
  const result = await response.json();
  expect(result.totals.totalTokens).toBe(100); expect(result.sessions).toEqual([]); expect(result.projects).toEqual([]);
  expect(JSON.stringify(result)).not.toContain(device.deviceId);
  expect((await cache.readDashboardSnapshot('all'))?.sync?.dataRevision).toBe(version().revision);
});
