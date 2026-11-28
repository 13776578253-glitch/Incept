import 'server-only';
import { readFile, stat, mkdir, writeFile, rename, unlink, open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { dashboardDate, usageRanges, type TokenDashboardData, type UsageRange } from '../../domain';
import { overridesPath } from '../local/overrides';
import { readSyncDatabaseVersion } from '../../sync/database-version';
import type { SyncExecutor, SyncJobTiming } from '../../sync/executor';
import referenceCatalog from '../../sync/usage-billing-reference-catalog.json';
import channelMappings from '../../sync/usage-billing-channel-mappings.json';

const PRICING_POLICY_SCOPE = createHash('sha256')
  .update(JSON.stringify(['pricing-policy-v2', 'model-registry-v2', referenceCatalog, channelMappings]))
  .digest('hex');

type Snapshots = Partial<Record<UsageRange, TokenDashboardData>>;
type Generation = { identity: string; revision: number; day: string };
type Stored = { version: number; scope: string; snapshots: Snapshots; sync?: Generation };
type Cached = { fingerprint: string; stored: Stored };
type Context = ReturnType<typeof snapshotContext>;
type SharedSnapshotStore = {
  memory: Map<string, Cached>;
  writes: Map<string, Promise<boolean>>;
  refreshes: Map<string, Promise<void>>;
  refreshTimers: Map<string, { timer: ReturnType<typeof setTimeout>; deadline: number }>;
  pendingReschedule: Set<string>;
  executors: Map<string, SyncExecutor>;
  registeredExecutors: WeakSet<SyncExecutor>;
};

// Next.js production builds instantiate separate SSR and API module graphs in
// the same Node process. Keep listener registration, debounce timers, in-flight
// refreshes, and publication queues in one process-wide store so each revision
// is projected and published at most once.
const SHARED_STORE_KEY = Symbol.for('incept.dashboard.trustedSnapshotStore.v1');
function sharedStore(): SharedSnapshotStore {
  const holder = globalThis as Record<PropertyKey, unknown>;
  let current = holder[SHARED_STORE_KEY] as SharedSnapshotStore | undefined;
  if (!current) {
    current = {
      memory: new Map<string, Cached>(),
      writes: new Map<string, Promise<boolean>>(),
      refreshes: new Map<string, Promise<void>>(),
      refreshTimers: new Map<string, { timer: ReturnType<typeof setTimeout>; deadline: number }>(),
      pendingReschedule: new Set<string>(),
      executors: new Map<string, SyncExecutor>(),
      registeredExecutors: new WeakSet<SyncExecutor>(),
    };
    holder[SHARED_STORE_KEY] = current;
  }
  return current;
}
const store = sharedStore();
export const TRUSTED_SNAPSHOT_REFRESH_DEBOUNCE_MS = 1_500;
export const TRUSTED_SNAPSHOT_REFRESH_MAX_WAIT_MS = 10_000;
function scheduleTrustedDashboardRefresh(context: Context) {
  if (store.refreshes.get(context.key)) {
    store.pendingReschedule.add(context.key);
    return;
  }
  const now = Date.now(), scheduled = store.refreshTimers.get(context.key);
  if (scheduled) clearTimeout(scheduled.timer);
  const deadline = scheduled?.deadline ?? now + TRUSTED_SNAPSHOT_REFRESH_MAX_WAIT_MS;
  const delay = Math.min(TRUSTED_SNAPSHOT_REFRESH_DEBOUNCE_MS, Math.max(0, deadline - now));
  const timer = setTimeout(() => {
    store.refreshTimers.delete(context.key);
    void refreshTrustedDashboardSnapshots().catch(() => {});
  }, delay);
  timer.unref?.();
  store.refreshTimers.set(context.key, { timer, deadline });
}

export function trustedDashboardEnabled() {
  return process.env.INCEPT_SYNC_ENABLED === '1' && process.env.INCEPT_SYNC_TRUSTED_MODE === '1' && process.env.INCEPT_SYNC_READ_MODE === 'v2';
}
export function snapshotContext() {
  const home = resolve(process.env.INCEPT_DASHBOARD_HOME ?? homedir());
  const path = resolve(process.env.INCEPT_DASHBOARD_CACHE_FILE ?? join(home, '.incept', 'dashboard-snapshots.json'));
  const database = trustedDashboardEnabled() && process.env.INCEPT_SYNC_DATABASE_FILE ? resolve(process.env.INCEPT_SYNC_DATABASE_FILE) : undefined;
  const scope = createHash('sha256').update(JSON.stringify(['commandcode-peak-v1', 'hourly-v1', PRICING_POLICY_SCOPE, home, process.env.INCEPT_DASHBOARD_IMPORTS_FILE,
    overridesPath(), process.env.INCEPT_COMMANDCODE_CATALOG_FILE, ...(database ? ['trusted-v2', database] : [])])).digest('hex');
  return { home, path, scope, key: path + ':' + scope, database };
}
function isSnapshot(value: unknown, range: string): value is TokenDashboardData {
  if (!value || typeof value !== 'object') return false;
  const data = value as TokenDashboardData;
  return data.range === range && typeof data.checkedAt === 'string' && Number.isFinite(Date.parse(data.checkedAt))
    && !!data.totals && !!data.costs && !!data.dateRange && ['daily', 'monthly', 'models', 'sources', 'projects', 'sessions'].every(key => Array.isArray(data[key as keyof TokenDashboardData]));
}
async function fingerprint(path: string) {
  const file = await stat(path, { bigint: true });
  if (file.size > BigInt(64 * 1024 * 1024)) throw Error('SNAPSHOT_TOO_LARGE');
  return [file.dev, file.ino, file.size, file.mtimeNs, file.ctimeNs].join(':');
}
function acceptable(stored: Stored, context: Context, identity?: string) {
  if (stored.version !== 1 || stored.scope !== context.scope || (identity && stored.sync?.identity !== identity)) return false;
  if (!context.database) return true;
  const generation = stored.sync;
  if (!generation || !Number.isSafeInteger(generation.revision) || generation.revision < 0) return false;
  const checkedAt = stored.snapshots?.all?.checkedAt;
  return usageRanges.every(range => isSnapshot(stored.snapshots?.[range], range)
    && stored.snapshots[range]!.sync?.dataRevision === generation.revision
    && stored.snapshots[range]!.dateRange.to === generation.day && stored.snapshots[range]!.checkedAt === checkedAt);
}
async function readStored(context: Context, identity?: string, retries = 2): Promise<Stored | undefined> {
  const previous = store.memory.get(context.key);
  try {
    const before = await fingerprint(context.path);
    if (previous?.fingerprint === before && acceptable(previous.stored, context, identity)) return previous.stored;
    const stored = JSON.parse(await readFile(context.path, 'utf8')) as Stored;
    const after = await fingerprint(context.path);
    if (before !== after) return retries > 0 ? readStored(context, identity, retries - 1) : previous && acceptable(previous.stored, context, identity) ? previous.stored : undefined;
    if (!acceptable(stored, context, identity)) return previous && acceptable(previous.stored, context, identity) ? previous.stored : undefined;
    const snapshots: Snapshots = {};
    for (const range of usageRanges) if (isSnapshot(stored.snapshots?.[range], range)) snapshots[range] = stored.snapshots[range];
    const valid = { ...stored, snapshots };
    // Never merge stale memory into a freshly replaced file from another process.
    store.memory.set(context.key, { fingerprint: after, stored: valid });
    return valid;
  } catch {
    return previous && acceptable(previous.stored, context, identity) ? previous.stored : undefined;
  }
}
async function publicationLock(path: string) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try { return await open(path, 'wx', 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try { if (Date.now() - Number((await stat(path)).mtimeMs) > 30_000) await unlink(path); } catch { /* Another publisher released it. */ }
      await new Promise<void>(done => setTimeout(done, 10));
    }
  }
  throw Error('SNAPSHOT_PUBLICATION_BUSY');
}
async function publish(context: Context, snapshots: Snapshots, generation?: Generation): Promise<boolean> {
  const previous = store.writes.get(context.key) ?? Promise.resolve(false);
  const job = previous.catch(() => false).then(async () => {
    await mkdir(dirname(context.path), { recursive: true });
    const lockPath = context.path + '.lock', temporary = context.path + '.' + randomUUID() + '.tmp';
    const lock = await publicationLock(lockPath);
    try {
      const stored = await readStored(context, generation?.identity);
      if (generation) {
        const current = readSyncDatabaseVersion(context.database!);
        if (current.identity !== generation.identity || current.revision !== generation.revision || dashboardDate(Date.now()) !== generation.day) throw Error('SNAPSHOT_VERSION_CHANGED');
        if (stored?.sync?.identity === generation.identity) {
          if (stored.sync.revision > generation.revision || stored.sync.day > generation.day) throw Error('SNAPSHOT_VERSION_CHANGED');
          // Already published for this exact ledger identity, revision, day, and scope.
          if (currentGeneration(stored, generation, generation.day)) return false;
        }
      }
      const next: Stored = { version: 1, scope: context.scope, snapshots: generation ? snapshots : { ...stored?.snapshots, ...snapshots }, ...(generation ? { sync: generation } : {}) };
      await writeFile(temporary, JSON.stringify(next), { flag: 'wx', mode: 0o600 });
      // Drop candidates invalidated during serialization before the atomic rename.
      if (generation) {
        const current = readSyncDatabaseVersion(context.database!);
        if (current.identity !== generation.identity || current.revision !== generation.revision || dashboardDate(Date.now()) !== generation.day) throw Error('SNAPSHOT_VERSION_CHANGED');
      }
      await rename(temporary, context.path);
      // Read the actual winner. A different process can replace the path just
      // after rename; pairing its fingerprint with our older object is unsafe.
      store.memory.delete(context.key);
      await readStored(context, generation?.identity);
      return true;
    } finally {
      await unlink(temporary).catch(() => {});
      await lock.close(); await unlink(lockPath).catch(() => {});
    }
  });
  store.writes.set(context.key, job);
  try { return await job; } finally { if (store.writes.get(context.key) === job) store.writes.delete(context.key); }
}

