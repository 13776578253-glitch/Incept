import { createHash } from 'node:crypto';
import type { TransferEvent } from '../../../domain';
import type { RawUsageEvent } from '../types';

export function stableJson(value: unknown, depth = 0): string {
  if (depth > 64) throw new Error('Data nesting is too deep');
  if (Array.isArray(value)) return '[' + value.map(item => stableJson(item, depth + 1)).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, item]) => JSON.stringify(key) + ':' + stableJson(item, depth + 1)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
export const hash = (value: unknown) => createHash('sha256').update(stableJson(value)).digest('hex');
export function nativeEventId(event: RawUsageEvent) {
  return event.eventId ?? hash([event.sourceId, event.sessionId, event.timestampMs, event.inputTokens,
    event.outputTokens, event.cacheReadTokens, event.cacheCreationTokens, event.reasoningTokens]);
}
export function contentHash(event: TransferEvent, resolvedName = event.modelName) {
  return hash([event.source, event.sessionId, event.timestampMs, resolvedName, event.inputTokens,
    event.outputTokens, event.cacheReadTokens, event.cacheCreationTokens, event.reasoningTokens]);
}
export function recordHash(event: TransferEvent, resolvedName = event.modelName) {
  const raw = event as TransferEvent & Partial<RawUsageEvent>;
  const recordedCost = event.recordedCost ?? (raw.costSource === 'recorded' ? raw.cost : undefined);
  return hash([contentHash(event, resolvedName), recordedCost ?? null]);
}
export const eventTokens = (event: TransferEvent) => event.inputTokens + event.outputTokens + event.cacheReadTokens + event.cacheCreationTokens + event.reasoningTokens;
