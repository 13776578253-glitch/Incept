import 'server-only';
import { type UnitPricing } from '../types';
import { collectIndexedAgentEvents } from './aiusage';
import { collectCodexEvents } from './codex';
import { collectGeminiEvents } from './gemini';
import { collectAntigravityEvents } from './antigravity';
import { collectClaudeEvents } from './claude';
import { collectOpenCodeEvents } from './opencode-usage';
import { collectZCodeEvents } from './zcode';
import { normalizeFile } from './common';

export function collectAiusageAndRawAgentEvents(home: string, pricingMap: Map<string, UnitPricing>) {
  const indexed = collectIndexedAgentEvents(home, pricingMap);
  const codex = collectCodexEvents(home, pricingMap, indexed.ingestedFiles);
  const gemini = collectGeminiEvents(home, pricingMap);
  const native = [collectAntigravityEvents(home, pricingMap), collectClaudeEvents(home, pricingMap),
    collectOpenCodeEvents(home, pricingMap), collectZCodeEvents(home, pricingMap)];
  const coveredSessions = new Set(native.flatMap(result => [...result.coveredSessions]));
  for (const event of [...codex.events, ...gemini.events]) coveredSessions.add(event.sourceId + ':' + event.sessionId);
  const parsedFiles = new Set([...codex.parsedFiles, ...gemini.parsedFiles].map(normalizeFile));
  const codexFilenames = new Set([...codex.parsedFiles].map(file => normalizeFile(file).split('/').pop()));
  for (const result of native) for (const path of result.parsedFiles) parsedFiles.add(path);
  const fallbackEvents = indexed.events.filter(event => !coveredSessions.has(event.sourceId + ':' + event.sessionId)
    && (!event.sourceFile || !parsedFiles.has(normalizeFile(event.sourceFile)))
    && !(event.sourceId === 'codex' && event.sourceFile && codexFilenames.has(normalizeFile(event.sourceFile).split('/').pop())));

  return {
    events: [...fallbackEvents, ...codex.events, ...gemini.events, ...native.flatMap(result => result.events)],
    fallbackEvents,
    coveredSessions,
    parsedFiles,
    errors: [...codex.errors, ...native.flatMap(result => result.errors)],
    fallbackSources: [...new Set([...fallbackEvents.map(event => event.sourceId),
      ...native.flatMap((result, index) => result.errors.length ? [(['antigravity', 'claudeCode', 'opencode', 'zcode'] as const)[index]] : [])])],
    fallbackDateHints: Object.fromEntries([...new Set(fallbackEvents.map(event => event.sourceId))].map(source => [source,
      native.some(result => result.errors.length) ? undefined : [...new Set(fallbackEvents.filter(event => event.sourceId === source).map(event => event.dateKey))]])),
    latestMtimeMs: Math.max(indexed.latestMtimeMs, codex.latestMtimeMs, gemini.latestMtimeMs, ...native.map(result => result.latestMtimeMs)),
  };
}
