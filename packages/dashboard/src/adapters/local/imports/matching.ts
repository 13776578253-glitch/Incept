import type { TransferEvent } from '../../../domain';
import { contentHash, hash } from './identity';

// Recognize historical generated identities without guessing arbitrary request IDs.
export function hasWeakIdentity(event: TransferEvent): boolean {
  const oldNative = hash([event.source, event.sessionId, event.timestampMs, event.inputTokens,
    event.outputTokens, event.cacheReadTokens, event.cacheCreationTokens, event.reasoningTokens]);
  const oldIndex = event.sessionId !== 'default' ? hash([event.timestampMs, event.source, event.modelName,
    event.source === 'codex' ? event.inputTokens + event.cacheReadTokens : event.inputTokens, event.cacheReadTokens,
    event.cacheCreationTokens, event.source === 'codex' ? event.outputTokens + event.reasoningTokens : event.outputTokens,
    event.reasoningTokens, event.sessionId, undefined]) : undefined;
  return event.eventId === oldNative || event.eventId === oldIndex || event.eventId === contentHash(event);
}

export function canonicalTransferId(event: TransferEvent): string {
  return hasWeakIdentity(event) ? contentHash(event) : event.eventId;
}

export function identityIndex<T extends { event: TransferEvent }>(records: T[], resolve: (name: string) => string) {
  const exact = new Map<string, T[]>(), content = new Map<string, T[]>();
  const contentIds = new Map<string, Set<string>>();
  const weakContent = new Set<string>();
  for (const record of records) {
    const id = canonicalTransferId(record.event), key = contentHash(record.event, resolve(record.event.modelName));
    const direct = exact.get(id) ?? [], related = content.get(key) ?? [], ids = contentIds.get(key) ?? new Set();
    direct.push(record); related.push(record); ids.add(id);
    exact.set(id, direct); content.set(key, related); contentIds.set(key, ids);
    if (hasWeakIdentity(record.event)) weakContent.add(key);
  }
  const count = (event: TransferEvent) => contentIds.get(contentHash(event, resolve(event.modelName)))?.size ?? 0;
  return {
    count,
    hasWeak: (event: TransferEvent) => weakContent.has(contentHash(event, resolve(event.modelName))),
    related: (event: TransferEvent) => content.get(contentHash(event, resolve(event.modelName))) ?? [],
    find(event: TransferEvent, incoming?: { count: (event: TransferEvent) => number }) {
      const direct = exact.get(canonicalTransferId(event));
      if (direct?.length) return { matches: direct, ambiguous: false };
      const key = contentHash(event, resolve(event.modelName));
      if (!hasWeakIdentity(event) && !weakContent.has(key)) return { matches: [] as T[], ambiguous: false };
      const candidates = content.get(key) ?? [];
      const bridge = candidates.filter(record => hasWeakIdentity(event) || hasWeakIdentity(record.event));
      if (!bridge.length) return { matches: [] as T[], ambiguous: false };
      return { matches: bridge, ambiguous: (incoming?.count(event) ?? 1) > 1 || (contentIds.get(key)?.size ?? 0) > 1 };
    },
  };
}
