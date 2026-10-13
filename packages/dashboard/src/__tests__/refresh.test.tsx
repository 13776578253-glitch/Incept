// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboardWindow } from '../react/hooks/use-dashboard-window';
import type { TokenDashboardData, UsageRange } from '../domain';
import { emptyDashboard } from '../domain';

const snapshot = (range: UsageRange) => ({ range, daily: [], dateRange: { from: '2026-10-01', to: '2026-10-12', activeDays: 0 } }) as unknown as TokenDashboardData;
const response = (range: UsageRange) => ({ ok: true, json: async () => snapshot(range) });

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

describe('dashboard refresh', () => {
  it('shows history immediately, requests fresh data on entry and retains history if the request fails', async () => {
    const history = { ...emptyDashboard('30d'), checkedAt: '2026-10-10T00:00:00Z' };
    history.totals.totalTokens = 123;
    let fail!: (error: Error) => void;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise((_resolve, reject) => { fail = reject; })));
    const { result } = renderHook(() => useDashboardWindow(history, { refreshOnMount: true, initialHasSnapshot: true }));
    expect(result.current.data.totals.totalTokens).toBe(123); expect(result.current.isRefreshing).toBe(true);
    expect(result.current.showingHistory).toBe(true);
    await act(async () => { fail(new Error('offline')); });
    expect(result.current.data.totals.totalTokens).toBe(123); expect(result.current.refreshError).toBe(true);
  });
  it('resets the countdown after manual refresh and waits for an in-flight request to finish', async () => {
    let resolveRefresh!: (value: ReturnType<typeof response>) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveRefresh = resolve; }))
      .mockResolvedValue(response('7d'));
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useDashboardWindow(snapshot('7d')));
    const firstCycle = result.current.refreshCycle;
    await act(async () => { vi.advanceTimersByTime(15_000); result.current.refresh(); });
    expect(result.current.isRefreshing).toBe(true);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { resolveRefresh(response('7d')); });
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.refreshCycle).toBe(firstCycle + 1);
    await act(async () => { vi.advanceTimersByTime(59_999); });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('pauses the countdown when hidden and starts a new cycle on return', async () => {
    const fetch = vi.fn().mockResolvedValue(response('7d'));
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useDashboardWindow(snapshot('7d')));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); vi.advanceTimersByTime(60_000); });
    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.isPollingPaused).toBe(true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.isPollingPaused).toBe(false);
  });
  it('polls at 60 seconds, manually bypasses the cache and clears its timer', async () => {
    const fetch = vi.fn().mockResolvedValue(response('14d'));
    vi.stubGlobal('fetch', fetch);
    const { result, unmount } = renderHook(() => useDashboardWindow(snapshot('14d'), { owner: true }));
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toContain('range=14d');
    await act(async () => { result.current.refresh(); });
    expect(String(fetch.mock.calls[1][0])).toContain('refresh=1');
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores a stale response after switching ranges', async () => {
    let resolveOld!: (value: ReturnType<typeof response>) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValue(response('30d'));
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useDashboardWindow(snapshot('14d')));
    await act(async () => { result.current.setRangePreset('7d'); });
    await act(async () => { result.current.setRangePreset('30d'); });
    expect(result.current.data.range).toBe('30d');
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => { resolveOld(response('7d')); });
    expect(result.current.data.range).toBe('30d');
  });

  it('keeps the last good snapshot on failure and pauses while hidden', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetch);
    const initial = snapshot('14d');
    const { result } = renderHook(() => useDashboardWindow(initial));
    await act(async () => { result.current.refresh(); });
    expect(result.current.refreshError).toBe(true);
    expect(result.current.data).toBe(initial);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
