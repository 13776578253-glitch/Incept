import 'server-only';
import { homedir } from 'node:os';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { dashboardDate, dateWindow, nonNegative, type TokenDashboardData, type UsageRange } from '../../domain';
import { loadLocalPricingMap } from './pricing';
import type { RawUsageEvent, UnitPricing } from './types';
import { collectCommandCodeEvents } from './collectors/commandcode';
import { collectAiusageAndRawAgentEvents } from './collectors/agents';
import { summarizeUsageEvents } from './aggregation/summarize';
import { canonicalModelName, readLocalOverrides } from './overrides';
import { collectCcusageFallback } from './collectors/ccusage';
import type { SourceDescriptionKey } from '../../domain';
import { normalizeFile } from './collectors/common';
import { loadImportedEvents } from './imports/layer';
import { importStorePath } from './imports/store';
import { applyCommandCodeQuota } from './pricing-schedule';

type Snapshot = { home: string; expiresAt: number; events: RawUsageEvent[]; pricing: Map<string, UnitPricing>; updatedAt: number;
  fallbackEvents: Set<RawUsageEvent>; fallbackSources: SourceDescriptionKey[]; coveredSessions: Set<string>; errors: string[];
  aliases: Record<string, string>; fallbackDateHints: Partial<Record<SourceDescriptionKey, string[]>>; coveredFiles: Set<string> };
let cachedSnapshot: Snapshot | null = null;

export async function loadTokenDashboardData(options: { range?: UsageRange; force?: boolean; home?: string } = {}): Promise<TokenDashboardData> {
  const now = Date.now();
  const home = options.home ?? homedir();
  if (!cachedSnapshot || cachedSnapshot.home !== home || options.force || cachedSnapshot.expiresAt <= now) {
    const overrides = readLocalOverrides();
    const pricing = loadLocalPricingMap(home, overrides);
    const commandcode = collectCommandCodeEvents(home, pricing);
    const agents = collectAiusageAndRawAgentEvents(home, pricing);
    const commandFiles = new Set(commandcode.events.flatMap(event => event.sourceFile ? [normalizeFile(event.sourceFile)] : []));
    const agentEvents = agents.events.filter(event => event.sourceId !== 'commandcode' || !event.sourceFile || !commandFiles.has(normalizeFile(event.sourceFile)));
    const events = [...commandcode.events, ...agentEvents]
      .filter(event => Number.isFinite(event.timestampMs) && event.timestampMs > 0)
      .map(event => ({
        ...event,
        modelName: canonicalModelName(event.modelName, overrides.aliases),
        dateKey: dashboardDate(event.timestampMs),
        monthKey: dashboardDate(event.timestampMs).slice(0, 7),
        inputTokens: nonNegative(event.inputTokens), outputTokens: nonNegative(event.outputTokens),
        cacheReadTokens: nonNegative(event.cacheReadTokens), cacheCreationTokens: nonNegative(event.cacheCreationTokens),
        reasoningTokens: nonNegative(event.reasoningTokens), cost: nonNegative(event.cost),
        missingPricing: event.missingPricing || !Number.isFinite(event.cost) || event.cost < 0,
      }));
    let updatedAt = Math.max(commandcode.latestMtimeMs, agents.latestMtimeMs, overrides.updatedAt);
    for (const path of [['.aiusage', 'config.json'], ['.aiusage', 'cache.db-wal'], ['.commandcode', 'config.json'], ['.codex', 'models_cache.json']]) {
      try { updatedAt = Math.max(updatedAt, statSync(join(home, ...path)).mtimeMs); } catch { /* Optional source. */ }
    }
    const indexedKeys = new Set(agents.fallbackEvents.map(event => JSON.stringify([event.sourceId, event.sessionId, event.timestampMs, canonicalModelName(event.modelName, overrides.aliases)])));
    const fallbackEvents = new Set(events.filter(event => indexedKeys.has(JSON.stringify([event.sourceId, event.sessionId, event.timestampMs, event.modelName]))));
    cachedSnapshot = { home, events, pricing, updatedAt, expiresAt: now + 15_000, aliases: overrides.aliases,
      fallbackEvents, fallbackSources: agents.fallbackSources, coveredSessions: agents.coveredSessions,
      fallbackDateHints: agents.fallbackDateHints,
      coveredFiles: new Set([...agents.parsedFiles, ...commandFiles]),
      errors: [...agents.errors, ...agents.harnessDiagnostics.map(item => 'deepseekHarness:' + item.reason + ':' + (item.sessionId ?? 'unidentified')), ...commandcode.errors, ...(overrides.error ? [overrides.error] : [])] };
  }
  const snapshot = cachedSnapshot;
  const range = options.range ?? 'all';
  const imported = loadImportedEvents(snapshot.events, snapshot.pricing, snapshot.aliases, importStorePath(home));
  const eligible = [...snapshot.events.filter(event => !imported.replacedIndexed.has(event)), ...imported.events].filter(event => event.timestampMs <= now);
  const firstDate = eligible.reduce<string | undefined>((first, event) => !first || event.dateKey < first ? event.dateKey : first, undefined);
  const window = dateWindow(range, now, firstDate);
  const fallback = await collectCcusageFallback(snapshot.fallbackSources, window, snapshot.pricing, snapshot.coveredSessions, undefined, snapshot.fallbackDateHints, snapshot.coveredFiles);
  const selected = eligible.filter(event => event.dateKey >= window.from && event.dateKey <= window.to
    && !(snapshot.fallbackEvents.has(event) && fallback.coveredSessions.has(event.sourceId + ':' + event.sessionId)));
  selected.push(...fallback.events.map(event => ({ ...event, modelName: canonicalModelName(event.modelName, snapshot.aliases) })));
  const data = summarizeUsageEvents(selected.map(applyCommandCodeQuota), home, imported.pricing, Math.max(snapshot.updatedAt, imported.updatedAt), window);
  for (const source of data.sources) {
    const modes = new Set(selected.filter(event => event.sourceId === source.sourceId).map(event =>
      event.importBatchId ? 'imported' as const : snapshot.fallbackEvents.has(event) ? 'indexed' as const : event.timestampPrecision === 'day' ? 'ccusage' as const : 'native' as const));
    source.collectionMode = modes.size > 1 ? 'mixed' : [...modes][0];
  }
  const indexedRemaining = selected.some(event => snapshot.fallbackEvents.has(event));
  return { ...data, range, checkedAt: new Date(now).toISOString(), collectionIssues: [...new Set([...snapshot.errors, ...fallback.errors, ...imported.issues,
    ...(indexedRemaining ? ['Historical indexed usage retained where original files or reports are unavailable.'] : [])])] };
}
