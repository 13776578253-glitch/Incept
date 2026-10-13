import { useCallback, useEffect, useRef, useState } from 'react';
import type { TokenDashboardData, UsageRange } from '../../domain';
import { dashboardEndpoints } from '../../endpoints';

export const DASHBOARD_REFRESH_INTERVAL = 60_000;

export function useDashboardWindow(initialData: TokenDashboardData) {
  const [data, setData] = useState(initialData);
  const [rangePreset, setRangePreset] = useState<UsageRange>(initialData.range ?? '30d');
  const [selectedTrendIndex, setSelectedTrendIndex] = useState(999);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [refreshCycle, setRefreshCycle] = useState(0);
  const [isPollingPaused, setIsPollingPaused] = useState(false);
  const refreshRef = useRef<() => void>(() => {});
  const activeRange = useRef(rangePreset);

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    let controller: AbortController | undefined;

    function clearTimer() {
      window.clearTimeout(timer);
      timer = undefined;
    }

    function scheduleNext() {
      clearTimer();
      const hidden = document.visibilityState === 'hidden';
      setIsPollingPaused(hidden);
      if (disposed || hidden) return;
      setRefreshCycle(cycle => cycle + 1);
      timer = window.setTimeout(() => { void request(); }, DASHBOARD_REFRESH_INTERVAL);
    }

    async function request(force = false) {
      clearTimer();
      if (document.visibilityState === 'hidden' && !force) {
        setIsPollingPaused(true);
        return;
      }
      controller?.abort();
      const current = new AbortController();
      controller = current;
      setIsRefreshing(true);
      try {
        const query = new URLSearchParams({ range: rangePreset });
        if (force) query.set('refresh', '1');
        const response = await fetch(dashboardEndpoints.usage + '?' + query, { cache: 'no-store', signal: current.signal });
        if (!response.ok) throw new Error('Usage refresh failed');
        const next = await response.json() as TokenDashboardData;
        if (next.range !== rangePreset) throw new Error('Usage window mismatch');
        if (!disposed && !current.signal.aborted) {
          setData(next);
          setRefreshError(false);
        }
      } catch {
        if (!disposed && !current.signal.aborted) setRefreshError(true);
      } finally {
        if (!disposed && !current.signal.aborted) {
          setIsRefreshing(false);
          scheduleNext();
        }
      }
    }

    refreshRef.current = () => { void request(true); };
    setIsRefreshing(false);
    if (activeRange.current !== rangePreset) {
      activeRange.current = rangePreset;
      void request();
    } else {
      scheduleNext();
    }
    const onVisible = () => {
      const hidden = document.visibilityState === 'hidden';
      setIsPollingPaused(hidden);
      if (hidden) clearTimer();
      else void request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      controller?.abort();
      clearTimer();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [rangePreset]);

  const refresh = useCallback(() => refreshRef.current(), []);
  return { data, rangePreset, setRangePreset, selectedTrendIndex, setSelectedTrendIndex,
    filteredDaily: data.daily, isRefreshing, refreshError, refresh, refreshCycle, isPollingPaused };
}

export type DashboardWindow = ReturnType<typeof useDashboardWindow>;
