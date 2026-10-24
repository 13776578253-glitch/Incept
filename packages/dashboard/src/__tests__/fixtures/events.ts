import { hash } from '../../adapters/local/imports/identity';
import { makeManifest, sequenceHash, syncEnvelope } from '../../adapters/local/imports/sync/contract';
import type { SyncHeader, SyncRange, SyncRecord, SyncScope } from '../../domain/sync';
import type { TransferEvent } from '../../domain';

export function fromEvents(events: TransferEvent[], scope: SyncScope, parent?: SyncHeader, batchId = 'synthetic') {
  let input = 0, cache = 0, output = 0, reasoning = 0;
  const records: SyncRecord[] = events.map(event => {
    const record: SyncRecord = { event, envelopeHash: '' };
    record.envelopeHash = syncEnvelope(record);
    if (scope.source === 'codex') {
      input += event.inputTokens + event.cacheReadTokens;
      cache += event.cacheReadTokens;
      output += event.outputTokens + event.reasoningTokens;
      reasoning += event.reasoningTokens;
      record.cumulative = { input, cache, output, reasoning };
      record.pointKey = hash([scope.sessionId, event.timestampMs]);
    } else {
      record.nativeKey = { source: scope.source, keyHash: hash(['native-fixture', event.eventId]) };
    }
    return record;
  });
  const root = sequenceHash(records), old = parent?.manifest.ranges[0];
  const range: SyncRange = {
    locatorHash: hash(scope.originId),
    identityHash: hash(['file', scope.originId]),
    kind: ['antigravity', 'opencode', 'zcode'].includes(scope.source) ? 'sqlite' : scope.source === 'geminiCli' ? 'json' : 'jsonl',
    root,
    envelopeRoot: hash(records.map(row => row.envelopeHash)),
    byteLength: records.length * 1024,
    sessionAnchorHash: hash(scope.sessionId),
  };
  if (old && old.root !== root) {
    range.previous = {
      locatorHash: old.locatorHash,
      root: old.root,
      retainedRoot: old.root,
      retainedBytes: old.byteLength,
      change: records.length > parent!.manifest.recordCount ? 'append' : 'usage-revision',
    };
  }
  const basis = parent?.basis ?? { rates: { 'phase0-fixture-model': { inputPerMillion: 1, outputPerMillion: 2, cacheReadPerMillion: .5, cacheWritePerMillion: 3 } }, aliases: {}, schedule: 'commandcode-peak-v1' as const };
  const mappings = parent?.mappings ?? {};
  const snapshotRoot = hash([[range.locatorHash, range.root]]);
  const manifest = makeManifest({
    version: 2,
    scope,
    reader: scope.source,
    collectorVersion: 'incept-collector/1',
    epoch: parent?.manifest.epoch ?? 0,
    parent: parent ? { generationId: parent.manifest.generationId, manifestHash: parent.manifest.manifestHash } : null,
    ranges: [range],
    read: { status: 'complete', beforeRoot: snapshotRoot, afterRoot: snapshotRoot, snapshotRoot, inventoryHash: hash([range.locatorHash]) },
    recordCount: records.length,
    sequenceHash: root,
    basisHash: hash(basis),
    mappingsHash: hash(mappings),
    intent: 'observe',
  });
  return { header: { batchId, manifest, basis, mappings }, records };
}
