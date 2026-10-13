'use client';

import { useTranslations } from 'next-intl';
import type { DailyUsagePoint } from '../../../domain';
import type { DashboardWindow } from '../../hooks/use-dashboard-window';
import type { OverviewState } from './use-overview-state';
import { AnalysisControls } from './analysis-controls';
import { TrendChart } from './trend-chart';
import { PeriodSummary } from './period-summary';
import { UsageCalendar } from './usage-calendar';
import { ModelHeatmap } from './model-heatmap';

type UsageAnalysisPanelProps = {
  setSelectedTrendIndex: DashboardWindow['setSelectedTrendIndex'];
  filteredDaily: DailyUsagePoint[];
} & Pick<OverviewState, 'activityView' | 'setActivityView'
  | 'trendMetric' | 'setTrendMetric' | 'trendItems' | 'activeTrendIndex' | 'selectedPeriodItem'
  | 'maxTrendValue' | 'matrixModels'>;

export function UsageAnalysisPanel(props: UsageAnalysisPanelProps) {
  const t = useTranslations('dashboard');
  const { activityView, filteredDaily, matrixModels, selectedPeriodItem } = props;
  return (
    <div className="dashboard-analysis-panel" role="region" aria-label={t('overview.trend.title')}>
      <div className="dashboard-analysis-header">
        <h3 className="text-[0.95rem] font-semibold text-[var(--color-text)]">{t('overview.trend.title')}</h3>
        <AnalysisControls {...props} />
      </div>
      <div className="dashboard-analysis-body">
        <div className="dashboard-analysis-viewport dashboard-subtle-scrollbar">
          {activityView === 'trend' ? <TrendChart {...props} /> : null}
          {activityView === 'calendar' ? <UsageCalendar points={filteredDaily}
            selectedDate={selectedPeriodItem?.fullLabel}
            onSelect={props.setSelectedTrendIndex} /> : null}
          {activityView === 'matrix' ? <ModelHeatmap points={filteredDaily} models={matrixModels} /> : null}
        </div>
        <div className="dashboard-analysis-footer">
          {activityView === 'matrix' ? <p className="text-[0.7rem] text-[var(--color-nav-muted)]">{t('overview.trend.matrixHint', { count: matrixModels.length })}</p>
            : <PeriodSummary selectedPeriodItem={selectedPeriodItem} />}
        </div>
      </div>
    </div>
  );
}
