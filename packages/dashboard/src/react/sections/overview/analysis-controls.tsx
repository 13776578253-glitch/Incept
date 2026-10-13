'use client';

import { useTranslations } from 'next-intl';
import type { OverviewState } from './use-overview-state';

type AnalysisControlsProps = Pick<OverviewState,
  'activityView' | 'setActivityView' | 'trendMetric' | 'setTrendMetric'>;

export function AnalysisControls({ activityView, setActivityView, trendMetric, setTrendMetric }: AnalysisControlsProps) {
  const t = useTranslations('dashboard');
  const metrics = [
    { id: 'tokens', label: 'metricTokens' },
    { id: 'stacked', label: 'metricStacked' },
    { id: 'models', label: 'metricModels' },
    { id: 'cost', label: 'metricCost' },
  ] as const;
  return (
    <div className="dashboard-analysis-controls">
      {activityView === 'trend' ? (
        <div className="dashboard-segmented is-compact" role="group" aria-label={t('overview.trend.metric')}>
          {metrics.map(metric => (
            <button key={metric.id} type="button" aria-pressed={trendMetric === metric.id}
              data-active={trendMetric === metric.id} onClick={() => setTrendMetric(metric.id)}>
              {t('overview.trend.' + metric.label)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="dashboard-segmented is-compact dashboard-view-tabs" role="group" aria-label={t('overview.trend.title')}>
        {([
          { id: 'trend', label: 'viewTrend' },
          { id: 'calendar', label: 'viewCalendar' },
          { id: 'matrix', label: 'viewMatrix' },
        ] as const).map(view => (
          <button key={view.id} type="button" aria-pressed={activityView === view.id}
            data-active={activityView === view.id} onClick={() => setActivityView(view.id)}>
            {t('overview.trend.' + view.label)}
          </button>
        ))}
      </div>
    </div>
  );
}
