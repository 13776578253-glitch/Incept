import { useCallback, useEffect, useRef, useState } from 'react';
import type { TokenDashboardData, UsageRange } from '../../domain';
import { dashboardEndpoints } from '../../endpoints';
import { emptyDashboard } from '../../domain';
import { clientSnapshot, rememberSnapshot } from './client-snapshots';

export const DASHBOARD_REFRESH_INTERVAL = 60_000;

export function useDashboardWindow(initialData: TokenDashboardData, options: { refreshOnMount?: boolean; initialHasSnapshot?: boolean; owner?: boolean; canViewDetails?: boolean } = {}) {
  const scope = options.owner ? 'owner' : options.canViewDetails ? 'pro' : 'public';
  const [data, setData] = useState(() => {
    const cached = clientSnapshot(initialData.range ?? '30d', scope);
    return cached && (Date.parse(cached.checkedAt ?? '') || 0) > (Date.parse(initialData.checkedAt ?? '') || 0) ? cached : initialData;
  });
  const [hasSnapshot, setHasSnapshot] = useState(options.initialHasSnapshot !== false || !!clientSnapshot(initialData.range ?? '30d', scope));
  const [showingHistory, setShowingHistory] = useState(!!options.refreshOnMount && hasSnapshot);
  const [rangePreset, setRangePreset] = useState<UsageRange>(initialData.range ?? '30d');
  const [selectedTrendIndex, setSelectedTrendIndex] = useState(999);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [refreshCycle, setRefreshCycle] = useState(0);
  const [isPollingPaused, setIsPollingPaused] = useState(false);
  const refreshRef = useRef<() => void>(() => {});
  const activeRange = useRef(rangePreset);
  const refreshOnMount = useRef(!!options.refreshOnMount);
  useEffect(() => { rememberSnapshot(initialData, scope); }, [initialData, scope]);

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
        if (force && options.owner) query.set('refresh', '1');
        const response = await fetch(dashboardEndpoints.usage + '?' + query, { cache: 'no-store', signal: current.signal });
        if (!response.ok) throw new Error('Usage refresh failed');
        const next = await response.json() as TokenDashboardData;
        if (next.range !== rangePreset) throw new Error('Usage window mismatch');
        if (!disposed && !current.signal.aborted) {
          setData(next);
          rememberSnapshot(next, scope);
          setHasSnapshot(true);
          setShowingHistory(false);
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
      const previous = clientSnapshot(rangePreset, scope);
      if (previous) { setData(previous); setHasSnapshot(true); setShowingHistory(true); }
      else { setData(emptyDashboard(rangePreset)); setHasSnapshot(false); setShowingHistory(false); }
      void request();
    } else if (refreshOnMount.current) {
      refreshOnMount.current = false;
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
  }, [rangePreset, scope, options.owner]);

  const refresh = useCallback(() => refreshRef.current(), []);
  return { data, rangePreset, setRangePreset, selectedTrendIndex, setSelectedTrendIndex,
    filteredDaily: data.daily, hasSnapshot, showingHistory, isRefreshing, refreshError, refresh, refreshCycle, isPollingPaused };
}

export type DashboardWindow = ReturnType<typeof useDashboardWindow>;
