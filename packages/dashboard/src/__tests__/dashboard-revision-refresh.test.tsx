// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDashboard, type TokenDashboardData } from '../domain';
import { useDashboardWindow } from '../react/hooks/use-dashboard-window';

vi.mock('../react/hooks/client-snapshots', () => ({ clientSnapshot: () => undefined, rememberSnapshot: () => {} }));

const roles = [
  { name: 'public', options: {}, revisionVisible: false },
  { name: 'pro', options: { canViewDetails: true }, revisionVisible: false },
  { name: 'owner', options: { owner: true }, revisionVisible: true },
] as const;
const reply = (value: TokenDashboardData) => ({ ok: true, json: async () => value });
function snapshot(revision: number, revisionVisible = true, checkedAt = `2026-10-20T01:${revision === 387 ? '00' : '01'}:00Z`) {
  const data = { ...emptyDashboard('all'), checkedAt };
  data.totals.totalTokens = revision === 387 ? 4_558_021_501 : 4_558_021_518;
  if (revisionVisible) data.sync = { readMode: 'v2', dataRevision: revision, remote: false };
  return data;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('an open dashboard follows newly committed usage', () => {
  for (const role of roles) {
    it(`${role.name} receives the new Token total at the next visible 60-second poll without collecting usage`, async () => {
      const initial = snapshot(387, role.revisionVisible), next = snapshot(388, role.revisionVisible);
      const fetch = vi.fn().mockResolvedValue(reply(next));
      vi.stubGlobal('fetch', fetch);
      const { result } = renderHook(() => useDashboardWindow(initial, role.options));
      expect(result.current.data.totals.totalTokens).toBe(4_558_021_501);
      expect(fetch).not.toHaveBeenCalled();
      await act(async () => { await vi.advanceTimersByTimeAsync(59_999); });
      expect(fetch).not.toHaveBeenCalled();
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(result.current.data.totals.totalTokens).toBe(4_558_021_518);
      expect(result.current.data.checkedAt).toBe(next.checkedAt);
      if (role.revisionVisible) expect(result.current.data.sync?.dataRevision).toBe(388);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(String(fetch.mock.calls[0][0])).not.toContain('refresh=1');
      expect(fetch.mock.calls[0][1]).toMatchObject({ cache: 'no-store' });
      expect(result.current.refreshError).toBe(false);
    });

    it(`${role.name} refreshes immediately when a hidden page becomes visible`, async () => {
      const fetch = vi.fn().mockResolvedValue(reply(snapshot(388, role.revisionVisible)));
      vi.stubGlobal('fetch', fetch);
      const { result } = renderHook(() => useDashboardWindow(snapshot(387, role.revisionVisible), role.options));
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(180_000); });
      expect(fetch).not.toHaveBeenCalled();
      expect(result.current.isPollingPaused).toBe(true);
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result.current.data.totals.totalTokens).toBe(4_558_021_518);
      expect(result.current.isPollingPaused).toBe(false);
    });
  }

  it('rejects a lower v2 revision even if the stale backend response has a newer checkedAt', async () => {
    const latest = snapshot(388);
    const fetch = vi.fn().mockResolvedValue(reply(snapshot(387, true, '2026-10-20T02:00:00Z')));
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useDashboardWindow(latest, { owner: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.data.sync?.dataRevision).toBe(388);
    expect(result.current.data.totals.totalTokens).toBe(4_558_021_518);
    expect(result.current.refreshError).toBe(true);
    expect(result.current.isRefreshing).toBe(false);
  });

  it('public data retains the last snapshot when checkedAt goes backwards', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(snapshot(387, false))));
    const { result } = renderHook(() => useDashboardWindow(snapshot(388, false)));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.data.totals.totalTokens).toBe(4_558_021_518);
    expect(result.current.refreshError).toBe(true);
  });

  it('an aborted earlier request cannot replace a newer accepted response', async () => {
    let resolveOld!: (value: ReturnType<typeof reply>) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValue(reply(snapshot(388)));
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useDashboardWindow(snapshot(387), { canViewDetails: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    await act(async () => { result.current.refresh(); });
    expect(result.current.data.sync?.dataRevision).toBe(388);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => { resolveOld(reply(snapshot(387))); });
    expect(result.current.data.sync?.dataRevision).toBe(388);
    expect(result.current.data.totals.totalTokens).toBe(4_558_021_518);
    expect(result.current.refreshError).toBe(false);
  });
});
