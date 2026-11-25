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
    const first = refreshDashboardSnapshot({ waitForFresh: true, prewarmSiblings: false });
    const second = refreshDashboardSnapshot({ waitForFresh: true, prewarmSiblings: false });
    await vi.waitFor(() => expect(mocked.collect).toHaveBeenCalledTimes(1));
    expect(await cache.readDashboardSnapshot()).toEqual(old);
    const next = data(); next.totals.totalTokens = 22; finish(next);
    expect(await first).toBe(next); expect(await second).toBe(next);
    expect(JSON.parse(readFileSync(file, 'utf8')).snapshots['30d'].totals.totalTokens).toBe(22);
  });
  it('preserves successful history on collection failure and permits a later retry', async () => {
    const cache = await import('../adapters/runtime/snapshot-store'), old = data(90_000);
    await cache.saveDashboardSnapshot(old);
    const { refreshDashboardSnapshot } = await import('../adapters/runtime/refresh');
    mocked.collect.mockRejectedValueOnce(new Error('worker failed')).mockResolvedValue(data());
    await expect(refreshDashboardSnapshot({ waitForFresh: true, prewarmSiblings: false })).rejects.toThrow('worker failed');
    expect(await cache.readDashboardSnapshot()).toEqual(old);
    await refreshDashboardSnapshot({ waitForFresh: true, prewarmSiblings: false }); expect(mocked.collect).toHaveBeenCalledTimes(2);
  });
  it('serves a recent same-day snapshot but forces a manual refresh after a normal in-flight job', async () => {
    const cache = await import('../adapters/runtime/snapshot-store'); await cache.saveDashboardSnapshot(data());
    const { refreshDashboardSnapshot } = await import('../adapters/runtime/refresh');
    await refreshDashboardSnapshot({ prewarmSiblings: false }); expect(mocked.collect).not.toHaveBeenCalled();
    await cache.saveDashboardSnapshot(data(90_000));
    let finish!: (value: TokenDashboardData) => void;
    mocked.collect.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(data());
    const normal = refreshDashboardSnapshot({ waitForFresh: true, prewarmSiblings: false });
    await vi.waitFor(() => expect(mocked.collect).toHaveBeenCalledTimes(1));
    const forced = refreshDashboardSnapshot({ force: true, prewarmSiblings: false });
    finish(data());
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
    await (await import('../adapters/runtime/refresh')).refreshDashboardSnapshot({ waitForFresh: true, prewarmSiblings: false });
    expect(mocked.collect).toHaveBeenCalledTimes(1);
  });
  it('serves a verified stale snapshot immediately on ordinary reads and coalesces background refresh', async () => {
    const cache = await import('../adapters/runtime/snapshot-store'), old = data(90_000);
    old.totals.totalTokens = 11;
    await cache.saveDashboardSnapshot(old);
    let finish!: (value: TokenDashboardData) => void;
    mocked.collect.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { refreshDashboardSnapshot } = await import('../adapters/runtime/refresh');
    const first = await refreshDashboardSnapshot({ prewarmSiblings: false });
    const second = await refreshDashboardSnapshot({ prewarmSiblings: false });
    expect(first).toEqual({ ...old, revalidating: true });
    expect(second).toEqual({ ...old, revalidating: true });
    expect(mocked.collect).toHaveBeenCalledTimes(1);
    const fresh = data(); fresh.totals.totalTokens = 99;
    finish(fresh);
    await vi.waitFor(async () => expect((await cache.readDashboardSnapshot('30d'))?.totals.totalTokens).toBe(99));
  });
  it('retains stale history and clears pending state when background SWR collection fails', async () => {
    const cache = await import('../adapters/runtime/snapshot-store'), old = data(90_000);
    old.totals.totalTokens = 15;
    await cache.saveDashboardSnapshot(old);
    let fail!: (error: Error) => void;
    mocked.collect.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }))
      .mockResolvedValue({ ...data(), totals: { ...data().totals, totalTokens: 77 } });
    const { refreshDashboardSnapshot } = await import('../adapters/runtime/refresh');
    expect(await refreshDashboardSnapshot({ prewarmSiblings: false })).toEqual({ ...old, revalidating: true });
    await vi.waitFor(() => expect(mocked.collect).toHaveBeenCalledTimes(1));
    fail(new Error('background worker crash'));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(await cache.readDashboardSnapshot('30d')).toEqual(old);
    expect(await refreshDashboardSnapshot({ prewarmSiblings: false })).toEqual({ ...old, revalidating: true });
    await vi.waitFor(async () => expect((await cache.readDashboardSnapshot('30d'))?.totals.totalTokens).toBe(77));
    expect(mocked.collect).toHaveBeenCalledTimes(2);
  });
  it('single-flights cold misses and forces live projection in shadow mode', async () => {
    let finish!: (value: TokenDashboardData) => void;
    mocked.collect.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { refreshDashboardSnapshot } = await import('../adapters/runtime/refresh');
    const first = refreshDashboardSnapshot({ prewarmSiblings: false });
    const second = refreshDashboardSnapshot({ prewarmSiblings: false });
    await vi.waitFor(() => expect(mocked.collect).toHaveBeenCalledTimes(1));
    const cold = data(); cold.totals.totalTokens = 44;
    finish(cold);
    expect(await first).toBe(cold);
    expect(await second).toBe(cold);
    const cache = await import('../adapters/runtime/snapshot-store');
    await cache.saveDashboardSnapshot({ ...data(90_000), totals: { ...data().totals, totalTokens: 5 } });
    vi.stubEnv('INCEPT_SYNC_ENABLED', '1');
    vi.stubEnv('INCEPT_SYNC_READ_MODE', 'shadow');
    const live = data(); live.totals.totalTokens = 88;
    mocked.collect.mockResolvedValueOnce(live);
    expect((await refreshDashboardSnapshot({ prewarmSiblings: false })).totals.totalTokens).toBe(88);
  });
  it('pre-warms missing and stale sibling windows silently after collection without blocking primary response', async () => {
    const cache = await import('../adapters/runtime/snapshot-store');
    const fresh7d = { ...data(), range: '7d' as const, totals: { ...data().totals, totalTokens: 7 } };
    await cache.saveDashboardSnapshot(fresh7d);
    const pendingAll: ((value: TokenDashboardData) => void)[] = [];
    mocked.collect.mockImplementation((_home: string, range: '7d' | '14d' | '30d' | 'all') => {
      if (range === '30d') return Promise.resolve({ ...data(), range: '30d', totals: { ...data().totals, totalTokens: 30 } });
      if (range === 'all') return new Promise<TokenDashboardData>(resolve => { pendingAll.push(resolve); });
      return Promise.reject(new Error('unexpected range'));
    });
    const { refreshDashboardSnapshot } = await import('../adapters/runtime/refresh');
    const primary = await refreshDashboardSnapshot({ range: '30d' });
    expect(primary.totals.totalTokens).toBe(30);
    await vi.waitFor(() => expect(pendingAll).toHaveLength(1));
    expect(mocked.collect.mock.calls.map(call => call[1])).toEqual(['30d', 'all']);
    pendingAll[0]({ ...data(), range: 'all', totals: { ...data().totals, totalTokens: 999 } });
    await vi.waitFor(async () => expect((await cache.readDashboardSnapshot('all'))?.totals.totalTokens).toBe(999));
  });
  it('revalidates a snapshot whose imports were read before an import commit that landed mid-collection', async () => {
    const cache = await import('../adapters/runtime/snapshot-store');
    mkdirSync(join(home, '.incept'), { recursive: true }); writeFileSync(join(home, '.incept/dashboard-imports.db'), 'committed during collection');
    // checkedAt (completion) is later than the import commit, but the imports were read earlier.
    await cache.saveDashboardSnapshot({ ...data(), importsCheckedAt: new Date(Date.now() - 5_000).toISOString() });
    mocked.collect.mockResolvedValue(data());
    await (await import('../adapters/runtime/refresh')).refreshDashboardSnapshot({ waitForFresh: true, prewarmSiblings: false });
    expect(mocked.collect).toHaveBeenCalledTimes(1);
  });
  it('revalidates a recent snapshot whose import signature no longer matches and reuses one that does', async () => {
    const cache = await import('../adapters/runtime/snapshot-store');
    const { readImportSignature } = await import('../adapters/local/imports/store');
    mkdirSync(join(home, '.incept'), { recursive: true }); writeFileSync(join(home, '.incept/dashboard-imports.db'), 'imports');
    const { refreshDashboardSnapshot } = await import('../adapters/runtime/refresh');
    await cache.saveDashboardSnapshot({ ...data(), importSignature: readImportSignature(home), importsCheckedAt: new Date(Date.now() + 5_000).toISOString() });
    await refreshDashboardSnapshot({ waitForFresh: true, prewarmSiblings: false });
    expect(mocked.collect).not.toHaveBeenCalled();
    await cache.saveDashboardSnapshot({ ...data(), importSignature: 'missing|missing|missing' });
    mocked.collect.mockResolvedValue(data());
    await refreshDashboardSnapshot({ waitForFresh: true, prewarmSiblings: false });
    expect(mocked.collect).toHaveBeenCalledTimes(1);
  });
  it('marks stale background work so the worker can queue it behind interactive jobs', async () => {
    const cache = await import('../adapters/runtime/snapshot-store');
    await cache.saveDashboardSnapshot(data(90_000));
    mocked.collect.mockResolvedValue(data());
    const { refreshDashboardSnapshot } = await import('../adapters/runtime/refresh');
    await refreshDashboardSnapshot({ prewarmSiblings: false });
    await vi.waitFor(() => expect(mocked.collect).toHaveBeenCalledTimes(1));
    expect(mocked.collect.mock.calls[0][3]).toBe(true);
    await refreshDashboardSnapshot({ force: true, prewarmSiblings: false });
    expect(mocked.collect.mock.calls.at(-1)?.[3]).toBe(false);
  });
  it('prevents a superseded background job from overwriting newer forced snapshots and supersedes same-range force immediately', async () => {
    const cache = await import('../adapters/runtime/snapshot-store');
    await cache.saveDashboardSnapshot(data(90_000));
    let finishOld!: (value: TokenDashboardData) => void;
    mocked.collect
      .mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce({ ...data(), totals: { ...data().totals, totalTokens: 200 } });
    const { refreshDashboardSnapshot } = await import('../adapters/runtime/refresh');
    const stale = await refreshDashboardSnapshot({ range: '30d', prewarmSiblings: false });
    expect(stale.revalidating).toBe(true);
    await vi.waitFor(() => expect(mocked.collect).toHaveBeenCalledTimes(1));
    // Same-range force supersedes immediately without awaiting finishOld.
    const forced = await refreshDashboardSnapshot({ range: '30d', force: true, prewarmSiblings: false });
    expect(forced.totals.totalTokens).toBe(200);
    // Completing the older background job must not overwrite disk snapshot 200 with 100.
    finishOld({ ...data(), totals: { ...data().totals, totalTokens: 100 } });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect((await cache.readDashboardSnapshot('30d'))?.totals.totalTokens).toBe(200);
  });
  it.each(['cold', 'strict', 'swr'] as const)('replaces a superseded sibling prewarm on a %s read', async (read) => {
    const cache = await import('../adapters/runtime/snapshot-store');
    const { refreshDashboardSnapshot } = await import('../adapters/runtime/refresh');
    const snapshot = (range: TokenDashboardData['range'], totalTokens: number, age = 0): TokenDashboardData => ({
      ...data(age), range, totals: { ...data().totals, totalTokens },
    });
    await cache.saveDashboardSnapshot(snapshot('30d', 30));
    if (read !== 'cold') await cache.saveDashboardSnapshot(snapshot('7d', 7, 90_000));

    let finishOld!: (value: TokenDashboardData) => void;
    let finishForced!: (value: TokenDashboardData) => void;
    let finishFresh!: (value: TokenDashboardData) => void;
    mocked.collect
      .mockResolvedValueOnce(snapshot('all', 300))
      .mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishForced = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishFresh = resolve; }));
    await refreshDashboardSnapshot({ range: 'all' });
    await vi.waitFor(() => expect(mocked.collect).toHaveBeenNthCalledWith(2, home, '7d', false, true));

    const forced = refreshDashboardSnapshot({ range: '30d', force: true, prewarmSiblings: false });
    const options = { range: '7d' as const, waitForFresh: read === 'strict', prewarmSiblings: false };
    const first = refreshDashboardSnapshot(options);
    const second = refreshDashboardSnapshot(options);
    try {
      await vi.waitFor(() => expect(mocked.collect).toHaveBeenNthCalledWith(4, home, '7d', false, read === 'swr'));
      expect(mocked.collect).toHaveBeenCalledTimes(4);
      if (read === 'swr') {
        expect(await first).toMatchObject({ revalidating: true, totals: { totalTokens: 7 } });
        expect(await second).toMatchObject({ revalidating: true, totals: { totalTokens: 7 } });
      }
      finishForced(snapshot('30d', 200));
      await forced;
      expect((await cache.readDashboardSnapshot('30d'))?.totals.totalTokens).toBe(200);
      finishFresh(snapshot('7d', 200));
      if (read !== 'swr') {
        expect(await first).toMatchObject({ totals: { totalTokens: 200 } });
        expect(await second).toMatchObject({ totals: { totalTokens: 200 } });
      }
      await vi.waitFor(async () => expect((await cache.readDashboardSnapshot('7d'))?.totals.totalTokens).toBe(200));
    } finally {
      finishForced?.(snapshot('30d', 200));
      finishFresh?.(snapshot('7d', 200));
      finishOld?.(snapshot('7d', 100));
      await Promise.allSettled([forced, first, second]);
    }
  });
  it('does not coalesce a force request with a same-range force from a superseded generation', async () => {
    const { refreshDashboardSnapshot } = await import('../adapters/runtime/refresh');
    const outdated = { ...data(), range: '7d' as const };
    const replacement = { ...outdated, totals: { ...outdated.totals, totalTokens: 200 } };
    let finishOld!: (value: TokenDashboardData) => void;
    mocked.collect
      .mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce(data())
      .mockResolvedValueOnce(replacement);
    const options = { force: true, prewarmSiblings: false };
    const older = refreshDashboardSnapshot({ range: '7d', ...options });
    await refreshDashboardSnapshot({ range: '30d', ...options });
    const latest = refreshDashboardSnapshot({ range: '7d', ...options });
    finishOld(outdated);
    await older;
    expect(await latest).toBe(replacement);
    expect(mocked.collect).toHaveBeenCalledTimes(3);
  });
  it('does not reuse a pre-import in-flight job for a strict waitForFresh read after an import commit', async () => {
    let finishOld!: (value: TokenDashboardData) => void;
    mocked.collect
      .mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce({ ...data(), totals: { ...data().totals, totalTokens: 69 } });
    const { refreshDashboardSnapshot } = await import('../adapters/runtime/refresh');
    const older = refreshDashboardSnapshot({ range: '30d', waitForFresh: true, prewarmSiblings: false });
    await vi.waitFor(() => expect(mocked.collect).toHaveBeenCalledTimes(1));
    mkdirSync(join(home, '.incept'), { recursive: true });
    writeFileSync(join(home, '.incept/dashboard-imports.db'), 'new-import-committed');
    const strict = await refreshDashboardSnapshot({ range: '30d', waitForFresh: true, prewarmSiblings: false });
    expect(strict.totals.totalTokens).toBe(69);
    finishOld({ ...data(), totals: { ...data().totals, totalTokens: 19 } });
    expect((await older).totals.totalTokens).toBe(19);
    const cache = await import('../adapters/runtime/snapshot-store');
    expect((await cache.readDashboardSnapshot('30d'))?.totals.totalTokens).toBe(69);
  });
});
