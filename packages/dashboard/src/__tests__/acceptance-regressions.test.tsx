// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDashboard, type BillingReadResponse, type TokenDashboardData, type UsageRange } from '../domain';
import { clearSnapshots } from '../react/hooks/client-snapshots';
import { useBillingPreview } from '../react/hooks/use-billing-preview';
import { useDashboardWindow } from '../react/hooks/use-dashboard-window';

const billing = (range: UsageRange): BillingReadResponse => ({
  range, estimatedCostUsd: '1.25', estimatedTokens: 60, unpricedTokens: 0, excludedTokens: 0,
  members: 2, tokens: 60, recordedUnknownCurrency: 0, asOf: '2026-11-25T01:00:00Z',
  run: 'fixture', revision: 1, catalog: 'fixture',
});

const usage = (range: UsageRange, totalTokens: number, age = 0, extra: Partial<TokenDashboardData> = {}) => {
  const data = emptyDashboard(range);
  return { ...data, checkedAt: new Date(Date.now() - age).toISOString(), totals: { ...data.totals, totalTokens }, ...extra } as TokenDashboardData;
};
const reply = (value: TokenDashboardData, role = 'owner') => ({ ok: true, headers: new Headers({ 'X-Incept-Dashboard-Role': role }), json: async () => value });

beforeEach(() => { vi.useFakeTimers(); vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible'); });
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  clearSnapshots('owner'); clearSnapshots('public');
});

describe('acceptance regressions', () => {
  it('exposes a server-confirmed Owner to Guest downgrade as the viewer role', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(usage('30d', 20), 'guest')));
    const { result } = renderHook(() => useDashboardWindow(usage('30d', 60), { owner: true }));
    expect(result.current.viewerRole).toBe('owner');
    await act(async () => { result.current.refresh(); });
    expect(result.current.viewerRole).toBe('guest');
    expect(result.current.data.totals.totalTokens).toBe(20);
  });

  it('keeps showing history while Owner SWR revalidates and re-checks in seconds, not at the 60s poll', async () => {
    const responses = [
      reply(usage('7d', 10, 86_400_000, { revalidating: true })),
      reply(usage('7d', 25)),
    ];
    const fetch = vi.fn(async () => responses.shift() ?? reply(usage('7d', 25)));
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useDashboardWindow(usage('30d', 30), { owner: true }));
    await act(async () => result.current.setRangePreset('7d'));
    expect(result.current.data.totals.totalTokens).toBe(10);
    expect(result.current.data.revalidating).toBeUndefined();
    expect(result.current.showingHistory).toBe(true);
    expect(result.current.isRefreshing).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.current.data.totals.totalTokens).toBe(25);
    expect(result.current.showingHistory).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(58_000); });
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(2_500); });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('bounds the stale re-check attempts while keeping showingHistory true until fresh data arrives', async () => {
    const fetch = vi.fn(async () => reply(usage('7d', 10, 86_400_000, { revalidating: true })));
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useDashboardWindow(usage('30d', 30), { owner: true }));
    await act(async () => result.current.setRangePreset('7d'));
    expect(result.current.showingHistory).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(82_500); });
    expect(fetch).toHaveBeenCalledTimes(9);
    expect(result.current.showingHistory).toBe(true);
  });

  it('aborts an in-flight non-forced recheck when the tab becomes hidden', async () => {
    let signal: AbortSignal | null | undefined;
    const fetch = vi.fn()
      .mockResolvedValueOnce(reply(usage('7d', 10, 86_400_000, { revalidating: true })))
      .mockImplementation((_url: string, options: RequestInit) => {
        signal = options.signal;
        return new Promise(() => {});
      });
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useDashboardWindow(usage('30d', 30), { owner: true }));
    await act(async () => result.current.setRangePreset('7d'));
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(signal?.aborted).toBe(true);
  });

  it('aborts inactive billing flights across all ranges when cycle or watermark advances', () => {
    const requests: { range: string | null; signal: AbortSignal }[] = [];
    vi.stubGlobal('fetch', (url: string, init: { signal: AbortSignal }) => {
      requests.push({ range: new URL(url, 'http://test.invalid').searchParams.get('range'), signal: init.signal });
      return new Promise(() => {});
    });
    const { rerender } = renderHook(
      ({ range, cycle, watermark }: { range: UsageRange; cycle: number; watermark: number }) =>
        useBillingPreview(true, range, cycle, watermark),
      { initialProps: { range: '30d', cycle: 0, watermark: 1 } },
    );
    rerender({ range: '7d', cycle: 0, watermark: 1 });
    rerender({ range: '7d', cycle: 1, watermark: 2 });
    expect(requests.map(r => [r.range, r.signal.aborted])).toEqual([['30d', true], ['7d', true], ['7d', false]]);
    rerender({ range: '30d', cycle: 1, watermark: 2 });
    expect(requests.map(r => [r.range, r.signal.aborted])).toEqual([['30d', true], ['7d', true], ['7d', false], ['30d', false]]);
  });

  it('keeps in-flight billing requests alive across A -> B -> A range switches without aborting or re-issuing', () => {
    const calls: { range: string | null; signal?: AbortSignal }[] = [];
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      calls.push({ range: new URL(url, 'http://test.invalid').searchParams.get('range'), signal: init?.signal ?? undefined });
      return new Promise(() => {});
    });
    const { rerender } = renderHook(({ range }: { range: UsageRange }) => useBillingPreview(true, range, 0), {
      initialProps: { range: '30d' },
    });
    rerender({ range: '7d' });
    rerender({ range: '30d' });
    expect(calls.map(call => [call.range, call.signal?.aborted])).toEqual([['30d', false], ['7d', false]]);
  });

  it('withdraws cached Owner billing immediately upon a Usage role downgrade', async () => {
    let role = 'owner';
    vi.stubGlobal('fetch', (url: string) => {
      const { pathname, searchParams } = new URL(url, 'http://test.invalid');
      const range = searchParams.get('range') as UsageRange;
      if (pathname.endsWith('/billing')) return Promise.resolve(Response.json(billing(range)));
      return Promise.resolve(reply(usage(range, 20), role));
    });
    const initial = usage('30d', 60);
    const { result } = renderHook(() => {
      const windowState = useDashboardWindow(initial, { owner: true });
      const preview = useBillingPreview(windowState.viewerRole === 'owner', windowState.rangePreset, windowState.revalidationCycle);
      return { windowState, preview };
    });
    await act(async () => {});
    expect(result.current.preview).toMatchObject({ status: 'ready', data: { range: '30d', estimatedCostUsd: '1.25' } });
    role = 'guest';
    await act(async () => { result.current.windowState.setRangePreset('7d'); });
    expect(result.current.windowState.viewerRole).toBe('guest');
    expect(result.current.preview).toBeUndefined();
  });
});
