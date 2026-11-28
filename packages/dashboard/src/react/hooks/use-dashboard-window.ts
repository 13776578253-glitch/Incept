import { useCallback, useEffect, useRef, useState } from 'react';
import type { TokenDashboardData, UsageRange } from '../../domain';
import { dashboardEndpoints } from '../../endpoints';
import { emptyDashboard, publicDashboardSummary } from '../../domain';
import { clearSnapshots, clientSnapshot, rememberSnapshot } from './client-snapshots';
import {
  fetchRemoteJob,
  isTerminalRemoteJobStatus,
  loadActiveRemoteJob,
  pollRemoteJob,
  remoteStatus,
  saveActiveRemoteJob,
  startOrResumeRemoteJob,
  type PersistedRemoteJob,
  type RemoteJob,
  type RemoteStatus,
} from './remote-refresh';

export const DASHBOARD_REFRESH_INTERVAL = 60_000;
const STILL_SYNCING_POLL_MS = 10_000;
const SNAPSHOT_LAG_DEFAULT_RETRY_MS = 3_000;
const SNAPSHOT_LAG_MAX_ATTEMPTS = 60;

export type SnapshotLagState = {
  targetRevision: number;
  publishedRevision: number;
};

type SnapshotUpdatingReply = {
  error?: string;
  targetRevision?: number;
  publishedRevision?: number;
  retryAfterSeconds?: number;
};

function olderSnapshot(next: TokenDashboardData, previous: TokenDashboardData) {
  if (next.range !== previous.range) return false;
  const nextRevision = next.sync?.readMode === 'v2' ? next.sync.dataRevision : undefined;
  const previousRevision = previous.sync?.readMode === 'v2' ? previous.sync.dataRevision : undefined;
  if (typeof nextRevision === 'number' && typeof previousRevision === 'number' &&
    Number.isSafeInteger(nextRevision) && Number.isSafeInteger(previousRevision) && nextRevision !== previousRevision) {
    return nextRevision < previousRevision;
  }
  const nextTime = Date.parse(next.checkedAt ?? ''), previousTime = Date.parse(previous.checkedAt ?? '');
  return Number.isFinite(previousTime) && (!Number.isFinite(nextTime) || nextTime < previousTime);
}

function parseRetryAfterMs(response: Response, fallbackMs = SNAPSHOT_LAG_DEFAULT_RETRY_MS) {
  const header = response.headers?.get('Retry-After');
  const parsed = header ? Number(header) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return Math.min(15_000, Math.max(1_000, Math.round(parsed * 1_000)));
  return fallbackMs;
}

