'use client';

import { useTranslations } from 'next-intl';
import type { TokenDashboardData } from '../../domain';
import { formatDateTimeShort } from '../formatters';
import { DASHBOARD_REFRESH_INTERVAL } from '../hooks/use-dashboard-window';
import type { DashboardWindow } from '../hooks/use-dashboard-window';
import { ImportIcon } from '../imports/import-icons';
import type {RemoteStatus} from '../hooks/remote-refresh';

type DashboardToolbarProps = {
  rangePreset: DashboardWindow['rangePreset'];
  setRangePreset: DashboardWindow['setRangePreset'];
  setSelectedTrendIndex: DashboardWindow['setSelectedTrendIndex'];
  data: TokenDashboardData;
  isRefreshing: boolean;
  refreshError: boolean;
  onRefresh: () => void;
  refreshCycle: number;
  isPollingPaused: boolean;
  onOpenImport?: () => void;
  hasSnapshot?: boolean;
  showingHistory?: boolean;
  remoteInfo?:RemoteStatus|null;remoteDevice?:string;setRemoteDevice?:(id:string)=>void;remoteState?:string;refreshInterval?:number;
  lastPageUpdatedAt?:string;
};

export function DashboardToolbar({ rangePreset, setRangePreset, setSelectedTrendIndex,
  data, isRefreshing, refreshError, onRefresh, refreshCycle, isPollingPaused, onOpenImport, hasSnapshot = true, showingHistory = false,remoteInfo,remoteDevice,setRemoteDevice,remoteState,refreshInterval=DASHBOARD_REFRESH_INTERVAL,lastPageUpdatedAt }: DashboardToolbarProps) {
  const t = useTranslations('dashboard');
  const selectedDevice=remoteInfo?.devices.find(d=>d.id===remoteDevice);
  const job=selectedDevice?.lastJob;
  const remoteText=remoteInfo?[t(selectedDevice?.online?'remote.online':'remote.offline'),t('remote.'+(remoteState||'idle'))].join(' · '):'';
  const refreshState=t('remote.'+(remoteState||job?.phase||'idle'));
  const historyReviews=job?.reviewTotal??0;
  const legacyImportedAt=data.sync?.readMode==='v2'?data.sync.legacyImportedAt:undefined;

  return (
    <header className="pb-4 md:pb-5">
      <h1 className="sr-only">{t('page.title')}</h1>
      <p role="status" aria-atomic="true" className="sr-only">
        {!hasSnapshot || showingHistory ? t(hasSnapshot ? 'page.showingHistory' : 'page.loadingFirst') : ''}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="dashboard-segmented" role="group" aria-label={t('page.window')}>
          {(['7d', '30d', 'all'] as const).map(preset => (
            <button key={preset} type="button" aria-pressed={rangePreset === preset} data-active={rangePreset === preset}
              onClick={() => { setRangePreset(preset); setSelectedTrendIndex(999); }}>
              {t(preset === 'all' ? 'page.rangeAll' : `page.range${preset}`)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end gap-1.5">
            <span className="font-mono text-[0.72rem] tabular-nums text-[var(--color-nav-muted)]">
              {t('page.updatedAt', { time: data.updatedAt ? formatDateTimeShort(data.updatedAt) : '—' })}
            </span>
            <div className="dashboard-refresh-short-track">
              <div role="progressbar" aria-label={t(isRefreshing ? 'page.refreshing' : 'page.autoRefresh')}
                aria-busy={isRefreshing} className="dashboard-refresh-track" data-running={isRefreshing} data-paused={isPollingPaused}
                style={{ animationDuration: refreshInterval + 'ms' }}>
                <span key={refreshCycle} />
              </div>
            </div>
            {refreshError ? (
              <span role="status" className="dashboard-refresh-error">
                {t(hasSnapshot ? 'page.refreshFailed' : 'page.firstLoadFailed')}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {remoteInfo&&<select aria-label={t('remote.device')} className="dashboard-refresh-button" value={remoteDevice} disabled={isRefreshing} onChange={e=>setRemoteDevice?.(e.target.value)}>{remoteInfo.devices.map(d=><option key={d.id} value={d.id}>{d.name} · {t(d.online?'remote.online':'remote.offline')}</option>)}</select>}
            {onOpenImport ? <button type="button" onClick={onOpenImport} className="dashboard-import-button">
              <span className="text-[var(--color-text-muted)]"><ImportIcon /></span>{t('imports.open')}
            </button> : null}
            <button type="button" onClick={onRefresh} disabled={isRefreshing}
              className="dashboard-refresh-button">
              {isRefreshing&&remoteInfo&&remoteState?t('remote.'+remoteState):t(isRefreshing ? 'page.refreshing' : 'page.refresh')}
            </button>
          </div>
        </div>
      </div>
      <p role="status" aria-atomic="true" data-remote-phase={remoteInfo?(remoteState||'idle'):undefined}
        data-remote-online={remoteInfo?String(!!selectedDevice?.online):undefined}
        title={remoteText} className="h-5 truncate text-[0.72rem] leading-5 text-[var(--color-nav-muted)]">{remoteText}</p>
        {remoteInfo?<div data-testid="sync-timeline" className="flex flex-wrap gap-x-4 gap-y-1 text-[0.68rem] tabular-nums text-[var(--color-nav-muted)]">
          <span>{t('remote.collected')}: {selectedDevice?.lastCollectedAt?formatDateTimeShort(selectedDevice.lastCollectedAt):'—'}</span>
          <span>{t('remote.cloudCommitted')}: {selectedDevice?.lastCommittedAt?formatDateTimeShort(selectedDevice.lastCommittedAt):'—'}</span>
          <span>{t('remote.webUpdated')}: {lastPageUpdatedAt?formatDateTimeShort(lastPageUpdatedAt):'—'}</span>
          <span>{t('remote.thisRefresh')}: {refreshState}{job?.dataRevision!==null&&job?.dataRevision!==undefined?` · rev ${job.dataRevision}`:''}{job?.newTokens?` · +${job.newTokens} tokens`:''}</span>
          <span>{t('remote.historyReviews')}: {historyReviews}</span>
          {legacyImportedAt?<span>{t('remote.v1Imported')}: {formatDateTimeShort(legacyImportedAt)}</span>:null}
        </div>:null}

    </header>
  );
}
