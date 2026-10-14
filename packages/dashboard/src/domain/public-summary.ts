import { emptyDashboard } from './empty-dashboard';
import type { CcusageModelBreakdown, TokenBreakdown, TokenDashboardData } from './types';

// Public data is constructed from an allowlist; never spread collected records.
function tokens(value: TokenBreakdown): TokenBreakdown {
  return {
    inputTokens: value.inputTokens, outputTokens: value.outputTokens,
    cacheReadTokens: value.cacheReadTokens, cacheCreationTokens: value.cacheCreationTokens,
    reasoningTokens: value.reasoningTokens, totalTokens: value.totalTokens, cost: value.cost,
    missingPricing: value.missingPricing,
  };
}

function modelBreakdowns(values: CcusageModelBreakdown[]) {
  return values.map(value => ({ modelName: value.modelName, inputTokens: value.inputTokens,
    outputTokens: value.outputTokens, cacheCreationTokens: value.cacheCreationTokens,
    cacheReadTokens: value.cacheReadTokens, reasoningTokens: value.reasoningTokens,
    totalTokens: value.totalTokens, cost: value.cost, missingPricing: value.missingPricing }));
}

export function publicDashboardSummary(data: TokenDashboardData, canViewDetails = false): TokenDashboardData {
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
    daily: data.daily.map(day => ({ ...tokens(day), date: day.date, modelsUsed: [...day.modelsUsed], modelBreakdowns: modelBreakdowns(day.modelBreakdowns) })),
    monthly: data.monthly.map(month => ({ ...tokens(month), month: month.month, modelsUsed: [...month.modelsUsed], modelBreakdowns: modelBreakdowns(month.modelBreakdowns) })),
    models: data.models.map(model => ({ ...tokens(model), modelName: model.modelName, displayName: model.displayName,
      provider: model.provider, source: model.source, sourcesUsed: model.sourcesUsed ? [...model.sourcesUsed] : undefined,
      shareOfTokens: model.shareOfTokens, shareOfCost: model.shareOfCost, cacheHitRate: model.cacheHitRate,
      missingPricing: model.missingPricing, slotStatus: model.slotStatus, sessionCount: model.sessionCount, activeDays: model.activeDays,
      unitPricing: model.unitPricing ? { inputPerMillion: model.unitPricing.inputPerMillion, outputPerMillion: model.unitPricing.outputPerMillion,
        cacheReadPerMillion: model.unitPricing.cacheReadPerMillion, cacheWritePerMillion: model.unitPricing.cacheWritePerMillion } : undefined })),
    sources: data.sources.map(source => ({ ...tokens(source), sourceId: source.sourceId, label: source.label,
      descriptionKey: source.descriptionKey, collectionMode: source.collectionMode, shareOfTokens: source.shareOfTokens,
      shareOfCost: source.shareOfCost, sessionCount: source.sessionCount, modelsUsed: [...source.modelsUsed], status: source.status })),
    costs: { ...result.costs, totalCost: data.costs.totalCost, avgDailyCost: data.costs.avgDailyCost,
      peakDay: { date: data.costs.peakDay.date, cost: data.costs.peakDay.cost, tokens: data.costs.peakDay.tokens },
      blendedCostPerMillion: data.costs.blendedCostPerMillion, estimatedCacheSavings: data.costs.estimatedCacheSavings,
      pricedTokens: data.costs.pricedTokens, unpricedTokens: data.costs.unpricedTokens,
      tokenCoverageRate: data.costs.tokenCoverageRate, pricedModelCount: data.costs.pricedModelCount,
      totalModelCount: data.costs.totalModelCount, modelCoverageRate: data.costs.modelCoverageRate,
      unpricedModels: data.costs.unpricedModels.map(model => ({ modelName: model.modelName, source: model.source,
        inputTokens: model.inputTokens, outputTokens: model.outputTokens, cacheReadTokens: model.cacheReadTokens,
        totalTokens: model.totalTokens, sessionCount: model.sessionCount })) },
    projects: canViewDetails ? data.projects.map(project => ({ ...tokens(project), projectKey: project.projectKey,
      projectName: project.projectName, sessionCount: project.sessionCount, shareOfTokens: project.shareOfTokens,
      shareOfCost: project.shareOfCost, lastActivity: project.lastActivity, modelsUsed: [...project.modelsUsed] })) : [],
    sessions: canViewDetails ? data.sessions.map(session => ({ ...tokens(session), sessionKey: session.sessionKey,
      sessionId: session.sessionId, projectKey: session.projectKey, projectName: session.projectName, title: session.title,
      source: session.source, timestampPrecision: session.timestampPrecision, historyIncomplete: session.historyIncomplete, firstActivity: session.firstActivity,
      lastActivity: session.lastActivity, durationMinutes: session.durationMinutes, modelsUsed: [...session.modelsUsed],
      modelBreakdowns: modelBreakdowns(session.modelBreakdowns) })) : [],
  };
}
