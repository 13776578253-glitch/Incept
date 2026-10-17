'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { TokenDashboardData } from '../../domain';
import { formatDateTimeShort } from '../formatters';
import { DASHBOARD_REFRESH_INTERVAL } from '../hooks/use-dashboard-window';
import type { DashboardWindow } from '../hooks/use-dashboard-window';
import { ImportIcon } from '../imports/import-icons';

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
};

export function DashboardToolbar({ rangePreset, setRangePreset, setSelectedTrendIndex,
  data, isRefreshing, refreshError, onRefresh, refreshCycle, isPollingPaused, onOpenImport, hasSnapshot = true, showingHistory = false }: DashboardToolbarProps) {
  const t = useTranslations('dashboard');
  const [activeSection, setActiveSection] = useState('#overview');
  useEffect(() => {
    const update = () => {
      const sections = ['overview', 'models', 'costs', 'projects'];
      const current = sections.filter(id => (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= 160).at(-1);
      setActiveSection('#' + (current ?? 'overview'));
    };
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <header className="pb-4 md:pb-5">
      <h1 className="sr-only">{t('page.title')}</h1>
      <p role="status" aria-atomic="true" className="sr-only">
        {!hasSnapshot || showingHistory ? t(hasSnapshot ? 'page.showingHistory' : 'page.loadingFirst') : ''}
      </p>
      <div className="space-y-2.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Dashboard sections" className="dashboard-segmented">
            {(['overview', 'models', 'costs', 'projects'] as const).map(section => (
              <a key={section} href={'#' + section} aria-current={activeSection === '#' + section ? 'location' : undefined}
                data-active={activeSection === '#' + section} onClick={() => setActiveSection('#' + section)}>{t(`nav.${section}`)}</a>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[0.72rem] tabular-nums text-[var(--color-nav-muted)] mr-1 hidden sm:inline-block">
              {t('page.updatedAt', { time: data.updatedAt ? formatDateTimeShort(data.updatedAt) : '—' })}
            </span>
            <div className="dashboard-segmented" role="group" aria-label={t('page.window')}>
              {(['7d', '30d', 'all'] as const).map(preset => (
                <button key={preset} type="button" aria-pressed={rangePreset === preset} data-active={rangePreset === preset}
                  onClick={() => { setRangePreset(preset); setSelectedTrendIndex(999); }}>
                  {t(preset === 'all' ? 'page.rangeAll' : `page.range${preset}`)}
                </button>
              ))}
            </div>
            <button type="button" onClick={onRefresh} disabled={isRefreshing}
              className="dashboard-refresh-button">
              {t(isRefreshing ? 'page.refreshing' : 'page.refresh')}
            </button>
            {onOpenImport ? <button type="button" onClick={onOpenImport} className="dashboard-import-button">
              <span className="text-[var(--color-text-muted)]"><ImportIcon /></span>{t('imports.open')}
            </button> : null}
          </div>
        </div>
        <div className="dashboard-refresh-area">
          <div role="progressbar" aria-label={t(isRefreshing ? 'page.refreshing' : 'page.autoRefresh')}
            aria-busy={isRefreshing} className="dashboard-refresh-track" data-running={isRefreshing} data-paused={isPollingPaused}
            style={{ animationDuration: DASHBOARD_REFRESH_INTERVAL + 'ms' }}>
            <span key={refreshCycle} />
          </div>
          <span role="status" className={refreshError ? 'dashboard-refresh-error' : 'sr-only'}>
            {refreshError ? t(hasSnapshot ? 'page.refreshFailed' : 'page.firstLoadFailed') : ''}
          </span>
        </div>
      </div>
    </header>
  );
}
