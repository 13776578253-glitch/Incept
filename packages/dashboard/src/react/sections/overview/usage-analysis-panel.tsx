'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { DailyUsagePoint } from '../../../domain';
import type { DashboardWindow } from '../../hooks/use-dashboard-window';
import type { OverviewState } from './use-overview-state';
import { AnalysisControls } from './analysis-controls';
import { TrendChart } from './trend-chart';
import { PeriodSummary } from './period-summary';
import { UsageCalendar } from './usage-calendar';
import { ModelHeatmap } from './model-heatmap';
import { ReferenceCostPeriodSummary, ReferenceCostTrend } from './reference-cost-trend';
import type { BillingPreview } from '../../hooks/use-billing-preview';

type UsageAnalysisPanelProps = {
  setSelectedTrendIndex: DashboardWindow['setSelectedTrendIndex'];
  filteredDaily: DailyUsagePoint[];
  billingPreview?: BillingPreview;
} & Pick<OverviewState, 'activityView' | 'setActivityView'
  | 'trendMetric' | 'setTrendMetric' | 'trendItems' | 'activeTrendIndex' | 'selectedPeriodItem'
  | 'maxTrendValue' | 'matrixModels'>;

export function UsageAnalysisPanel(props: UsageAnalysisPanelProps) {
  const t = useTranslations('dashboard');
  const { activityView, filteredDaily, matrixModels, selectedPeriodItem, billingPreview } = props;
  const [selectedBillingDay, setSelectedBillingDay] = useState<string>();
  const trendScrollLeftRef = useRef<number | undefined>(undefined);
  const referenceTrend = activityView === 'trend' && props.trendMetric === 'cost' && billingPreview;
  const firstDate = filteredDaily[0]?.date;
  const activeBillingDay = selectedPeriodItem?.fullLabel ?? selectedBillingDay;
  const handleSelectBillingDay = (day: string) => {
    const index = filteredDaily.findIndex(point => point.date === day);
    if (index >= 0) {
      props.setSelectedTrendIndex(index);
      setSelectedBillingDay(undefined);
    } else {
      setSelectedBillingDay(day);
    }
  };
  return (
    <div className="dashboard-analysis-panel" role="region" aria-label={t('overview.trend.title')}>
      <div className="dashboard-analysis-header">
        <h3 className="text-[0.95rem] font-semibold text-[var(--color-text)]">{t('overview.trend.title')}</h3>
        <AnalysisControls {...props} />
      </div>
      <div className="dashboard-analysis-body">
        <div className="dashboard-analysis-viewport dashboard-subtle-scrollbar">
          {activityView === 'trend' ? referenceTrend ? (
            <ReferenceCostTrend
              preview={referenceTrend}
              selectedDay={activeBillingDay}
              onSelectDay={handleSelectBillingDay}
              firstDate={firstDate}
              initialScrollLeft={trendScrollLeftRef.current}
              onScrollLeftChange={scrollLeft => { trendScrollLeftRef.current = scrollLeft; }}
            />
          ) : (
            <TrendChart
              {...props}
              initialScrollLeft={trendScrollLeftRef.current}
              onScrollLeftChange={scrollLeft => { trendScrollLeftRef.current = scrollLeft; }}
            />
          ) : null}
          {activityView === 'calendar' ? <UsageCalendar points={filteredDaily}
            selectedDate={selectedPeriodItem?.fullLabel}
            onSelect={props.setSelectedTrendIndex} /> : null}
          {activityView === 'matrix' ? <ModelHeatmap points={filteredDaily} models={matrixModels} /> : null}
        </div>
        <div className="dashboard-analysis-footer">
          {referenceTrend ? <ReferenceCostPeriodSummary preview={referenceTrend} selectedDay={activeBillingDay} firstDate={firstDate} />
            : activityView === 'matrix' ? <p className="text-[0.7rem] text-[var(--color-nav-muted)]">{t('overview.trend.matrixHint', { count: matrixModels.length })}</p>
              : <PeriodSummary selectedPeriodItem={selectedPeriodItem} />}
        </div>
      </div>
    </div>
  );
}
