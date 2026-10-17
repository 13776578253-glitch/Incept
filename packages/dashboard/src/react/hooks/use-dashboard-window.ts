import { useCallback, useEffect, useRef, useState } from 'react';
import type { TokenDashboardData, UsageRange } from '../../domain';
import { dashboardEndpoints } from '../../endpoints';
import { emptyDashboard } from '../../domain';
import { clientSnapshot, rememberSnapshot } from './client-snapshots';
import {remoteRefresh,remoteStatus,type RemoteStatus} from './remote-refresh';

export const DASHBOARD_REFRESH_INTERVAL = 60_000;

export function useDashboardWindow(initialData: TokenDashboardData, options: { refreshOnMount?: boolean; initialHasSnapshot?: boolean; owner?: boolean; canViewDetails?: boolean } = {}) {
  const remoteEnabled=!!options.owner&&!!initialData.sync?.remote;
  const scope = (options.owner ? 'owner' : options.canViewDetails ? 'pro' : 'public')+(remoteEnabled?':remote:'+initialData.sync?.readMode:'');
  const [remoteInfo,setRemoteInfo]=useState<RemoteStatus|null>(null),[remoteDevice,setRemoteDevice]=useState(''),[remoteState,setRemoteState]=useState('idle');
  const deviceRef=useRef(remoteDevice);useEffect(()=>{deviceRef.current=remoteDevice;},[remoteDevice]);
  const interval=remoteEnabled?Math.max(300000,Math.min(600000,initialData.sync?.intervalMs??300000)):DASHBOARD_REFRESH_INTERVAL;
  const [data, setData] = useState(() => {
    const cached = clientSnapshot(initialData.range ?? '30d', scope);
    return cached && (Date.parse(cached.checkedAt ?? '') || 0) > (Date.parse(initialData.checkedAt ?? '') || 0) ? cached : initialData;
  });
  const [lastPageUpdatedAt, setLastPageUpdatedAt] = useState(initialData.checkedAt);
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
      timer = window.setTimeout(() => { void request(); }, interval);
    }

    async function request(force = false) {
      if(force&&remoteEnabled&&isRemoteBusy)return;
      clearTimer();
      if (document.visibilityState === 'hidden' && !force) {
        setIsPollingPaused(true);
        return;
      }
      controller?.abort();
      const current = new AbortController();
      controller = current;
      setIsRefreshing(true);
      if(force&&remoteEnabled)isRemoteBusy=true;
      try {
        const query = new URLSearchParams({ range: rangePreset });
        let completedStatus='',completedPhase='';
        if(remoteEnabled){const info=await remoteStatus(current.signal);if(!disposed){setRemoteInfo(info);if(!deviceRef.current&&info.devices.length){deviceRef.current=info.devices[0].id;setRemoteDevice(deviceRef.current);}
          const selected=info.devices.find(device=>device.id===deviceRef.current);
          if(!force&&selected?.lastJob?.phase)setRemoteState(selected.lastJob.phase);}
          if(force){if(!deviceRef.current)throw Error('NO_REMOTE_DEVICE');const job=await remoteRefresh(deviceRef.current,j=>{const phase=j.phase??(['completed','completed_no_change'].includes(j.status)?'reading':j.status);if(!disposed)setRemoteState(['committed','no_change'].includes(phase)?'committing':phase);},current.signal);completedStatus=job.status;completedPhase=job.phase??job.status;
            if(job.status==='completed'||job.status==='completed_no_change'){if(job.dataRevision!==null)query.set('minRevision',String(job.dataRevision));}
            else if(!['partial','review_required','offline','expired','cancelled'].includes(job.status))throw Error('REMOTE_JOB_'+job.status);
          }
        }else if (force && options.owner) query.set('refresh', '1');
        const response = await fetch(dashboardEndpoints.usage + '?' + query, { cache: 'no-store', signal: current.signal });
        if (!response.ok) throw new Error('Usage refresh failed');
        const next = await response.json() as TokenDashboardData;
        if (next.range !== rangePreset) throw new Error('Usage window mismatch');
        if(remoteEnabled&&query.has('minRevision')&&next.sync?.readMode==='v2'&&(next.sync.dataRevision??-1)<Number(query.get('minRevision')))throw Error('REVISION_NOT_VISIBLE');
        if (!disposed && !current.signal.aborted) {
          setData(next);
          rememberSnapshot(next, scope);
          setLastPageUpdatedAt(new Date().toISOString());
          setHasSnapshot(true);
          setShowingHistory(false);
          setRefreshError(false);
          if(completedStatus){setRemoteState(next.sync?.readMode==='v2'?completedPhase:completedStatus==='completed'?'stored_v2':completedPhase);void remoteStatus(current.signal).then(info=>{if(!disposed&&!current.signal.aborted)setRemoteInfo(info);}).catch(()=>{});}
        }
      } catch {
        if (!disposed && !current.signal.aborted) {setRefreshError(true);if(force&&remoteEnabled)setRemoteState(previous=>['offline','expired','cancelled','review_required','partial'].includes(previous)?previous:'failed');}
      } finally {
        if(force&&remoteEnabled)isRemoteBusy=false;
        if (!disposed && !current.signal.aborted) {
          setIsRefreshing(false);
          scheduleNext();
        }
      }
    }
    let isRemoteBusy=false;

    refreshRef.current = () => { void request(true); };
    // Preserve the existing synchronous range/history hydration contract.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      else if(!isRemoteBusy)void request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      controller?.abort();
      clearTimer();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [rangePreset, scope, options.owner,remoteEnabled,interval]);

  const refresh = useCallback(() => refreshRef.current(), []);
  return { data, rangePreset, setRangePreset, selectedTrendIndex, setSelectedTrendIndex,
    filteredDaily: data.daily, hasSnapshot, showingHistory, isRefreshing, refreshError, refresh, refreshCycle, isPollingPaused,remoteInfo,remoteDevice,setRemoteDevice,remoteState,refreshInterval:interval,lastPageUpdatedAt };
}

export type DashboardWindow = ReturnType<typeof useDashboardWindow>;
