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
};

export function DashboardToolbar({ rangePreset, setRangePreset, setSelectedTrendIndex,
  data, isRefreshing, refreshError, onRefresh, refreshCycle, isPollingPaused, onOpenImport }: DashboardToolbarProps) {
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
    <header className="space-y-6 pb-6 md:space-y-7 md:pb-7">
      <div className="space-y-2 md:space-y-2.5">
        <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">{t('page.eyebrow')}</p>
        <h1 className="text-[2rem] font-semibold tracking-[-0.05em] text-[var(--color-text)] md:text-[2.45rem] md:leading-[1.08]">{t('page.title')}</h1>
        <p className="text-[0.78rem] tabular-nums text-[var(--color-nav-muted)]">{t('page.updatedAt', { time: data.updatedAt ? formatDateTimeShort(data.updatedAt) : '—' })}</p>
      </div>
      <div className="space-y-2.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Dashboard sections" className="dashboard-segmented">
            {(['overview', 'models', 'costs', 'projects'] as const).map(section => (
              <a key={section} href={'#' + section} aria-current={activeSection === '#' + section ? 'location' : undefined}
                data-active={activeSection === '#' + section} onClick={() => setActiveSection('#' + section)}>{t(`nav.${section}`)}</a>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-2">
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
            {refreshError ? t('page.refreshFailed') : ''}
          </span>
        </div>
      </div>
    </header>
  );
}
