'use client';

import { useTranslations } from 'next-intl';
import type { DailyUsagePoint, TokenDashboardData } from '../../../domain/index';
import { SectionHeader } from '../../components/section-header';
import { useOverviewState } from './use-overview-state';
import type { DashboardWindow } from '../../hooks/use-dashboard-window';
import { OverviewMetrics } from './overview-metrics';
import { UsageAnalysisPanel } from './usage-analysis-panel';
import { ModelDistributionPanel } from './model-distribution-panel';

type OverviewSectionProps = {
  data: TokenDashboardData;
  filteredDaily: DailyUsagePoint[];
  selectedTrendIndex: number;
  setSelectedTrendIndex: DashboardWindow['setSelectedTrendIndex'];
};

export function OverviewSection({
  data,
  filteredDaily,
  selectedTrendIndex,
  setSelectedTrendIndex,
}: OverviewSectionProps) {
  const t = useTranslations('dashboard');
  const {
    activityView,
    setActivityView,
    trendMetric,
    setTrendMetric,
    showAllOverviewModels,
    setShowAllOverviewModels,
    trendItems,
    activeTrendIndex,
    selectedPeriodItem,
    maxTrendValue,
    matrixModels,
    maxModelTokens,
    overviewModelsVisible,
  } = useOverviewState(filteredDaily, data, selectedTrendIndex);

  return (
    <section aria-labelledby="overview" className="space-y-5">
      <SectionHeader
        id="overview"
        eyebrow={t('overview.eyebrow')}
        title={t('overview.title')}
        description={t('overview.description')}
        accentColor="var(--badge-sky-dot)"
      />

      {/* 4 Core KPI Cards */}
      <OverviewMetrics data={data} />

      {/* Full-width analysis followed by an independent ranking panel */}
      <div className="grid min-w-0 grid-cols-1 gap-5">
        {/* Full-width usage analysis */}
        <UsageAnalysisPanel
          activityView={activityView}
          setActivityView={setActivityView}
          trendMetric={trendMetric}
          setTrendMetric={setTrendMetric}
          setSelectedTrendIndex={setSelectedTrendIndex}
          filteredDaily={filteredDaily}
          trendItems={trendItems}
          activeTrendIndex={activeTrendIndex}
          selectedPeriodItem={selectedPeriodItem}
          maxTrendValue={maxTrendValue}
          matrixModels={matrixModels}
        />

        {/* Model throughput ranking below analysis */}
        <ModelDistributionPanel
          showAllOverviewModels={showAllOverviewModels}
          setShowAllOverviewModels={setShowAllOverviewModels}
          maxModelTokens={maxModelTokens}
          overviewModelsVisible={overviewModelsVisible}
          data={data}
        />
      </div>
    </section>
  );
}
