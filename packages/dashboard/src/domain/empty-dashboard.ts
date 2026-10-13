import type { TokenDashboardData } from './types';
import { dateWindow, type UsageRange } from './window';

export function emptyDashboard(range: UsageRange = '30d', now = Date.now()): TokenDashboardData {
  const tokens = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0, totalTokens: 0, cost: 0 };
  const window = dateWindow(range, now);
  return { updatedAt: '', range, dateRange: { ...window, activeDays: 0 },
    totals: { ...tokens, cacheHitRate: 0, outputToInputRatio: 0, sessionCount: 0, projectCount: 0 },
    daily: [], monthly: [], models: [], sources: [], projects: [], sessions: [],
    costs: { totalCost: 0, avgDailyCost: 0, peakDay: { date: window.to, cost: 0, tokens: 0 }, blendedCostPerMillion: 0,
      estimatedCacheSavings: 0, pricedTokens: 0, unpricedTokens: 0, tokenCoverageRate: 0, pricedModelCount: 0, totalModelCount: 0, modelCoverageRate: 0, unpricedModels: [] } };
}
