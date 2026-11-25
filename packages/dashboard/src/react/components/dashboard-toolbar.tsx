'use client';

import { useTranslations } from 'next-intl';
import type { TokenDashboardData } from '../../domain';
import { formatDateTimeShort } from '../formatters';
import { DASHBOARD_REFRESH_INTERVAL } from '../hooks/use-dashboard-window';
import type { DashboardWindow } from '../hooks/use-dashboard-window';
import { ImportIcon } from '../imports/import-icons';
import type { RemoteStatus } from '../hooks/remote-refresh';

type DashboardToolbarProps = {
  rangePreset: DashboardWindow['rangePreset'];
  setRangePreset: DashboardWindow['setRangePreset'];
  setSelectedTrendIndex: DashboardWindow['setSelectedTrendIndex'];
  viewMode?: 'range' | 'day';
  onSelectRangeMode?: () => void;
  onSelectSingleDay?: () => void;
  onOpenDiagnostics?: () => void;
  diagnosticsBadge?: boolean;
  diagnosticsAlertCount?: number;
  data: TokenDashboardData;
  isRefreshing: boolean;
  refreshError: boolean;
  onRefresh: () => void;
  refreshCycle: number;
  isPollingPaused: boolean;
  onOpenImport?: () => void;
  hasSnapshot?: boolean;
  showingHistory?: boolean;
  remoteInfo?: RemoteStatus | null;
  remoteDevice?: string;
  setRemoteDevice?: (id: string) => void;
  remoteState?: string;
  refreshInterval?: number;
  lastPageUpdatedAt?: string;
};

