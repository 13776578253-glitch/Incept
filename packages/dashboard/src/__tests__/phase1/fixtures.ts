// Only this test adapter reads raw capsules. Runtime receives bounded derived evidence.
import { hash } from '../../adapters/local/imports/identity';
import { makeManifest, sequenceHash, syncEnvelope } from '../../adapters/local/imports/sync/contract';
import type { SyncHeader, SyncRange, SyncRecord } from '../../domain/sync';
import { basename } from 'node:path';
import type { SyncScope } from '../../domain/sync';
import type { TransferEvent } from '../../domain';
import type { Manifest } from '../phase0c/phase0c-evidence';
import { embeddedSession, prefix } from '../phase0c/phase0c-evidence';

export function fromCapture(capture: Manifest, parent?: { capsule: Manifest; header: SyncHeader }, batchId = 'batch'): { header: SyncHeader; records: SyncRecord[] } {
  const records = capture.observations.map(row => {
    const record: SyncRecord = { event: row.event, envelopeHash: '', ...(row.nativeAnchor ? { nativeKey: { source: row.event.source, keyHash: hash(row.nativeAnchor) } } : {}) };
    if (capture.scope.source === 'codex' && capture.reader === 'codex') {
      const points = capture.files.flatMap(file => Buffer.from(file.bytes,'base64').toString('utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)))
        .filter(row => row.payload?.type === 'token_count');
      const point = points.find(point => Date.parse(point.timestamp) === row.event.timestampMs), counters = point?.payload?.info?.total_token_usage;
      if (counters) { record.pointKey = hash([capture.scope.sessionId, point.timestamp]); record.cumulative = { input: counters.input_tokens ?? 0,
        cache: counters.cached_input_tokens ?? 0, output: counters.output_tokens ?? 0, reasoning: counters.reasoning_output_tokens ?? 0 }; }
    }
    record.envelopeHash = syncEnvelope(record); return record;
  });
  const ranges: SyncRange[] = capture.files.map(file => {
    const bridge=capture.bridges.find(row=>row.to===file.locator);
    const old = parent?.capsule.files.find(old => old.locator === (bridge?.from??file.locator));
    const anchor = embeddedSession(file, capture.scope.source, capture.scope.sessionId)
      ||capture.scope.source==='commandcode'&&'cc-'+basename(file.locator,'.jsonl')===capture.scope.sessionId ? hash(capture.scope.sessionId) : undefined;
    // A metadata digest masks only the fields permitted by the local source adapter.
    const envelopeRoot = hash([file.tables?.map(table=>[table.name,table.schema])??null,records.map(row => row.envelopeHash)]);
    const range: SyncRange = { locatorHash: hash(file.locator), identityHash: file.identity, root: file.root, envelopeRoot,
      byteLength: file.byteLength, kind: file.tables ? 'sqlite' : file.locator.endsWith('.jsonl') ? 'jsonl' : file.locator.endsWith('.zst') ? 'compressed' : 'json', sessionAnchorHash: anchor };
    if(old&&bridge&&parent&&bridge.parentHash===parent.capsule.manifestHash&&bridge.oldRoot===old.root&&prefix(old,file))range.previous={locatorHash:hash(old.locator),root:old.root,retainedRoot:old.root,retainedBytes:old.byteLength,change:'rotation'};
    else if (old && file.root !== old.root) {
      let append = !file.tables && prefix(old, file);
      if (file.tables && old.tables) append = old.tables.every(table => { const next = file.tables!.find(row => row.name === table.name);
        return next && table.schema===next.schema && table.rows.every((row, i) => hash(row) === hash(next.rows[i])); });
      if (capture.scope.source === 'geminiCli' && !file.tables) {
        const a = JSON.parse(Buffer.from(old.bytes,'base64').toString()), b = JSON.parse(Buffer.from(file.bytes,'base64').toString());
        append = a.messages.length <= b.messages.length && a.messages.every((row: unknown, i: number) => hash(row) === hash(b.messages[i]));
      }
      range.previous = { locatorHash: hash(old.locator), root: old.root, retainedRoot: append ? old.root : hash('not-retained'), retainedBytes: old.byteLength,
        change: append ? 'append' : 'usage-revision' };
    }
    return range;
  });
  const basis = { rates: capture.basis.rates, aliases: capture.basis.aliases, schedule: capture.basis.schedule }, mappings = capture.mappings;
  const root = hash(ranges.map(row => [row.locatorHash,row.root]));
  const manifest = makeManifest({ version: 2, scope: capture.scope, reader: capture.reader, collectorVersion: 'incept-collector/1', epoch: 0,
    parent: parent ? { generationId: parent.header.manifest.generationId, manifestHash: parent.header.manifest.manifestHash } : null,
    read: { status: capture.status === 'complete' ? 'complete' : 'partial', inventoryHash: hash(ranges.map(row => row.locatorHash).sort()), beforeRoot: root, afterRoot: root, snapshotRoot: root },
    ranges, recordCount: records.length, sequenceHash: sequenceHash(records), basisHash: hash(basis), mappingsHash: hash(mappings), intent: 'observe' });
  return { header: { batchId, manifest, basis, mappings }, records };
}

export function fromEvents(events: TransferEvent[], scope: SyncScope, parent?: SyncHeader, batchId='synthetic') {
  let input=0,cache=0,output=0,reasoning=0;
  const records:SyncRecord[]=events.map(event=>{
    const record:SyncRecord={event,envelopeHash:''}; record.envelopeHash=syncEnvelope(record);
    if(scope.source==='codex') {input+=event.inputTokens+event.cacheReadTokens;cache+=event.cacheReadTokens;output+=event.outputTokens+event.reasoningTokens;reasoning+=event.reasoningTokens;
      record.cumulative={input,cache,output,reasoning};record.pointKey=hash([scope.sessionId,event.timestampMs]);}
    else record.nativeKey={source:scope.source,keyHash:hash(['native-fixture',event.eventId])}; return record;
  });
  const root=sequenceHash(records),old=parent?.manifest.ranges[0];
  const range:SyncRange={locatorHash:hash(scope.originId),identityHash:hash(['file',scope.originId]),kind:['antigravity','opencode','zcode'].includes(scope.source)?'sqlite':scope.source==='geminiCli'?'json':'jsonl',root,
    envelopeRoot:hash(records.map(row=>row.envelopeHash)),byteLength:records.length*1024,sessionAnchorHash:hash(scope.sessionId)};
  if(old&&old.root!==root)range.previous={locatorHash:old.locatorHash,root:old.root,retainedRoot:old.root,retainedBytes:old.byteLength,change:records.length>parent!.manifest.recordCount?'append':'usage-revision'};
  const basis=parent?.basis??{rates:{'phase0-fixture-model':{inputPerMillion:1,outputPerMillion:2,cacheReadPerMillion:.5,cacheWritePerMillion:3}},aliases:{},schedule:'commandcode-peak-v1' as const};
  const mappings=parent?.mappings??{};const snapshotRoot=hash([[range.locatorHash,range.root]]);
  const manifest=makeManifest({version:2,scope,reader:scope.source,collectorVersion:'incept-collector/1',epoch:parent?.manifest.epoch??0,parent:parent?{generationId:parent.manifest.generationId,manifestHash:parent.manifest.manifestHash}:null,
    ranges:[range],read:{status:'complete',beforeRoot:snapshotRoot,afterRoot:snapshotRoot,snapshotRoot,inventoryHash:hash([range.locatorHash])},recordCount:records.length,sequenceHash:root,basisHash:hash(basis),mappingsHash:hash(mappings),intent:'observe'});
  return {header:{batchId,manifest,basis,mappings},records};
}
