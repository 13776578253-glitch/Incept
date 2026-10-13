import { emptyDashboard } from './empty-dashboard';
import type { TokenBreakdown, TokenDashboardData } from './types';

// Public data is constructed from an allowlist; never spread collected records.
function tokens(value: TokenBreakdown): TokenBreakdown {
  return {
    inputTokens: value.inputTokens, outputTokens: value.outputTokens,
    cacheReadTokens: value.cacheReadTokens, cacheCreationTokens: value.cacheCreationTokens,
    reasoningTokens: value.reasoningTokens, totalTokens: value.totalTokens, cost: value.cost,
  };
}

export function publicDashboardSummary(data: TokenDashboardData): TokenDashboardData {
  const result = emptyDashboard(data.range);
  return {
    ...result,
    updatedAt: data.updatedAt,
    checkedAt: data.checkedAt,
    dateRange: { from: data.dateRange.from, to: data.dateRange.to,
      activeDays: data.dateRange.activeDays, calendarDays: data.dateRange.calendarDays },
    totals: { ...tokens(data.totals), cacheHitRate: data.totals.cacheHitRate,
      outputToInputRatio: data.totals.outputToInputRatio, sessionCount: data.totals.sessionCount,
      projectCount: data.totals.projectCount },
    daily: data.daily.map(day => ({ ...tokens(day), date: day.date, modelsUsed: [], modelBreakdowns: [] })),
    monthly: data.monthly.map(month => ({ ...tokens(month), month: month.month, modelsUsed: [], modelBreakdowns: [] })),
    costs: { ...result.costs, totalCost: data.costs.totalCost, avgDailyCost: data.costs.avgDailyCost,
      peakDay: { date: data.costs.peakDay.date, cost: data.costs.peakDay.cost, tokens: data.costs.peakDay.tokens },
      blendedCostPerMillion: data.costs.blendedCostPerMillion, estimatedCacheSavings: data.costs.estimatedCacheSavings,
      pricedTokens: data.costs.pricedTokens, unpricedTokens: data.costs.unpricedTokens,
      tokenCoverageRate: data.costs.tokenCoverageRate },
  };
}