export function DashboardToolbar({
  rangePreset,
  setRangePreset,
  setSelectedTrendIndex,
  viewMode = 'range',
  onSelectRangeMode,
  onSelectSingleDay,
  onOpenDiagnostics,
  diagnosticsBadge = false,
  diagnosticsAlertCount = 0,
  data,
  isRefreshing,
  refreshError,
  onRefresh,
  refreshCycle,
  isPollingPaused,
  onOpenImport,
  hasSnapshot = true,
  showingHistory = false,
  remoteInfo,
  remoteDevice,
  setRemoteDevice,
  remoteState,
  refreshInterval = DASHBOARD_REFRESH_INTERVAL,
}: DashboardToolbarProps) {
  const t = useTranslations('dashboard');
  const selectedDevice = remoteInfo?.devices.find((d) => d.id === remoteDevice);
  const job = selectedDevice?.lastJob;
  // "offline" describes the remote link, not the device, so it gets its own wording.
  const phaseLabel = (state?: string) =>
    t(state === 'offline' ? 'remote.unreachable' : 'remote.' + (state || 'idle'));
  const remoteText = remoteInfo
    ? [t(selectedDevice?.online ? 'remote.online' : 'remote.offline'), phaseLabel(remoteState)].join(' · ')
    : '';
  const refreshState = phaseLabel(remoteState || job?.phase);
  const historyReviews = job?.reviewTotal ?? 0;
  const legacyImportedAt = data.sync?.readMode === 'v2' ? data.sync.legacyImportedAt : undefined;
  const alertCount = diagnosticsAlertCount > 0 ? diagnosticsAlertCount : diagnosticsBadge ? 1 : 0;
  const needsRemoteAttention =
    Boolean(remoteInfo) &&
    (remoteState === 'needs_review' ||
      remoteState === 'failed' ||
      remoteState === 'offline' ||
      !selectedDevice?.online);

  return (
    <header className="pb-3.5">
      <h1 className="sr-only">{t('page.title')}</h1>
      <p role="status" aria-atomic="true" className="sr-only">
        {!hasSnapshot || showingHistory ? t(hasSnapshot ? 'page.showingHistory' : 'page.loadingFirst') : ''}
      </p>
      <p
        role="status"
        aria-atomic="true"
        data-remote-phase={remoteInfo ? remoteState || 'idle' : undefined}
        data-remote-online={remoteInfo ? String(!!selectedDevice?.online) : undefined}
        className="sr-only"
      >
        {remoteText}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="dashboard-segmented" role="group" aria-label={t('page.window')}>
          {onSelectSingleDay ? (
            <button
              type="button"
              aria-pressed={viewMode === 'day'}
              data-active={viewMode === 'day'}
              onClick={onSelectSingleDay}
            >
              {t('workbench.range1d')}
            </button>
          ) : null}
          {(['7d', '30d', 'all'] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={viewMode === 'range' && rangePreset === preset}
              data-active={viewMode === 'range' && rangePreset === preset}
              onClick={() => {
                onSelectRangeMode?.();
                setRangePreset(preset);
                setSelectedTrendIndex(999);
              }}
            >
              {t(preset === 'all' ? 'page.rangeAll' : `page.range${preset}`)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5">
          {refreshError ? (
            <span
              role="status"
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--badge-rose-border)] bg-[var(--badge-rose-bg)] px-2.5 text-[0.7rem] font-medium text-[var(--badge-rose-fg)]"
            >
              <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--badge-rose-dot)]" />
              <span>{t(hasSnapshot ? 'page.refreshFailed' : 'page.firstLoadFailed')}</span>
            </span>
          ) : null}

          <div className="flex flex-col items-end gap-1">
            <span className="font-mono text-[0.71rem] tabular-nums text-[var(--color-nav-muted)]">
              {t('page.updatedAt', { time: data.updatedAt ? formatDateTimeShort(data.updatedAt) : '—' })}
            </span>
            <div className="dashboard-refresh-short-track">
              <div
                role="progressbar"
                aria-label={t(isRefreshing ? 'page.refreshing' : 'page.autoRefresh')}
                aria-busy={isRefreshing}
                className="dashboard-refresh-track"
                data-running={isRefreshing}
                data-paused={isPollingPaused}
                style={{ animationDuration: refreshInterval + 'ms' }}
              >
                <span key={refreshCycle} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {remoteInfo ? (
              <div className="group relative flex items-center">
                {remoteInfo.devices.length > 1 ? (
                  <select
                    aria-label={t('remote.device')}
                    className="dashboard-refresh-button"
                    value={remoteDevice}
                    disabled={isRefreshing}
                    onChange={(e) => setRemoteDevice?.(e.target.value)}
                  >
                    {remoteInfo.devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} · {t(d.online ? 'remote.online' : 'remote.offline')}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span
                    tabIndex={0}
                    className="dashboard-refresh-button is-static"
                    title={selectedDevice?.name}
                  >
                    <span
                      aria-hidden="true"
                      className={`size-1.5 rounded-full ${
                        needsRemoteAttention
                          ? 'bg-[var(--badge-amber-dot)]'
                          : selectedDevice?.online
                            ? 'bg-[var(--badge-emerald-dot)]'
                            : 'bg-[var(--color-text-soft)]'
                      }`}
                    />
                    <span>
                      {t('remote.device')} · {t(selectedDevice?.online ? 'remote.online' : 'remote.offline')}
                    </span>
                    {remoteState === 'needs_review' ? (
                      <span className="rounded-full bg-[var(--badge-amber-bg)] px-1.5 py-0 text-[0.64rem] text-[var(--badge-amber-fg)]">
                        {phaseLabel('needs_review')}
                      </span>
                    ) : null}
                  </span>
                )}

                <div
                  data-testid="sync-timeline"
                  className="dashboard-sync-popover space-y-1.5 text-[0.7rem] tabular-nums text-[var(--color-text-muted)]"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border-faint)] pb-1 text-[0.68rem] font-medium text-[var(--color-text)]">
                    <span>{t('workbench.remoteSyncTitle')}</span>
                    <span className="text-[var(--color-text-soft)]">{refreshState}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>{t('remote.collected')} </span>
                    <span className="font-mono text-[var(--color-text)]">
                      {selectedDevice?.lastCollectedAt ? formatDateTimeShort(selectedDevice.lastCollectedAt) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>{t('remote.cloudCommitted')} </span>
                    <span className="font-mono text-[var(--color-text)]">
                      {selectedDevice?.lastCommittedAt ? formatDateTimeShort(selectedDevice.lastCommittedAt) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>{t('remote.thisRefresh')} </span>
                    <span className="font-mono text-[var(--color-text)]">
                      {refreshState}
                      {job?.dataRevision !== null && job?.dataRevision !== undefined ? ` · rev ${job.dataRevision}` : ''}
                      {job?.newTokens ? ` · +${job.newTokens} tokens` : ''}
                    </span>
                  </div>
                  {historyReviews > 0 ? (
                    <div className="flex items-center justify-between gap-3 text-[var(--badge-amber-fg)]">
                      <span>{t('remote.historyReviews')} </span>
                      <span className="font-mono font-medium">{historyReviews}</span>
                    </div>
                  ) : null}
                  {legacyImportedAt ? (
                    <div className="flex items-center justify-between gap-3">
                      <span>{t('remote.v1Imported')} </span>
                      <span className="font-mono text-[var(--color-text)]">
                        {formatDateTimeShort(legacyImportedAt)}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {onOpenDiagnostics ? (
              <button
                type="button"
                aria-label={t('workbench.diagnosticsOpen')}
                onClick={onOpenDiagnostics}
                className="dashboard-import-button cursor-pointer"
              >
                <span>{t('workbench.diagnosticsOpen')}</span>
                {alertCount > 0 ? (
                  <span
                    aria-hidden="true"
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--badge-amber-bg)] px-1.5 py-0.5 font-mono text-[0.65rem] font-medium leading-none text-[var(--badge-amber-fg)]"
                  >
                    <span className="size-1.5 rounded-full bg-[var(--badge-amber-dot)]" />
                    {diagnosticsAlertCount > 0 ? diagnosticsAlertCount : null}
                  </span>
                ) : null}
              </button>
            ) : null}

            {onOpenImport ? (
              <button type="button" onClick={onOpenImport} className="dashboard-import-button cursor-pointer">
                <span className="text-[var(--color-text-muted)]">
                  <ImportIcon />
                </span>
                <span>{t('imports.open')}</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="dashboard-refresh-button cursor-pointer"
            >
              {isRefreshing && remoteInfo && remoteState
                ? phaseLabel(remoteState)
                : t(isRefreshing ? 'page.refreshing' : 'page.refresh')}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