/** Reuse the application's one bounded sync worker; no public collector jobs. */
export function configureTrustedDashboardExecutor(executor: SyncExecutor) {
  const path = resolve(executor.path);
  store.executors.set(path, executor);
  if (store.registeredExecutors.has(executor)) return;
  store.registeredExecutors.add(executor);
  executor.onCommitted(() => {
    const context = snapshotContext();
    if (context.database === path) scheduleTrustedDashboardRefresh(context);
  });
}
export function refreshTrustedDashboardSnapshots(): Promise<void> {
  const context = snapshotContext(), scheduled = store.refreshTimers.get(context.key);
  if (scheduled) { clearTimeout(scheduled.timer); store.refreshTimers.delete(context.key); }
  if (!context.database) return Promise.resolve();
  const active = store.refreshes.get(context.key);
  if (active) return active;
  const job = (async () => {
    const executor = store.executors.get(context.database!);
    if (!executor) return;
    for (let attempt = 0; attempt < 3; attempt++) {
      const version = readSyncDatabaseVersion(context.database!), now = Date.now(), day = dashboardDate(now);
      const stored = await readStored(context, version.identity);
      if (currentGeneration(stored, version, day)) return;
      try {
        let timing: SyncJobTiming | undefined;
        const started = performance.now();
        const snapshots = await executor.execute<Snapshots>({ op: 'projection-snapshots', home: context.home, revision: version.revision, identity: version.identity, now,
          actor: { role: 'owner', subject: 'public-dashboard-cache', reason: 'Publish committed usage summary' } }, undefined, undefined, value => { timing = value; });
        if (!usageRanges.every(range => isSnapshot(snapshots[range], range) && snapshots[range]!.sync?.dataRevision === version.revision
          && snapshots[range]!.checkedAt === new Date(now).toISOString() && snapshots[range]!.dateRange.to === day)) throw Error('INVALID_SNAPSHOT_GENERATION');
        const published = await publish(context, snapshots, { ...version, day });
        if (published) {
          console.info(JSON.stringify({
            event: 'dashboard_snapshot_published',
            revision: version.revision,
            day,
            queueWaitMs: timing?.queueWaitMs ?? 0,
            execMs: timing?.execMs ?? Math.round(performance.now() - started),
            workerWallMs: timing?.workerWallMs ?? null,
            totalMs: Math.round(performance.now() - started),
          }));
        }
        return;
      } catch (error) {
        if (!['SNAPSHOT_VERSION_CHANGED', 'SYNC_DATABASE_REPLACED'].includes(error instanceof Error ? error.message : '')) throw error;
      }
    }
    // Retry on the next receipt/poll rather than monopolizing the worker during
    // continuous writes or publishing a mixed/older generation.
    throw Error('SNAPSHOT_VERSION_CHANGED');
  })().finally(() => {
    if (store.refreshes.get(context.key) === job) store.refreshes.delete(context.key);
    if (store.pendingReschedule.delete(context.key) && context.database) {
      try {
        const version = readSyncDatabaseVersion(context.database);
        const day = dashboardDate(Date.now());
        const cached = store.memory.get(context.key)?.stored;
        if (!currentGeneration(cached, version, day)) scheduleTrustedDashboardRefresh(context);
      } catch {
        // The next read or commit will reschedule if the file is transiently unavailable.
      }
    }
  });
  store.refreshes.set(context.key, job); return job;
}
function currentGeneration(stored: Stored | undefined, version: Pick<Generation, 'identity' | 'revision'>, day: string) {
  return !!stored?.sync && stored.sync.identity === version.identity && stored.sync.revision === version.revision && stored.sync.day === day
    && usageRanges.every(range => isSnapshot(stored.snapshots[range], range));
}
export async function readDashboardSnapshot(range: UsageRange = '30d', options: { waitForFresh?: boolean } = {}): Promise<TokenDashboardData | null> {
  const context = snapshotContext();
  if (!context.database) return (await readStored(context))?.snapshots[range] ?? null;
  let version: Pick<Generation, 'identity' | 'revision'> | undefined;
  try { version = readSyncDatabaseVersion(context.database); } catch { /* Retain the last good display during a transient read failure. */ }
  const stored = await readStored(context, version?.identity);
  const snapshot = stored?.snapshots[range] ?? null;
  const current = !!version && currentGeneration(stored, version, dashboardDate(Date.now()));
  if (current) return snapshot;
  if (snapshot && options.waitForFresh === false) {
    // Serve the last complete generation immediately. The persisted snapshot
    // remains the source of truth if this background refresh fails or the
    // process exits before it starts.
    scheduleTrustedDashboardRefresh(context);
    return snapshot;
  }
  await refreshTrustedDashboardSnapshots().catch(() => {});
  let identity: string | undefined;
  try { identity = readSyncDatabaseVersion(context.database).identity; } catch { /* Retain the last good display during a transient read failure. */ }
  return (await readStored(context, identity ?? version?.identity))?.snapshots[range] ?? null;
}
export async function saveDashboardSnapshot(data: TokenDashboardData) {
  const context = snapshotContext();
  if (!data.range || context.database) return;
  try { await publish(context, { [data.range]: data }); } catch { /* A cache failure must not discard a completed legacy collection. */ }
}
