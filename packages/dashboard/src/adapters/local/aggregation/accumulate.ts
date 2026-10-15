import 'server-only';
import type { BillingBreakdown, CcusageModelBreakdown, SourceDescriptionKey } from '../../../domain/index';
import { type RawUsageEvent } from '../types';
import { SOURCE_META } from '../source-metadata';

function addBilling(target: { billing?: BillingBreakdown }, event: RawUsageEvent, totalTokens: number) {
  const key = event.isPeak === undefined ? 'standard' : event.isPeak ? 'peak' : 'offPeak';
  const billing = target.billing ??= {};
  const part = billing[key] ??= { totalTokens: 0, cost: 0, nominalCost: 0, requests: 0 };
  part.totalTokens += totalTokens;
  part.cost += event.cost;
  part.nominalCost += event.nominalCost ?? event.cost;
  part.requests++;
}

export function accumulateUsageEvents(allEvents: RawUsageEvent[]) {
  const dailyMap = new Map<
    string,
    {
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
      reasoningTokens: number;
      totalTokens: number;
      cost: number;
      missingPricing?: boolean;
      modelsUsed: Set<string>;
      modelMap: Map<string, CcusageModelBreakdown>;
    }
  >();

  const monthlyMap = new Map<
    string,
    {
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
      reasoningTokens: number;
      totalTokens: number;
      cost: number;
      missingPricing?: boolean;
      modelsUsed: Set<string>;
      modelMap: Map<string, CcusageModelBreakdown>;
    }
  >();

  const modelAggMap = new Map<
    string,
    {
      modelName: string;
      billing?: BillingBreakdown;
      sourcesUsed: Set<string>;
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
      reasoningTokens: number;
      totalTokens: number;
      cost: number;
      missingPricing: boolean;
      sessions: Set<string>;
      days: Set<string>;
    }
  >();

  const sourceAggMap = new Map<
    SourceDescriptionKey,
    {
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
      reasoningTokens: number;
      totalTokens: number;
      cost: number;
      missingPricing?: boolean;
      sessions: Set<string>;
      models: Set<string>;
    }
  >();

  for(const meta of SOURCE_META) {
    sourceAggMap.set(meta.sourceId, {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      cost: 0,
      sessions: new Set(),
      models: new Set(),
    });
  }

  const sessionAggMap = new Map<
    string,
    {
      sessionId: string;
      deviceId?: string;
      deviceLabel?: string;
      importBatchId?: string;
      projectKey: string;
      projectName: string;
      workspacePath?: string;
      title?: string;
      source: string;
      firstTs: number;
      lastTs: number;
      timestampPrecision?: 'event' | 'day';
      historyIncomplete?: boolean;
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
      reasoningTokens: number;
      totalTokens: number;
      cost: number;
      missingPricing?: boolean;
      modelsUsed: Set<string>;
      modelMap: Map<string, CcusageModelBreakdown>;
    }
  >();

  const projectAggMap = new Map<
    string,
    {
      projectKey: string;
      projectName: string;
      workspacePath?: string;
      sessions: Set<string>;
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
      reasoningTokens: number;
      totalTokens: number;
      cost: number;
      missingPricing?: boolean;
      lastTs: number;
      modelsUsed: Set<string>;
    }
  >();

  let totalInput = 0;

  let totalOutput = 0;

  let totalCacheCreate = 0;

  let totalCacheRead = 0;

  let totalReasoning = 0;

  let totalTokens = 0;

  let totalCost = 0;

  for(const ev of allEvents) {
    const evTotal =
      ev.inputTokens +
      ev.outputTokens +
      ev.cacheCreationTokens +
      ev.cacheReadTokens +
      ev.reasoningTokens;
    if(evTotal <= 0) continue;

    totalInput += ev.inputTokens;
    totalOutput += ev.outputTokens;
    totalCacheCreate += ev.cacheCreationTokens;
    totalCacheRead += ev.cacheReadTokens;
    totalReasoning += ev.reasoningTokens;
    totalTokens += evTotal;
    totalCost += ev.cost;

    // 1. Daily
    let dayEntry = dailyMap.get(ev.dateKey);
    if(!dayEntry) {
      dayEntry = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        cost: 0,
        modelsUsed: new Set(),
        modelMap: new Map(),
      };
      dailyMap.set(ev.dateKey, dayEntry);
    }
    dayEntry.inputTokens += ev.inputTokens;
    dayEntry.outputTokens += ev.outputTokens;
    dayEntry.cacheCreationTokens += ev.cacheCreationTokens;
    dayEntry.cacheReadTokens += ev.cacheReadTokens;
    dayEntry.reasoningTokens += ev.reasoningTokens;
    dayEntry.totalTokens += evTotal;
    dayEntry.cost += ev.cost;
    dayEntry.modelsUsed.add(ev.modelName);
    const dayModel = dayEntry.modelMap.get(ev.modelName) ?? {
      modelName: ev.modelName,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cost: 0,
      missingPricing: ev.missingPricing,
    };
    dayModel.inputTokens += ev.inputTokens;
    dayModel.outputTokens += ev.outputTokens;
    dayModel.reasoningTokens = (dayModel.reasoningTokens ?? 0) + ev.reasoningTokens;
    dayModel.totalTokens = (dayModel.totalTokens ?? 0) + evTotal;
    dayModel.missingPricing ||= ev.missingPricing;
    dayModel.cacheCreationTokens += ev.cacheCreationTokens;
    dayModel.cacheReadTokens += ev.cacheReadTokens;
    dayModel.cost += ev.cost;
    addBilling(dayModel, ev, evTotal);
    dayEntry.modelMap.set(ev.modelName, dayModel);

    // 2. Monthly
    let monthEntry = monthlyMap.get(ev.monthKey);
    if(!monthEntry) {
      monthEntry = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        cost: 0,
        modelsUsed: new Set(),
        modelMap: new Map(),
      };
      monthlyMap.set(ev.monthKey, monthEntry);
    }
    monthEntry.inputTokens += ev.inputTokens;
    monthEntry.outputTokens += ev.outputTokens;
    monthEntry.cacheCreationTokens += ev.cacheCreationTokens;
    monthEntry.cacheReadTokens += ev.cacheReadTokens;
    monthEntry.reasoningTokens += ev.reasoningTokens;
    monthEntry.totalTokens += evTotal;
    monthEntry.cost += ev.cost;
    monthEntry.modelsUsed.add(ev.modelName);
    const monthModel = monthEntry.modelMap.get(ev.modelName) ?? {
      modelName: ev.modelName,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cost: 0,
      missingPricing: ev.missingPricing,
    };
    monthModel.inputTokens += ev.inputTokens;
    monthModel.outputTokens += ev.outputTokens;
    monthModel.reasoningTokens = (monthModel.reasoningTokens ?? 0) + ev.reasoningTokens;
    monthModel.totalTokens = (monthModel.totalTokens ?? 0) + evTotal;
    monthModel.missingPricing ||= ev.missingPricing;
    monthModel.cacheCreationTokens += ev.cacheCreationTokens;
    monthModel.cacheReadTokens += ev.cacheReadTokens;
    monthModel.cost += ev.cost;
    addBilling(monthModel, ev, evTotal);
    monthEntry.modelMap.set(ev.modelName, monthModel);

    // 3. Model
    let modelEntry = modelAggMap.get(ev.modelName);
    if(!modelEntry) {
      modelEntry = {
        modelName: ev.modelName,
        sourcesUsed: new Set(),
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        cost: 0,
        missingPricing: ev.missingPricing,
        sessions: new Set(),
        days: new Set(),
      };
      modelAggMap.set(ev.modelName, modelEntry);
    }
    modelEntry.sourcesUsed.add(ev.sourceLabel);
    modelEntry.inputTokens += ev.inputTokens;
    modelEntry.outputTokens += ev.outputTokens;
    modelEntry.cacheCreationTokens += ev.cacheCreationTokens;
    modelEntry.cacheReadTokens += ev.cacheReadTokens;
    modelEntry.reasoningTokens += ev.reasoningTokens;
    modelEntry.totalTokens += evTotal;
    modelEntry.cost += ev.cost;
    addBilling(modelEntry, ev, evTotal);
    modelEntry.missingPricing ||= ev.missingPricing;
    const scopedSessionKey = `${ev.deviceId ?? 'local'}:${ev.sourceId}:${ev.sessionId}`;
    modelEntry.sessions.add(scopedSessionKey);
    modelEntry.days.add(ev.dateKey);

    // 4. Source
    const sourceEntry = sourceAggMap.get(ev.sourceId);
    if(sourceEntry) {
      sourceEntry.inputTokens += ev.inputTokens;
      sourceEntry.outputTokens += ev.outputTokens;
      sourceEntry.cacheCreationTokens += ev.cacheCreationTokens;
      sourceEntry.cacheReadTokens += ev.cacheReadTokens;
      sourceEntry.reasoningTokens += ev.reasoningTokens;
      sourceEntry.totalTokens += evTotal;
      sourceEntry.cost += ev.cost;
    sourceEntry.missingPricing ||= ev.missingPricing;
      sourceEntry.sessions.add(scopedSessionKey);
      sourceEntry.models.add(ev.modelName);
    }

    // 5. Session
    const compositeSessionKey = scopedSessionKey;
    let sessEntry = sessionAggMap.get(compositeSessionKey);
    if(!sessEntry) {
      sessEntry = {
        sessionId: ev.sessionId,
        deviceId: ev.deviceId,
        deviceLabel: ev.deviceLabel,
        importBatchId: ev.importBatchId,
        projectKey: ev.projectKey,
        projectName: ev.projectName,
        workspacePath: ev.workspacePath,
        title: ev.sessionTitle,
        source: ev.sourceLabel,
        firstTs: ev.timestampMs,
        lastTs: ev.timestampMs,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        cost: 0,
        modelsUsed: new Set(),
        modelMap: new Map(),
      };
      sessionAggMap.set(compositeSessionKey, sessEntry);
    }
    if(ev.timestampMs < sessEntry.firstTs) sessEntry.firstTs = ev.timestampMs;
    if(ev.timestampMs > sessEntry.lastTs) sessEntry.lastTs = ev.timestampMs;
    if (ev.timestampPrecision === 'day') sessEntry.timestampPrecision = 'day';
    sessEntry.historyIncomplete ||= ev.historyIncomplete;
    if(!sessEntry.title && ev.sessionTitle) sessEntry.title = ev.sessionTitle;
    sessEntry.inputTokens += ev.inputTokens;
    sessEntry.outputTokens += ev.outputTokens;
    sessEntry.cacheCreationTokens += ev.cacheCreationTokens;
    sessEntry.cacheReadTokens += ev.cacheReadTokens;
    sessEntry.reasoningTokens += ev.reasoningTokens;
    sessEntry.totalTokens += evTotal;
    sessEntry.cost += ev.cost;
    sessEntry.missingPricing ||= ev.missingPricing;
    sessEntry.modelsUsed.add(ev.modelName);
    const sessModel = sessEntry.modelMap.get(ev.modelName) ?? {
      modelName: ev.modelName,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cost: 0,
      missingPricing: ev.missingPricing,
    };
    sessModel.inputTokens += ev.inputTokens;
    sessModel.outputTokens += ev.outputTokens;
    sessModel.reasoningTokens = (sessModel.reasoningTokens ?? 0) + ev.reasoningTokens;
    sessModel.totalTokens = (sessModel.totalTokens ?? 0) + evTotal;
    sessModel.missingPricing ||= ev.missingPricing;
    sessModel.cacheCreationTokens += ev.cacheCreationTokens;
    sessModel.cacheReadTokens += ev.cacheReadTokens;
    sessModel.cost += ev.cost;
    addBilling(sessModel, ev, evTotal);
    sessEntry.modelMap.set(ev.modelName, sessModel);

    // 6. Project
    let projEntry = projectAggMap.get(ev.projectKey);
    if(!projEntry) {
      projEntry = {
        projectKey: ev.projectKey,
        projectName: ev.projectName,
        workspacePath: ev.workspacePath,
        sessions: new Set(),
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        cost: 0,
        lastTs: ev.timestampMs,
        modelsUsed: new Set(),
      };
      projectAggMap.set(ev.projectKey, projEntry);
    }
    projEntry.sessions.add(compositeSessionKey);
    projEntry.inputTokens += ev.inputTokens;
    projEntry.outputTokens += ev.outputTokens;
    projEntry.cacheCreationTokens += ev.cacheCreationTokens;
    projEntry.cacheReadTokens += ev.cacheReadTokens;
    projEntry.reasoningTokens += ev.reasoningTokens;
    projEntry.totalTokens += evTotal;
    projEntry.cost += ev.cost;
    projEntry.missingPricing ||= ev.missingPricing;
    if(ev.timestampMs > projEntry.lastTs) projEntry.lastTs = ev.timestampMs;
    projEntry.modelsUsed.add(ev.modelName);
  }

  return { dailyMap, monthlyMap, modelAggMap, sourceAggMap, sessionAggMap, projectAggMap, totalInput, totalOutput, totalCacheCreate, totalCacheRead, totalReasoning, totalTokens, totalCost };
}
