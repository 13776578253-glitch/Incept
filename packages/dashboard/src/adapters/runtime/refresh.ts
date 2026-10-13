import 'server-only';
import { dashboardDate, type TokenDashboardData, type UsageRange } from '../../domain';
import { collectInWorker } from './worker-client';
import { readDashboardSnapshot, saveDashboardSnapshot, snapshotContext } from './snapshot-store';
import { statSync } from 'node:fs';
import { importStorePath } from '../local/imports/store';

function importsUnchanged(home: string, checkedAt: number) {
  const path = importStorePath(home);
  return [path, path + '-wal'].every(file => {
    try { return statSync(file).mtimeMs <= checkedAt; } catch { return true; }
  });
}

const pending = new Map<string, { force: boolean; job: Promise<TokenDashboardData> }>();
export async function refreshDashboardSnapshot({ range = '30d', force = false }: { range?: UsageRange; force?: boolean } = {}) {
  const context = snapshotContext(), key = context.key + ':' + range;
  const active = pending.get(key);
  if (active) {
    if (!force || active.force) return active.job;
    await active.job.catch(() => {});
    return refreshDashboardSnapshot({ range, force: true });
  }
  const cached = await readDashboardSnapshot(range);
  const age = cached ? Date.now() - Date.parse(cached.checkedAt!) : Infinity;
  if (!force && cached && cached.dateRange.to === dashboardDate(Date.now()) && age >= 0 && age < 15_000
    && importsUnchanged(context.home, Date.parse(cached.checkedAt!))) return cached;
  // Recheck after the asynchronous cache read: concurrent navigations share one job.
  const existing = pending.get(key);
  if (existing) {
    if (!force || existing.force) return existing.job;
    await existing.job.catch(() => {});
    return refreshDashboardSnapshot({ range, force: true });
  }
  const job = collectInWorker(context.home, range, force).then(async data => { await saveDashboardSnapshot(data); return data; })
    .finally(() => { if (pending.get(key)?.job === job) pending.delete(key); });
  pending.set(key, { job, force }); return job;
}
