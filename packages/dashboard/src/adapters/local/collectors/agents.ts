import 'server-only';
import { type UnitPricing } from '../types';
import { collectIndexedAgentEvents } from './aiusage';
import { collectCodexEvents, type CodexSourcePolicy } from './codex';
import { collectGeminiEvents } from './gemini';
import { collectAntigravityEvents } from './antigravity';
import { collectClaudeEvents } from './claude';
import { collectOpenCodeEvents } from './opencode-usage';
import { collectZCodeEvents } from './zcode';
import { collectDeepSeekHarnessEvents } from './deepseek-harness';
import { normalizeFile } from './common';

export function collectAiusageAndRawAgentEvents(home: string, pricingMap: Map<string, UnitPricing>, codexPolicy:CodexSourcePolicy={}) {
  const indexed = collectIndexedAgentEvents(home, pricingMap);
  const codex = collectCodexEvents(home, pricingMap, indexed.ingestedFiles,codexPolicy);
  const gemini = collectGeminiEvents(home, pricingMap);
  const harness = collectDeepSeekHarnessEvents(home, pricingMap);
  const native = [collectAntigravityEvents(home, pricingMap), collectClaudeEvents(home, pricingMap),
    collectOpenCodeEvents(home, pricingMap), collectZCodeEvents(home, pricingMap), harness];
  const coveredSessions = new Set(native.flatMap(result => [...result.coveredSessions]));
  for (const event of [...codex.events, ...gemini.events]) coveredSessions.add(event.sourceId + ':' + event.sessionId);
  const parsedFiles = new Set([...codex.parsedFiles, ...gemini.parsedFiles].map(normalizeFile));
  const codexFilenames = new Set([...codex.parsedFiles].map(file => normalizeFile(file).split('/').pop()));
  for (const result of native) for (const path of result.parsedFiles) parsedFiles.add(path);
  const fallbackEvents = indexed.events.filter(event => !coveredSessions.has(event.sourceId + ':' + event.sessionId)
    && !(event.sourceFiles ?? (event.sourceFile ? [event.sourceFile] : [])).some(file => parsedFiles.has(normalizeFile(file))
      || event.sourceId === 'codex' && codexFilenames.has(normalizeFile(file).replace(/\.zst$/, '').split('/').pop())));

  return {
    events: [...fallbackEvents, ...codex.events, ...gemini.events, ...native.flatMap(result => result.events)],
    fallbackEvents,
    coveredSessions,
    parsedFiles,
    sessionIntegrity: codex.sessionIntegrity,
    harnessDiagnostics: harness.diagnostics,
    errors: [...indexed.errors, ...codex.errors, ...gemini.errors, ...native.flatMap(result => result.errors)],
    fallbackSources: [...new Set([...fallbackEvents.map(event => event.sourceId),
      ...native.flatMap((result, index) => result.errors.length ? [(['antigravity', 'claudeCode', 'opencode', 'zcode', 'deepseekHarness'] as const)[index]] : [])])],
    fallbackDateHints: Object.fromEntries([...new Set(fallbackEvents.map(event => event.sourceId))].map(source => [source,
      native.some(result => result.errors.length) ? undefined : [...new Set(fallbackEvents.filter(event => event.sourceId === source).map(event => event.dateKey))]])),
    latestMtimeMs: Math.max(indexed.latestMtimeMs, codex.latestMtimeMs, gemini.latestMtimeMs, ...native.map(result => result.latestMtimeMs)),
  };
}
