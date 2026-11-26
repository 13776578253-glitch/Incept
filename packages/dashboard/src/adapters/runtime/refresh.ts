import 'server-only';
import { dashboardDate, type TokenDashboardData, type UsageRange } from '../../domain';
import { collectInWorker } from './worker-client';
import { readDashboardSnapshot, saveDashboardSnapshot, snapshotContext, trustedDashboardEnabled } from './snapshot-store';
import { statSync } from 'node:fs';
import { importStorePath, readImportSignature } from '../local/imports/store';

type Collect = (home: string, range: UsageRange, force: boolean, background?: boolean) => Promise<TokenDashboardData>;

function importsUnchanged(home: string, checkedAt: number) {
  const path = importStorePath(home);
  return [path, path + '-wal'].every(file => {
    try { return statSync(file).mtimeMs <= checkedAt; } catch { return true; }
  });
}

type PendingEntry = {
  force: boolean;
  job: Promise<TokenDashboardData>;
  epoch: number;
  importSignature: string;
  customCollect: boolean;
  runCollect: Collect;
};

const pending = new Map<string, PendingEntry>();
const epochs = new Map<string, number>();
const prewarmRanges: readonly UsageRange[] = ['7d', '30d', 'all'];

function currentEpoch(contextKey: string) {
  return epochs.get(contextKey) ?? 0;
}

function bumpEpoch(contextKey: string) {
  const next = currentEpoch(contextKey) + 1;
  epochs.set(contextKey, next);
  return next;
}

function isShadowMode() {
  return process.env.INCEPT_SYNC_ENABLED === '1' && process.env.INCEPT_SYNC_READ_MODE === 'shadow';
}

function isFreshSnapshot(cached: TokenDashboardData | null, home: string): boolean {
  if (!cached?.checkedAt) return false;
  const checkedAt = Date.parse(cached.checkedAt);
  const age = Date.now() - checkedAt;
  if (cached.dateRange.to !== dashboardDate(Date.now()) || age < 0 || age >= 15_000) return false;
  // The import baseline is when imports were read, not when collection finished.
  const importBaseline = Date.parse(cached.importsCheckedAt ?? cached.checkedAt);
  if (cached.importSignature !== undefined && cached.importSignature !== readImportSignature(home)) return false;
  return importsUnchanged(home, Number.isFinite(importBaseline) ? importBaseline : checkedAt);
}

function scheduleSiblingPrewarm(
  context: ReturnType<typeof snapshotContext>,
  completedRange: UsageRange,
  runCollect: Collect,
  epoch: number,
  customCollect: boolean,
) {
  for (const sibling of prewarmRanges) {
    if (sibling === completedRange) continue;
    const siblingKey = context.key + ':' + sibling;
    if (pending.has(siblingKey)) continue;
    void (async () => {
      const cached = await readDashboardSnapshot(sibling);
      if (epoch !== currentEpoch(context.key)) return;
      if (isFreshSnapshot(cached, context.home) || pending.has(siblingKey)) return;
      await startRefreshJob(context, siblingKey, sibling, false, runCollect, false, true, epoch, readImportSignature(context.home), customCollect);
    })().catch(() => {});
  }
}

function startRefreshJob(
  context: ReturnType<typeof snapshotContext>,
  key: string,
  range: UsageRange,
  force: boolean,
  runCollect: Collect,
  shouldPrewarm: boolean,
  background: boolean,
  epoch: number,
  importSignature: string,
  customCollect: boolean,
) {
  const job = runCollect(context.home, range, force, background)
    .then(async data => {
      if (epoch !== currentEpoch(context.key)) return data;
      await saveDashboardSnapshot(data);
      if (shouldPrewarm && epoch === currentEpoch(context.key)) {
        scheduleSiblingPrewarm(context, range, runCollect, epoch, customCollect);
      }
      return data;
    })
    .finally(() => { if (pending.get(key)?.job === job) pending.delete(key); });
  // Prevent Node 24 UnhandledPromiseRejection when SWR returns a stale snapshot without awaiting job.
  void job.catch(() => {});
  pending.set(key, { job, force, epoch, importSignature, customCollect, runCollect });
  return job;
}

export async function refreshDashboardSnapshot({
  range = '30d',
  force = false,
  waitForFresh = force || isShadowMode(),
  collect,
  prewarmSiblings,
}: {
  range?: UsageRange;
  force?: boolean;
  waitForFresh?: boolean;
  collect?: Collect;
  prewarmSiblings?: boolean;
} = {}) {
  if (trustedDashboardEnabled()) {
    const snapshot = await readDashboardSnapshot(range, { waitForFresh: force || waitForFresh });
    if (!snapshot) throw Error('TRUSTED_SNAPSHOT_UNAVAILABLE');
    return snapshot;
  }
  const context = snapshotContext(), key = context.key + ':' + range;
  const runCollect: Collect = collect ?? collectInWorker;
  const shouldPrewarm = prewarmSiblings ?? (!collect && !isShadowMode());
  const currentSignature = readImportSignature(context.home);
  if (force) {
    const active = pending.get(key);
    if (active?.force && active.epoch === currentEpoch(context.key) && active.importSignature === currentSignature) {
      return active.job;
    }
    if (active?.customCollect) {
      bumpEpoch(context.key);
      await active.job.catch(() => {});
      return refreshDashboardSnapshot({ range, force: true, waitForFresh: true, collect: collect ?? active.runCollect, prewarmSiblings });
    }
    const epoch = bumpEpoch(context.key);
    return startRefreshJob(context, key, range, true, runCollect, shouldPrewarm, false, epoch, currentSignature, !!collect);
  }
  const cached = await readDashboardSnapshot(range);
  const latestSignature = readImportSignature(context.home);
  if (cached && isFreshSnapshot(cached, context.home)) return cached;
  // Reuse only current work after the async snapshot read. A force in another window
  // may have invalidated this job even when the import signature is unchanged.
  const existing = pending.get(key);
  const serveStale = !!cached && !waitForFresh;
  let epoch = currentEpoch(context.key);
  if (existing?.epoch === epoch) {
    if (existing.importSignature === latestSignature) {
      return serveStale ? { ...cached, revalidating: true } : existing.job;
    }
    epoch = bumpEpoch(context.key);
  }
  if (existing?.customCollect && !serveStale) {
    await existing.job.catch(() => {});
    return refreshDashboardSnapshot({ range, force: false, waitForFresh: true, collect: collect ?? existing.runCollect, prewarmSiblings });
  }
  // An interactive caller (cold miss or strict read) outranks background revalidation in the worker queue.
  const job = startRefreshJob(context, key, range, false, runCollect, shouldPrewarm, serveStale, epoch, latestSignature, !!collect);
  return serveStale ? { ...cached, revalidating: true } : job;
}
