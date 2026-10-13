import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDashboard, type TokenDashboardData } from '../domain';
const mocked = vi.hoisted(() => ({ collect: vi.fn() }));
vi.mock('../adapters/runtime/worker-client', () => ({ collectInWorker: mocked.collect }));
let home: string, file: string;
const data = (age = 0): TokenDashboardData => ({ ...emptyDashboard(), checkedAt: new Date(Date.now() - age).toISOString() });
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dashboard-snapshots-')); file = join(home, 'snapshots.json');
  vi.stubEnv('INCEPT_DASHBOARD_HOME', home); vi.stubEnv('INCEPT_DASHBOARD_CACHE_FILE', file);
  vi.stubEnv('INCEPT_DASHBOARD_OVERRIDES_FILE', join(home, 'overrides.json'));
  mocked.collect.mockReset(); vi.resetModules();
});
afterEach(() => {
  vi.unstubAllEnvs();
  if (!resolve(home).startsWith(join(resolve(tmpdir()), 'dashboard-snapshots-'))) throw new Error('Unsafe cleanup');
  rmSync(home, { recursive: true, force: true });
});
describe('non-blocking dashboard history', () => {
  it('loads the last successful snapshot after a process/module restart without collecting sources', async () => {
    const stored = data(90_000);
    const cache = await import('../adapters/runtime/snapshot-store'); await cache.saveDashboardSnapshot(stored);
    vi.resetModules();
    expect(await (await import('../adapters/runtime/snapshot-store')).readDashboardSnapshot('30d')).toEqual(stored);
    expect(mocked.collect).not.toHaveBeenCalled();
  });
  it('keeps history immediately readable while a slow refresh is pending and shares concurrent refreshes', async () => {
    const cache = await import('../adapters/runtime/snapshot-store'), old = data(90_000);
    await cache.saveDashboardSnapshot(old);
    let finish!: (value: TokenDashboardData) => void;
    mocked.collect.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { refreshDashboardSnapshot } = await import('../adapters/runtime/refresh');
    const first = refreshDashboardSnapshot(), second = refreshDashboardSnapshot();
    await vi.waitFor(() => expect(mocked.collect).toHaveBeenCalledTimes(1));
    expect(await cache.readDashboardSnapshot()).toBe(old);
    const next = data(); next.totals.totalTokens = 22; finish(next);
    expect(await first).toBe(next); expect(await second).toBe(next);
    expect(JSON.parse(readFileSync(file, 'utf8')).snapshots['30d'].totals.totalTokens).toBe(22);
  });
  it('preserves successful history on collection failure and permits a later retry', async () => {
    const cache = await import('../adapters/runtime/snapshot-store'), old = data(90_000);
    await cache.saveDashboardSnapshot(old);
    const { refreshDashboardSnapshot } = await import('../adapters/runtime/refresh');
    mocked.collect.mockRejectedValueOnce(new Error('worker failed')).mockResolvedValue(data());
    await expect(refreshDashboardSnapshot()).rejects.toThrow('worker failed');
    expect(await cache.readDashboardSnapshot()).toBe(old);
    await refreshDashboardSnapshot(); expect(mocked.collect).toHaveBeenCalledTimes(2);
  });
  it('serves a recent same-day snapshot but forces a manual refresh after a normal in-flight job', async () => {
    const cache = await import('../adapters/runtime/snapshot-store'); await cache.saveDashboardSnapshot(data());
    const { refreshDashboardSnapshot } = await import('../adapters/runtime/refresh');
    await refreshDashboardSnapshot(); expect(mocked.collect).not.toHaveBeenCalled();
    await cache.saveDashboardSnapshot(data(90_000));
    let finish!: (value: TokenDashboardData) => void;
    mocked.collect.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(data());
    const normal = refreshDashboardSnapshot(), forced = refreshDashboardSnapshot({ force: true });
    await vi.waitFor(() => expect(mocked.collect).toHaveBeenCalledTimes(1)); finish(data());
    await normal; await forced;
    expect(mocked.collect.mock.calls.map(call => call[2])).toEqual([false, true]);
  });
  it('ignores damaged or mismatched history instead of blocking the initial page', async () => {
    writeFileSync(file, '{broken'); const cache = await import('../adapters/runtime/snapshot-store');
    expect(await cache.readDashboardSnapshot()).toBeNull();
    await cache.saveDashboardSnapshot(data());
    vi.stubEnv('INCEPT_DASHBOARD_OVERRIDES_FILE', join(home, 'other-overrides.json'));
    expect(await cache.readDashboardSnapshot()).toBeNull();
  });
  it('revalidates a recent snapshot when import storage changes', async () => {
    const cache = await import('../adapters/runtime/snapshot-store'); await cache.saveDashboardSnapshot(data(100));
    mkdirSync(join(home, '.incept'), { recursive: true }); writeFileSync(join(home, '.incept/dashboard-imports.db'), 'changed import revision');
    mocked.collect.mockResolvedValue(data());
    await (await import('../adapters/runtime/refresh')).refreshDashboardSnapshot();
    expect(mocked.collect).toHaveBeenCalledTimes(1);
  });
});
