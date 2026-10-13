import 'server-only';
import type { DailyUsagePoint, ModelUsageSummary, MonthlyUsagePoint, ProjectUsageSummary, SessionUsageItem, SourceUsageSummary, TokenDashboardData, UnpricedModelSummary } from '../../../domain/index';
import { type UnitPricing, type RawUsageEvent } from '../types';
import { SOURCE_META } from '../source-metadata';
import { lookupPricing } from '../pricing';
import { classifyProvider, toLocalDateAndMonth } from '../normalization';
import { accumulateUsageEvents } from './accumulate';
import { appendConfiguredModels } from './configured-models';

export function summarizeUsageEvents(allEvents: RawUsageEvent[], home: string, pricingMap: Map<string, UnitPricing>, latestMtimeMs: number, window?: { from: string; to: string; calendarDays: number }): TokenDashboardData {
  const {
    dailyMap,
    monthlyMap,
    modelAggMap,
    sourceAggMap,
    sessionAggMap,
    projectAggMap,
    totalInput,
    totalOutput,
    totalCacheCreate,
    totalCacheRead,
    totalReasoning,
    totalTokens,
    totalCost,
  } = accumulateUsageEvents(allEvents);

  if (window) {
    for (let timestamp = Date.parse(window.from); timestamp <= Date.parse(window.to); timestamp += 86_400_000) {
      const date = new Date(timestamp).toISOString().slice(0, 10);
      if (!dailyMap.has(date)) dailyMap.set(date, {
        inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
        reasoningTokens: 0, totalTokens: 0, cost: 0, modelsUsed: new Set(), modelMap: new Map(),
      });
    }
  }

  const daily: DailyUsagePoint[] = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      inputTokens: d.inputTokens,
      outputTokens: d.outputTokens,
      cacheCreationTokens: d.cacheCreationTokens,
      cacheReadTokens: d.cacheReadTokens,
      reasoningTokens: d.reasoningTokens,
      totalTokens: d.totalTokens,
      cost: d.cost,
      modelsUsed: Array.from(d.modelsUsed),
      modelBreakdowns: Array.from(d.modelMap.values()).sort(
        (x, y) =>
          y.inputTokens +
          y.outputTokens +
          y.cacheReadTokens -
          (x.inputTokens + x.outputTokens + x.cacheReadTokens),
      ),
    }));

  const monthly: MonthlyUsagePoint[] = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, m]) => ({
      month,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      cacheCreationTokens: m.cacheCreationTokens,
      cacheReadTokens: m.cacheReadTokens,
      reasoningTokens: m.reasoningTokens,
      totalTokens: m.totalTokens,
      cost: m.cost,
      modelsUsed: Array.from(m.modelsUsed),
      modelBreakdowns: Array.from(m.modelMap.values()).sort(
        (x, y) =>
          y.inputTokens +
          y.outputTokens +
          y.cacheReadTokens -
          (x.inputTokens + x.outputTokens + x.cacheReadTokens),
      ),
    }));

  const models: ModelUsageSummary[] = Array.from(modelAggMap.values())
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .map((m) => {
      const sourcesUsed = Array.from(m.sourcesUsed);
      const pricing = lookupPricing(pricingMap, m.modelName);
      const promptTotal = m.inputTokens + m.cacheCreationTokens + m.cacheReadTokens;
      return {
        modelName: m.modelName,
        displayName: m.modelName,
        provider: classifyProvider(m.modelName),
        source: sourcesUsed.join(' / '),
        sourcesUsed,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        cacheCreationTokens: m.cacheCreationTokens,
        cacheReadTokens: m.cacheReadTokens,
        reasoningTokens: m.reasoningTokens,
        totalTokens: m.totalTokens,
        cost: m.cost,
        shareOfTokens: totalTokens > 0 ? (m.totalTokens / totalTokens) : 0,
        shareOfCost: totalCost > 0 ? (m.cost / totalCost) : 0,
        cacheHitRate: promptTotal > 0 ? (m.cacheReadTokens / promptTotal) : 0,
        missingPricing: m.missingPricing,
        slotStatus: 'measured',
        sessionCount: m.sessions.size,
        activeDays: m.days.size,
        unitPricing: pricing
          ? {
            inputPerMillion: pricing.inputPerMillion,
            outputPerMillion: pricing.outputPerMillion,
            cacheReadPerMillion: pricing.cacheReadPerMillion,
            cacheWritePerMillion: pricing.cacheWritePerMillion,
          }
          : undefined,
      };
    });

  appendConfiguredModels(home, pricingMap, models);

  const sources: SourceUsageSummary[] = SOURCE_META.map((meta) => {
    const agg = sourceAggMap.get(meta.sourceId)!;
    return {
      sourceId: meta.sourceId,
      label: meta.label,
      descriptionKey: meta.descriptionKey,
      inputTokens: agg.inputTokens,
      outputTokens: agg.outputTokens,
      cacheCreationTokens: agg.cacheCreationTokens,
      cacheReadTokens: agg.cacheReadTokens,
      reasoningTokens: agg.reasoningTokens,
      totalTokens: agg.totalTokens,
      cost: agg.cost,
      missingPricing: agg.missingPricing,
      shareOfTokens: totalTokens > 0 ? (agg.totalTokens / totalTokens) : 0,
      shareOfCost: totalCost > 0 ? (agg.cost / totalCost) : 0,
      sessionCount: agg.sessions.size,
      modelsUsed: Array.from(agg.models),
      status: agg.totalTokens > 0 ? ('active' as const) : ('pending' as const),
    };
  }).sort((a, b) => b.totalTokens - a.totalTokens);

  const projects: ProjectUsageSummary[] = Array.from(projectAggMap.values())
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .map((p) => ({
      projectKey: p.projectKey,
      projectName: p.projectName,
      workspacePath: p.workspacePath,
      sessionCount: p.sessions.size,
      inputTokens: p.inputTokens,
      outputTokens: p.outputTokens,
      cacheCreationTokens: p.cacheCreationTokens,
      cacheReadTokens: p.cacheReadTokens,
      reasoningTokens: p.reasoningTokens,
      totalTokens: p.totalTokens,
      cost: p.cost,
      missingPricing: p.missingPricing,
      shareOfTokens: totalTokens > 0 ? (p.totalTokens / totalTokens) : 0,
      shareOfCost: totalCost > 0 ? (p.cost / totalCost) : 0,
      lastActivity: toLocalDateAndMonth(p.lastTs).dateKey,
      modelsUsed: Array.from(p.modelsUsed),
    }));

  const sessions: SessionUsageItem[] = Array.from(sessionAggMap.values())
    .sort((a, b) => b.lastTs - a.lastTs)
    .map((s) => ({
      sessionId: s.sessionId,
      deviceLabel: s.deviceLabel,
      importBatchId: s.importBatchId,
      timestampPrecision: s.timestampPrecision,
      sessionKey: (s.deviceId ?? 'local') + ':' + s.source + ':' + s.sessionId,
      projectKey: s.projectKey,
      projectName: s.projectName,
      workspacePath: s.workspacePath,
      title: s.title,
      source: s.source,
      firstActivity: new Date(s.firstTs).toISOString(),
      lastActivity: new Date(s.lastTs).toISOString(),
      durationMinutes: Math.max(0, Math.round((s.lastTs - s.firstTs) / 60_000)),
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      cacheCreationTokens: s.cacheCreationTokens,
      cacheReadTokens: s.cacheReadTokens,
      reasoningTokens: s.reasoningTokens,
      totalTokens: s.totalTokens,
      cost: s.cost,
      missingPricing: s.missingPricing,
      modelsUsed: Array.from(s.modelsUsed),
      modelBreakdowns: Array.from(s.modelMap.values()).sort(
        (x, y) =>
          y.inputTokens +
          y.outputTokens +
          y.cacheReadTokens -
          (x.inputTokens + x.outputTokens + x.cacheReadTokens),
      ),
    }));

  const measuredModels = models.filter((m) => m.slotStatus === 'measured');

  const unknown = accumulateUsageEvents(allEvents.filter(event => event.missingPricing));
  const unpricedModels: UnpricedModelSummary[] = Array.from(unknown.modelAggMap.values()).map(model => ({
    modelName: model.modelName, source: Array.from(model.sourcesUsed).join(' / '),
    inputTokens: model.inputTokens, outputTokens: model.outputTokens,
    cacheReadTokens: model.cacheReadTokens, totalTokens: model.totalTokens, sessionCount: model.sessions.size,
  }));
  const unpricedTokens = unknown.totalTokens;

  const pricedTokens = Math.max(0, totalTokens - unpricedTokens);

  const pricedModelCount = measuredModels.length - unpricedModels.length;

  let estimatedCacheSavings = 0;

  for(const m of measuredModels) {
    if(m.unitPricing?.cacheReadPerMillion !== undefined && m.cacheReadTokens > 0) {
      const savedPerMillion = Math.max(
        0,
        m.unitPricing.inputPerMillion - m.unitPricing.cacheReadPerMillion,
      );
      estimatedCacheSavings += (m.cacheReadTokens * savedPerMillion) / 1_000_000;
    }
  }

  const peakDayEntry = daily.reduce(
    (best, cur) => (cur.cost > best.cost ? cur : best),
    daily[0] ?? { date: '—', cost: 0, totalTokens: 0 },
  );

  const promptTokensTotal = totalInput + totalCacheCreate + totalCacheRead;

  const data: TokenDashboardData = {
    updatedAt: latestMtimeMs > 0 ? new Date(latestMtimeMs).toISOString() : '',
    dateRange: {
      from: window?.from ?? daily[0]?.date ?? '—',
      to: window?.to ?? daily[daily.length - 1]?.date ?? '—',
      activeDays: daily.filter(day => day.totalTokens > 0).length,
      calendarDays: window?.calendarDays ?? daily.length,
    },
    totals: {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheCreationTokens: totalCacheCreate,
      cacheReadTokens: totalCacheRead,
      reasoningTokens: totalReasoning,
      totalTokens,
      cost: totalCost,
      cacheHitRate:
        promptTokensTotal > 0 ? (totalCacheRead / promptTokensTotal) : 0,
      outputToInputRatio:
        promptTokensTotal > 0 ? ((totalOutput + totalReasoning) / promptTokensTotal) : 0,
      sessionCount: sessionAggMap.size,
      projectCount: projectAggMap.size,
    },
    daily,
    monthly,
    models,
    sources,
    costs: {
      totalCost: totalCost,
      avgDailyCost:
        daily.length > 0 ? (totalCost / (window?.calendarDays ?? daily.length)) : 0,
      peakDay: {
        date: peakDayEntry.date,
        cost: peakDayEntry.cost,
        tokens: peakDayEntry.totalTokens,
      },
      blendedCostPerMillion:
        pricedTokens > 0 ? ((totalCost / pricedTokens) * 1_000_000) : 0,
      estimatedCacheSavings: estimatedCacheSavings,
      pricedTokens,
      unpricedTokens,
      tokenCoverageRate: totalTokens > 0 ? (pricedTokens / totalTokens) : 0,
      pricedModelCount,
      totalModelCount: measuredModels.length,
      modelCoverageRate:
        measuredModels.length > 0
          ? (pricedModelCount / measuredModels.length)
          : 0,
      unpricedModels,
    },
    projects,
    sessions,
  };

  return data;
}
