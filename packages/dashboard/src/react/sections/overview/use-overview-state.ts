import { useMemo, useState } from 'react';
import type { DailyUsagePoint, TokenDashboardData } from '../../../domain/index';
import { formatShortDate } from '../../formatters';

export function useOverviewState(filteredDaily: DailyUsagePoint[], data: TokenDashboardData, selectedTrendIndex: number) {
  const [activityView, setActivityView] = useState<'trend' | 'calendar' | 'matrix'>('trend');

  const [trendMetric, setTrendMetric] = useState<'tokens' | 'stacked' | 'models' | 'cost'>('tokens');

  const [showAllOverviewModels, setShowAllOverviewModels] = useState<boolean>(false);

  const trendItems = useMemo(() => filteredDaily.map(point => ({
    ...point,
    label: formatShortDate(point.date),
    fullLabel: point.date,
  })), [filteredDaily]);

  const activeTrendIndex = Math.min(selectedTrendIndex, Math.max(0, trendItems.length - 1));

  const selectedPeriodItem = trendItems[activeTrendIndex] ?? trendItems[0];

  const maxTrendValue = useMemo(() => {
    if(!trendItems.length) return 1;
    if(trendMetric === 'cost') {
      return Math.max(0.01, ...trendItems.map((item) => item.cost));
    }
    return Math.max(1, ...trendItems.map((item) => item.totalTokens));
  }, [trendItems, trendMetric]);

  const matrixModels = useMemo(() => {
    const windowModelTotals = new Map<string, number>();
    for(const d of filteredDaily) {
      for(const mb of d.modelBreakdowns) {
        const tot = mb.inputTokens + mb.outputTokens + mb.cacheReadTokens + mb.cacheCreationTokens + (mb.reasoningTokens ?? 0);
        windowModelTotals.set(
          mb.modelName,
          (windowModelTotals.get(mb.modelName) ?? 0) + tot,
        );
      }
    }
    return data.models
      .filter((m) => (windowModelTotals.get(m.modelName) ?? 0) > 0)
      .sort(
        (a, b) =>
          (windowModelTotals.get(b.modelName) ?? 0) -
          (windowModelTotals.get(a.modelName) ?? 0),
      )
      .slice(0, 10);
  }, [data.models, filteredDaily]);

  const maxModelTokens = useMemo(
    () => Math.max(1, ...data.models.map((m) => m.totalTokens)),
    [data.models],
  );

  const overviewModelsVisible = showAllOverviewModels
    ? data.models
    : data.models.slice(0, 10);

  return { activityView, setActivityView, trendMetric, setTrendMetric, showAllOverviewModels, setShowAllOverviewModels, trendItems, activeTrendIndex, selectedPeriodItem, maxTrendValue, matrixModels, maxModelTokens, overviewModelsVisible };
}

export type OverviewState = ReturnType<typeof useOverviewState>;