export function useDashboardWindow(initialData: TokenDashboardData, options: { refreshOnMount?: boolean; initialHasSnapshot?: boolean; owner?: boolean; canViewDetails?: boolean; initialValidator?: string; loadRemoteOnMount?: boolean } = {}) {
  const remoteEnabled = !!options.owner && !!initialData.sync?.remote;
  const scope = (options.owner ? 'owner' : options.canViewDetails ? 'pro' : 'public') + (remoteEnabled ? ':remote:' + initialData.sync?.readMode : '');
  const [remoteInfo, setRemoteInfo] = useState<RemoteStatus | null>(null);
  const [remoteDevice, setRemoteDevice] = useState('');
  const [remoteState, setRemoteState] = useState('idle');
  const [isRemoteSyncing, setIsRemoteSyncing] = useState(false);
  const [activeRemoteJobId, setActiveRemoteJobId] = useState<string | null>(() => (remoteEnabled ? loadActiveRemoteJob()?.jobId ?? null : null));
  const [snapshotLag, setSnapshotLag] = useState<SnapshotLagState | null>(null);
  const remoteInfoRef = useRef<RemoteStatus | null>(null);
  const deviceRef = useRef(remoteDevice);
  useEffect(() => { deviceRef.current = remoteDevice; }, [remoteDevice]);
  const activeJobRef = useRef<PersistedRemoteJob | null>(remoteEnabled ? loadActiveRemoteJob() : null);
  const pendingTargetRevisionRef = useRef<number | null>(null);
  const pendingCompletedPhaseRef = useRef<string>('');
  const pendingCompletedStatusRef = useRef<string>('');
  const interval = remoteEnabled ? Math.max(300000, Math.min(600000, initialData.sync?.intervalMs ?? 300000)) : DASHBOARD_REFRESH_INTERVAL;
  const [data, setData] = useState(() => {
    const cached = clientSnapshot(initialData.range ?? '30d', scope);
    return cached && olderSnapshot(initialData, cached) ? cached : initialData;
  });
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  const [lastPageUpdatedAt, setLastPageUpdatedAt] = useState(initialData.checkedAt);
  const [hasSnapshot, setHasSnapshot] = useState(options.initialHasSnapshot !== false || !!clientSnapshot(initialData.range ?? '30d', scope));
  const [showingHistory, setShowingHistory] = useState(!!options.refreshOnMount && hasSnapshot);
  const [rangePreset, setRangePreset] = useState<UsageRange>(initialData.range ?? '30d');
  const [selectedTrendIndex, setSelectedTrendIndex] = useState(999);
  const [isRefreshing, setIsRefreshing] = useState(() => !!options.refreshOnMount && !hasSnapshot);
  const [refreshError, setRefreshError] = useState(false);
  const [refreshCycle, setRefreshCycle] = useState(0);
  const [revalidationCycle, setRevalidationCycle] = useState(0);
  const [isPollingPaused, setIsPollingPaused] = useState(false);
  // Server-confirmed access reduction withdraws Owner-only affordances (e.g. Billing) immediately.
  const initialRole: 'owner' | 'pro' | 'guest' = options.owner ? 'owner' : options.canViewDetails ? 'pro' : 'guest';
  const [downgrade, setDowngrade] = useState<{ base: string; role: 'owner' | 'pro' | 'guest' } | null>(null);
  const viewerRole = downgrade && downgrade.base === initialRole ? downgrade.role : initialRole;
  const refreshRef = useRef<() => void>(() => {});
  const refreshChartsRef = useRef<() => void>(() => {});
  const triggerRemoteSyncRef = useRef<() => void>(() => {});
  const activeRange = useRef(rangePreset);

  const setTrackedJob = useCallback((job: PersistedRemoteJob | null) => {
    activeJobRef.current = job;
    setActiveRemoteJobId(job?.jobId ?? null);
    saveActiveRemoteJob(job);
  }, []);

  useEffect(() => {
    if (!remoteEnabled || !options.loadRemoteOnMount) return;
    const controller = new AbortController();
    void remoteStatus(controller.signal).then(info => {
      if (controller.signal.aborted) return;
      remoteInfoRef.current = info;
      setRemoteInfo(info);
      const nextDevice = info.devices.find(device => device.id === deviceRef.current) ?? info.devices[0];
      if (!deviceRef.current && nextDevice) {
        deviceRef.current = nextDevice.id;
        setRemoteDevice(nextDevice.id);
      }
      const serverActiveJob = nextDevice?.lastJob && !isTerminalRemoteJobStatus(nextDevice.lastJob.status) && nextDevice.lastJob.id
        ? { jobId: nextDevice.lastJob.id, deviceId: nextDevice.id, startedAt: Date.now() }
        : null;
      if (serverActiveJob && !activeJobRef.current) {
        setTrackedJob(serverActiveJob);
        setRemoteState('still_syncing');
      } else if (nextDevice?.lastJob?.phase && !activeJobRef.current) {
        setRemoteState(nextDevice.lastJob.phase);
      }
    }).catch(() => {});
    return () => controller.abort();
  }, [remoteEnabled, options.loadRemoteOnMount, setTrackedJob]);

  const refreshOnMount = useRef(!!options.refreshOnMount);
  const initialSnapshot = useRef({ data: initialData, validator: options.initialValidator });
  useEffect(() => { rememberSnapshot(initialData, scope); }, [initialData, scope]);

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    let jobFollowTimer: number | undefined;
    let snapshotLagTimer: number | undefined;
    let controller: AbortController | undefined;
    let remoteJobController: AbortController | undefined;
    let isRemoteBusy = false;
    let recheckAttempt = 0;
    let snapshotLagAttempt = 0;
    let inFlightForce = false;

    function clearTimer() {
      window.clearTimeout(timer);
      timer = undefined;
    }

    function clearJobFollowTimer() {
      window.clearTimeout(jobFollowTimer);
      jobFollowTimer = undefined;
    }

    function clearSnapshotLagTimer() {
      window.clearTimeout(snapshotLagTimer);
      snapshotLagTimer = undefined;
    }

    function scheduleNext() {
      clearTimer();
      const hidden = document.visibilityState === 'hidden';
      setIsPollingPaused(hidden);
      if (disposed || hidden) return;
      setRefreshCycle(cycle => cycle + 1);
      timer = window.setTimeout(() => { void requestUsage(false, 'poll'); }, interval);
    }

    // A stale-while-revalidate answer is followed by a short bounded re-check rather than the 60s poll.
    function scheduleRecheck() {
      clearTimer();
      if (disposed || document.visibilityState === 'hidden') return;
      recheckAttempt += 1;
      const delay = Math.min(15_000, 1_500 * 2 ** (recheckAttempt - 1));
      timer = window.setTimeout(() => { void requestUsage(false, 'recheck'); }, delay);
    }

    function scheduleSnapshotLagRetry(delayMs: number) {
      clearSnapshotLagTimer();
      if (disposed || document.visibilityState === 'hidden') return;
      if (pendingTargetRevisionRef.current === null || snapshotLagAttempt >= SNAPSHOT_LAG_MAX_ATTEMPTS) return;
      snapshotLagAttempt += 1;
      snapshotLagTimer = window.setTimeout(() => {
        void requestUsage(false, 'snapshot_retry', {
          minRevision: pendingTargetRevisionRef.current ?? undefined,
          nonBlockingMinRevision: true,
        });
      }, delayMs);
    }

    function scheduleStillSyncingFollowup() {
      clearJobFollowTimer();
      if (disposed || document.visibilityState === 'hidden' || !activeJobRef.current || isRemoteBusy) return;
      jobFollowTimer = window.setTimeout(() => {
        void checkTrackedJobOnce();
      }, STILL_SYNCING_POLL_MS);
    }

    function applyRemoteInfo(info: RemoteStatus, keepCurrentPhase: boolean) {
      remoteInfoRef.current = info;
      setRemoteInfo(info);
      if (!deviceRef.current && info.devices.length) {
        deviceRef.current = info.devices[0].id;
        setRemoteDevice(deviceRef.current);
      }
      const selected = info.devices.find(device => device.id === deviceRef.current);
      if (selected?.lastJob && !isTerminalRemoteJobStatus(selected.lastJob.status) && selected.lastJob.id && !activeJobRef.current) {
        setTrackedJob({ jobId: selected.lastJob.id, deviceId: selected.id, startedAt: Date.now() });
        setRemoteState('still_syncing');
        scheduleStillSyncingFollowup();
        return;
      }
      if (!keepCurrentPhase && !activeJobRef.current && pendingTargetRevisionRef.current === null && selected?.lastJob?.phase) {
        setRemoteState(selected.lastJob.phase);
      }
    }

    async function handleTerminalJob(job: RemoteJob) {
      setTrackedJob(null);
      clearJobFollowTimer();
      const completedStatus = job.status;
      const completedPhase = job.phase ?? job.status;
      if (completedStatus === 'completed' || completedStatus === 'completed_no_change') {
        const targetRevision = job.dataRevision !== null ? job.dataRevision : undefined;
        pendingTargetRevisionRef.current = targetRevision ?? null;
        pendingCompletedPhaseRef.current = completedPhase;
        pendingCompletedStatusRef.current = completedStatus;
        snapshotLagAttempt = 0;
        const currentChartRev = dataRef.current.sync?.readMode === 'v2' ? (dataRef.current.sync.dataRevision ?? 0) : undefined;
        if (targetRevision !== undefined && currentChartRev !== undefined && currentChartRev < targetRevision) {
          setSnapshotLag({ targetRevision, publishedRevision: currentChartRev });
          setRemoteState('updating_charts');
        }
        await requestUsage(false, 'manual', {
          minRevision: targetRevision,
          completedStatus,
          completedPhase,
        });
        return;
      }
      if (['partial', 'review_required', 'offline', 'expired', 'cancelled'].includes(completedStatus)) {
        pendingTargetRevisionRef.current = null;
        setSnapshotLag(null);
        await requestUsage(false, 'manual', {
          completedStatus,
          completedPhase: completedStatus === 'review_required' ? 'review_required' : completedPhase,
        });
        return;
      }
      throw Error('REMOTE_JOB_' + completedStatus);
    }

    async function checkTrackedJobOnce() {
      const tracked = activeJobRef.current;
      if (!tracked || disposed || isRemoteBusy) return;
      clearJobFollowTimer();
      const checkController = new AbortController();
      remoteJobController = checkController;
      try {
        const job = await fetchRemoteJob(tracked.jobId, checkController.signal);
        if (disposed || checkController.signal.aborted) return;
        if (isTerminalRemoteJobStatus(job.status)) {
          await handleTerminalJob(job);
        } else {
          setRemoteState('still_syncing');
          setRefreshError(false);
          scheduleStillSyncingFollowup();
        }
      } catch {
        if (!disposed && !checkController.signal.aborted && activeJobRef.current) {
          scheduleStillSyncingFollowup();
        }
      } finally {
        if (remoteJobController === checkController) remoteJobController = undefined;
      }
    }

    async function runRemoteCapture() {
      if (!remoteEnabled || isRemoteBusy) return;
      clearTimer();
      clearJobFollowTimer();
      clearSnapshotLagTimer();
      isRemoteBusy = true;
      setIsRemoteSyncing(true);
      setIsRefreshing(true);
      setRefreshError(false);
      remoteJobController?.abort();
      const jobController = new AbortController();
      remoteJobController = jobController;
      try {
        const info = await remoteStatus(jobController.signal);
        if (disposed || jobController.signal.aborted) return;
        applyRemoteInfo(info, true);
        if (!deviceRef.current) throw Error('NO_REMOTE_DEVICE');
        const existingJobId = activeJobRef.current?.deviceId === deviceRef.current ? activeJobRef.current.jobId : null;
        const initialJob = await startOrResumeRemoteJob(deviceRef.current, existingJobId, jobController.signal);
        if (disposed || jobController.signal.aborted) return;
        if (!isTerminalRemoteJobStatus(initialJob.status)) {
          setTrackedJob({ jobId: initialJob.id, deviceId: deviceRef.current, startedAt: activeJobRef.current?.startedAt ?? Date.now() });
        }
        const { job, timedOut } = await pollRemoteJob(initialJob, j => {
          const phase = j.phase ?? (['completed', 'completed_no_change'].includes(j.status) ? 'reading' : j.status);
          if (!disposed && !jobController.signal.aborted) {
            setRemoteState(['committed', 'no_change'].includes(phase) ? 'committing' : phase);
          }
        }, jobController.signal);
        if (disposed || jobController.signal.aborted) return;
        if (timedOut) {
          // Retain Job ID and keep tracking in the background instead of showing a generic failure.
          setTrackedJob({ jobId: job.id, deviceId: deviceRef.current, startedAt: activeJobRef.current?.startedAt ?? Date.now() });
          setRemoteState('still_syncing');
          setRefreshError(false);
          return;
        }
        await handleTerminalJob(job);
      } catch {
        if (!disposed && !jobController.signal.aborted) {
          setRefreshError(true);
          setRemoteState(previous => ['offline', 'expired', 'cancelled', 'review_required', 'partial', 'still_syncing', 'updating_charts'].includes(previous) ? previous : 'failed');
        }
      } finally {
        if (remoteJobController === jobController) remoteJobController = undefined;
        isRemoteBusy = false;
        if (!disposed && !jobController.signal.aborted) {
          setIsRemoteSyncing(false);
          setIsRefreshing(false);
          if (activeJobRef.current) scheduleStillSyncingFollowup();
        }
      }
    }

    async function requestUsage(
      force = false,
      reason: 'mount' | 'range' | 'poll' | 'visible' | 'manual' | 'recheck' | 'snapshot_retry' = force ? 'manual' : 'poll',
      extra: { minRevision?: number; nonBlockingMinRevision?: boolean; completedStatus?: string; completedPhase?: string } = {},
    ) {
      clearTimer();
      clearSnapshotLagTimer();
      if (document.visibilityState === 'hidden' && !force && reason !== 'manual') {
        setIsPollingPaused(true);
        return;
      }
      if (reason !== 'recheck') recheckAttempt = 0;
      let isStaleSwr = false;
      let shouldFastRecheck = false;
      let retryLagMs: number | null = null;
      controller?.abort();
      const current = new AbortController();
      controller = current;
      inFlightForce = force || reason === 'manual';
      if (reason !== 'recheck' && reason !== 'snapshot_retry') setIsRefreshing(true);
      try {
        const query = new URLSearchParams({ range: rangePreset });
        const requestedMinRevision = extra.minRevision ?? (pendingTargetRevisionRef.current ?? undefined);
        if (remoteEnabled && requestedMinRevision !== undefined && requestedMinRevision > 0) {
          query.set('minRevision', String(requestedMinRevision));
          if (extra.nonBlockingMinRevision) query.set('wait', '0');
        }
        if (remoteEnabled && !isRemoteBusy && (reason === 'poll' || reason === 'visible' || reason === 'manual' && !extra.completedStatus || !remoteInfoRef.current)) {
          void remoteStatus(current.signal).then(info => {
            if (disposed || current.signal.aborted) return;
            applyRemoteInfo(info, false);
          }).catch(() => {});
        } else if (!remoteEnabled && force && options.owner) {
          query.set('refresh', '1');
        }
        const initial = initialSnapshot.current;
        const validator = !force && reason !== 'manual' && reason !== 'snapshot_retry' && !options.owner && initial.data.range === rangePreset && dataRef.current === initial.data
          ? initial.validator
          : undefined;
        const response = await fetch(dashboardEndpoints.usage + '?' + query, {
          cache: 'no-store',
          signal: current.signal,
          ...(validator ? { headers: { 'If-None-Match': validator } } : {}),
        });
        const responseRole = response.headers?.get('X-Incept-Dashboard-Role');
        const currentRole = options.owner ? 'owner' : options.canViewDetails ? 'pro' : 'guest';
        const roleRank = { guest: 0, pro: 1, owner: 2 };
        const validRole = responseRole === 'guest' || responseRole === 'pro' || responseRole === 'owner'
          ? responseRole
          : undefined;
        const accessReduced = validRole !== undefined && roleRank[validRole] < roleRank[currentRole];
        if (accessReduced && !disposed && !current.signal.aborted) {
          setDowngrade({ base: initialRole, role: validRole as 'owner' | 'pro' | 'guest' });
          clearSnapshots(scope);
          const empty = emptyDashboard(rangePreset);
          dataRef.current = empty;
          setData(empty);
          setHasSnapshot(false);
          setShowingHistory(false);
        }
        if (response.status === 304 && validator && (!validRole || validRole === currentRole)) {
          if (!disposed && !current.signal.aborted) {
            setLastPageUpdatedAt(new Date().toISOString());
            setHasSnapshot(true);
            setShowingHistory(false);
            setRefreshError(false);
          }
          return;
        }
        if (!response.ok) {
          if (response.status === 503 && remoteEnabled && requestedMinRevision !== undefined) {
            let body: SnapshotUpdatingReply | undefined;
            try { body = await response.json() as SnapshotUpdatingReply; } catch { /* Non-JSON 503. */ }
            if (body?.error === 'SNAPSHOT_UPDATING') {
              const target = typeof body.targetRevision === 'number' ? body.targetRevision : requestedMinRevision;
              const published = typeof body.publishedRevision === 'number'
                ? body.publishedRevision
                : (dataRef.current.sync?.dataRevision ?? 0);
              if (!disposed && !current.signal.aborted) {
                pendingTargetRevisionRef.current = target;
                setSnapshotLag({ targetRevision: target, publishedRevision: published });
                setRemoteState('updating_charts');
                setRefreshError(false);
                retryLagMs = parseRetryAfterMs(response, (body.retryAfterSeconds ?? 3) * 1_000);
              }
              return;
            }
          }
          throw new Error('Usage refresh failed');
        }
        let next = await response.json() as TokenDashboardData;
        if (disposed || current.signal.aborted) return;
        if (validRole && roleRank[validRole] > roleRank[currentRole]) {
          next = publicDashboardSummary(next, currentRole === 'pro');
        }
        if (next.range !== rangePreset) throw new Error('Usage window mismatch');
        if (remoteEnabled && requestedMinRevision !== undefined && next.sync?.readMode === 'v2' && (next.sync.dataRevision ?? -1) < requestedMinRevision) {
          if (!disposed && !current.signal.aborted) {
            pendingTargetRevisionRef.current = requestedMinRevision;
            setSnapshotLag({ targetRevision: requestedMinRevision, publishedRevision: next.sync.dataRevision ?? 0 });
            setRemoteState('updating_charts');
            setRefreshError(false);
            retryLagMs = SNAPSHOT_LAG_DEFAULT_RETRY_MS;
          }
          return;
        }
        if (!disposed && !current.signal.aborted) {
          if (olderSnapshot(next, dataRef.current)) throw new Error('STALE_USAGE_SNAPSHOT');
          const checkedAtMs = Date.parse(next.checkedAt ?? '');
          isStaleSwr = !accessReduced && !force && reason !== 'manual' && (next.revalidating === true
            || (!!options.owner && !remoteEnabled && next.sync?.readMode !== 'v2' && Number.isFinite(checkedAtMs) && Date.now() - checkedAtMs >= 15_000));
          shouldFastRecheck = isStaleSwr && recheckAttempt < 8;
          const clean = { ...next }; delete clean.revalidating;
          next = clean;
          dataRef.current = next;
          setData(next);
          rememberSnapshot(next, accessReduced ? (validRole === 'pro' ? 'pro' : 'public') : scope);
          setLastPageUpdatedAt(new Date().toISOString());
          setHasSnapshot(Number.isFinite(checkedAtMs));
          setShowingHistory(isStaleSwr);
          setRefreshError(false);
          const satisfiedLag = pendingTargetRevisionRef.current !== null
            && (next.sync?.readMode !== 'v2' || (next.sync.dataRevision ?? -1) >= pendingTargetRevisionRef.current);
          if (satisfiedLag) {
            pendingTargetRevisionRef.current = null;
            snapshotLagAttempt = 0;
            setSnapshotLag(null);
          }
          const resolvedStatus = extra.completedStatus || (satisfiedLag ? pendingCompletedStatusRef.current : '');
          const resolvedPhase = extra.completedPhase || (satisfiedLag ? pendingCompletedPhaseRef.current : '');
          if (resolvedStatus) {
            pendingCompletedStatusRef.current = '';
            pendingCompletedPhaseRef.current = '';
            setRemoteState(next.sync?.readMode === 'v2' ? resolvedPhase : resolvedStatus === 'completed' ? 'stored_v2' : resolvedPhase);
            void remoteStatus(current.signal).then(info => {
              if (!disposed && !current.signal.aborted) {
                remoteInfoRef.current = info;
                setRemoteInfo(info);
              }
            }).catch(() => {});
          }
        }
      } catch {
        if (!disposed && !current.signal.aborted) {
          setRefreshError(true);
          if ((force || extra.completedStatus) && remoteEnabled) {
            setRemoteState(previous => ['offline', 'expired', 'cancelled', 'review_required', 'partial', 'still_syncing', 'updating_charts'].includes(previous) ? previous : 'failed');
          }
        }
      } finally {
        if (controller === current) {
          inFlightForce = false;
        }
        if (!disposed && !current.signal.aborted) {
          if (!isRemoteBusy) setIsRefreshing(false);
          if (retryLagMs !== null) {
            scheduleSnapshotLagRetry(retryLagMs);
          } else if (shouldFastRecheck) {
            scheduleRecheck();
          } else if (isStaleSwr) {
            scheduleNext();
          } else {
            if (reason === 'poll' || reason === 'visible' || reason === 'manual' || reason === 'recheck' || reason === 'snapshot_retry') {
              setRevalidationCycle(cycle => cycle + 1);
            }
            recheckAttempt = 0;
            scheduleNext();
          }
        }
      }
    }

    refreshChartsRef.current = () => {
      if (remoteEnabled) {
        void requestUsage(false, 'manual', {
          minRevision: pendingTargetRevisionRef.current ?? undefined,
          nonBlockingMinRevision: pendingTargetRevisionRef.current !== null,
        });
      } else {
        void requestUsage(true, 'manual');
      }
    };
    triggerRemoteSyncRef.current = () => {
      if (remoteEnabled) void runRemoteCapture();
      else void requestUsage(true, 'manual');
    };
    refreshRef.current = () => {
      if (remoteEnabled) void runRemoteCapture();
      else void requestUsage(true, 'manual');
    };

    // Preserve the existing synchronous range/history hydration contract.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsRefreshing(false);
    if (activeRange.current !== rangePreset) {
      activeRange.current = rangePreset;
      const previous = clientSnapshot(rangePreset, scope);
      if (previous) { dataRef.current = previous; setData(previous); setHasSnapshot(true); setShowingHistory(true); }
      else { const empty = emptyDashboard(rangePreset); dataRef.current = empty; setData(empty); setHasSnapshot(false); setShowingHistory(false); }
      void requestUsage(false, 'range');
    } else if (refreshOnMount.current) {
      refreshOnMount.current = false;
      void requestUsage(false, 'mount');
    } else {
      scheduleNext();
    }
    if (remoteEnabled && activeJobRef.current && document.visibilityState !== 'hidden') {
      setRemoteState('still_syncing');
      void checkTrackedJobOnce();
    }
    const onVisible = () => {
      const hidden = document.visibilityState === 'hidden';
      setIsPollingPaused(hidden);
      if (hidden) {
        clearTimer();
        clearJobFollowTimer();
        clearSnapshotLagTimer();
        if (!inFlightForce && controller) {
          controller.abort();
          controller = undefined;
          if (!isRemoteBusy) setIsRefreshing(false);
        }
      } else {
        if (remoteEnabled && activeJobRef.current && !isRemoteBusy) {
          void checkTrackedJobOnce();
        }
        if (remoteEnabled && pendingTargetRevisionRef.current !== null) {
          void requestUsage(false, 'snapshot_retry', {
            minRevision: pendingTargetRevisionRef.current,
            nonBlockingMinRevision: true,
          });
        } else if (!isRemoteBusy) {
          void requestUsage(false, 'visible');
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      controller?.abort();
      remoteJobController?.abort();
      clearTimer();
      clearJobFollowTimer();
      clearSnapshotLagTimer();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [rangePreset, scope, options.owner, options.canViewDetails, remoteEnabled, interval, setTrackedJob]);

  const refresh = useCallback(() => refreshRef.current(), []);
  const refreshCharts = useCallback(() => refreshChartsRef.current(), []);
  const triggerRemoteSync = useCallback(() => triggerRemoteSyncRef.current(), []);
  return {
    data, rangePreset, setRangePreset, selectedTrendIndex, setSelectedTrendIndex,
    filteredDaily: data.daily, hasSnapshot, showingHistory, isRefreshing, isRemoteSyncing,
    activeRemoteJobId, snapshotLag, refreshError, refresh, refreshCharts, triggerRemoteSync,
    refreshCycle, revalidationCycle, viewerRole, isPollingPaused, remoteInfo, remoteDevice,
    setRemoteDevice, remoteState, refreshInterval: interval, lastPageUpdatedAt,
  };
}

export type DashboardWindow = ReturnType<typeof useDashboardWindow>;
