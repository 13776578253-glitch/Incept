import 'server-only';
import { statSync } from 'node:fs';
import type { SourceDescriptionKey } from '../../../domain';
import type { RawUsageEvent, UnitPricing } from '../types';
import { canPriceUsage, computeCostFromPricing, lookupPricing, readRecordedCost } from '../pricing';
import { resolveProjectFromPath, toLocalDateAndMonth } from '../normalization';

export type CollectionResult = { events: RawUsageEvent[]; latestMtimeMs: number; parsedFiles: Set<string>; coveredSessions: Set<string>; errors: string[] };
export const emptyCollection = (): CollectionResult => ({ events: [], latestMtimeMs: 0, parsedFiles: new Set(), coveredSessions: new Set(), errors: [] });
export const normalizeFile = (path: string) => path.replace(/\\/g, '/').toLowerCase();
export function fileUpdatedAt(path: string) {
  let latest = 0;
  for (const file of [path, path + '-wal']) {
    try { latest = Math.max(latest, statSync(file).mtimeMs); } catch { /* Optional WAL. */ }
  }
  return latest;
}

type EventInput = Pick<RawUsageEvent, 'sourceId' | 'sourceLabel' | 'sessionId' | 'modelName' | 'timestampMs'>
  & Partial<Pick<RawUsageEvent, 'sessionTitle' | 'sourceFile' | 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheCreationTokens' | 'reasoningTokens'>>
  & { cwd?: string; recordedCost?: unknown; requestId?: string; timestampPrecision?: 'event' | 'day' };

export function usageEvent(input: EventInput, pricingMap: Map<string, UnitPricing>): RawUsageEvent {
  const tokens = { inputTokens: input.inputTokens ?? 0, outputTokens: input.outputTokens ?? 0,
    cacheReadTokens: input.cacheReadTokens ?? 0, cacheCreationTokens: input.cacheCreationTokens ?? 0, reasoningTokens: input.reasoningTokens ?? 0 };
  if (!Number.isFinite(input.timestampMs) || input.timestampMs <= 0
    || !Object.values(tokens).every(count => Number.isFinite(count) && count >= 0)) throw new Error('Invalid native usage record');
  const recorded = readRecordedCost(input.recordedCost);
  const price = lookupPricing(pricingMap, input.modelName);
  return { ...input, ...tokens, ...resolveProjectFromPath(input.cwd, input.sourceLabel), ...toLocalDateAndMonth(input.timestampMs),
    costSource: recorded === undefined ? 'calculated' : 'recorded',
    cost: recorded ?? computeCostFromPricing(price, tokens), missingPricing: recorded === undefined && !canPriceUsage(price, tokens) };
}

export function markCovered(result: CollectionResult, sourceId: SourceDescriptionKey, file: string, sessions: Iterable<string>) {
  result.parsedFiles.add(normalizeFile(file));
  for (const session of sessions) result.coveredSessions.add(sourceId + ':' + session);
}
