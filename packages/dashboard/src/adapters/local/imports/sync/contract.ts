import { createHash } from 'node:crypto';
import type { SyncHeader, SyncManifest, SyncRecord, SyncRange, SyncScope, SyncBasis } from '../../../../domain/sync';
import { TRANSFER_SOURCES } from '../../../../domain';
import { hash, stableJson } from '../identity';
import { validateBundle } from '../validation';

export const SYNC_LIMITS = { pageRecords: 500, pageBytes: 512 * 1024, records: 250_000, largeBatchRecords: 100_000, headerBytes: 128 * 1024,
  stagedBytes: 128 * 1024 * 1024, ttlMs: 24 * 60 * 60_000 } as const;
export class SyncError extends Error { constructor(public code: string) { super(code); } }
export function requireSync(condition: unknown, code: string): asserts condition { if (!condition) throw new SyncError(code); }
export const syncScopeId = (scope: SyncScope) => hash(['sync-scope/2', scope.deviceId, scope.source, scope.sessionId]);
export const syncEntityId = (scope: SyncScope, record?: SyncRecord) => hash(['sync-entity/2', syncScopeId(scope),
  scope.source !== 'codex' && record?.nativeKey ? record.nativeKey : 'session']);
export const syncEnvelope = (record: SyncRecord) => hash({ ...record.event, eventId: undefined, inputTokens: undefined,
  outputTokens: undefined, cacheReadTokens: undefined, cacheCreationTokens: undefined, reasoningTokens: undefined, recordedCost: undefined });
export function sequenceHash(records: Iterable<SyncRecord>) {
  const digest = createHash('sha256'); digest.update('['); let first = true;
  for (const record of records) { if (!first) digest.update(','); digest.update(stableJson(record)); first = false; }
  return digest.update(']').digest('hex');
}
export function merkleRoot(records: Iterable<SyncRecord>) {
  let level = [...records].map(record => hash(record));
  if (!level.length) return hash([]);
  while (level.length > 1) {
    const next: string[] = [];
    for (let index = 0; index < level.length; index += 2) next.push(hash([level[index], level[index + 1] ?? level[index]]));
    level = next;
  }
  return level[0];
}
export function usageKeyRoot(records: Iterable<SyncRecord>) {
  const keys: string[] = [];
  for (const record of records) if (record.nativeKey) keys.push(record.nativeKey.keyHash);
  keys.sort();
  return { keyRoot: hash(keys), count: keys.length };
}
export function makeManifest(body: Omit<SyncManifest, 'generationId' | 'manifestHash'>): SyncManifest {
  const { generationId: oldGeneration, manifestHash: oldHash, ...clean } = body as SyncManifest;
  void oldGeneration; void oldHash;
  const generationId = hash(['generation/2', syncScopeId(clean.scope), clean.epoch, clean.parent?.manifestHash ?? null, clean.sequenceHash, clean.basisHash, clean.mappingsHash]);
  return { ...clean, generationId, manifestHash: hash({ ...clean, generationId }) };
}
function fields(value: unknown, names: string[]): asserts value is Record<string, unknown> {
  requireSync(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_OBJECT');
  requireSync(Object.keys(value).every(key => names.includes(key)), 'UNEXPECTED_FIELD');
}
function text(value: unknown, max = 512): asserts value is string { requireSync(typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f]/.test(value), 'INVALID_TEXT'); }
function digest(value: unknown): asserts value is string { requireSync(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'INVALID_DIGEST'); }
function count(value: unknown, max = 1e12): asserts value is number { requireSync(Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max, 'INVALID_COUNT'); }
export function validateHeader(value: unknown): SyncHeader {
  requireSync(Buffer.byteLength(JSON.stringify(value)) <= SYNC_LIMITS.headerBytes, 'HEADER_TOO_LARGE');
  fields(value, ['batchId', 'manifest', 'basis', 'mappings']); text(value.batchId, 128);
  const manifest = value.manifest;
  fields(manifest, ['version','scope','reader','collectorVersion','epoch','parent','read','ranges','recordCount','sequenceHash','basisHash','mappingsHash','merkleRoot','generationId','manifestHash','intent']);
  requireSync(manifest.version === 2 && manifest.collectorVersion === 'incept-collector/1', 'UNSUPPORTED_VERSION');
  fields(manifest.scope, ['deviceId','source','sessionId','originId']);
  for (const key of ['deviceId','source','sessionId','originId']) text(manifest.scope[key]);
  requireSync(TRANSFER_SOURCES.includes(manifest.scope.source as never), 'UNKNOWN_SOURCE');
  requireSync(manifest.reader === manifest.scope.source || manifest.reader === 'aiusage', 'UNKNOWN_READER');
  count(manifest.epoch, 1e6); count(manifest.recordCount, SYNC_LIMITS.records);
  for (const key of ['sequenceHash','basisHash','mappingsHash','generationId','manifestHash']) digest(manifest[key]);
  if (manifest.merkleRoot !== undefined) digest(manifest.merkleRoot);
  requireSync(['observe','rebase','reprice'].includes(String(manifest.intent)), 'INVALID_INTENT');
  if (manifest.parent !== null) { fields(manifest.parent, ['generationId','manifestHash']); digest(manifest.parent.generationId); digest(manifest.parent.manifestHash); }
  fields(manifest.read, ['status','inventoryHash','beforeRoot','afterRoot','snapshotRoot']);
  requireSync(['complete','partial','unavailable','failed'].includes(String(manifest.read.status)), 'INVALID_READ_STATUS');
  for (const key of ['inventoryHash','beforeRoot','afterRoot','snapshotRoot']) digest(manifest.read[key]);
  requireSync(Array.isArray(manifest.ranges) && manifest.ranges.length > 0 && manifest.ranges.length <= 128, 'INVALID_RANGES');
  for (const range of manifest.ranges) {
    fields(range, ['locatorHash','identityHash','root','envelopeRoot','byteLength','kind','sessionAnchorHash','commitment','previous']);
    for (const key of ['locatorHash','identityHash','root','envelopeRoot']) digest(range[key]); count(range.byteLength);
    requireSync(['jsonl','json','sqlite','compressed'].includes(String(range.kind)), 'INVALID_RANGE_KIND');
    const kinds:Record<string,string[]>={codex:['jsonl','compressed'],commandcode:['jsonl','json'],claudeCode:['jsonl'],geminiCli:['json'],antigravity:['sqlite'],opencode:['sqlite'],zcode:['sqlite'],deepseekHarness:['jsonl'],aiusage:['sqlite']};
    // Compression is a recognizable unsupported evidence declaration. Keep its
    // review path available; qualifyRanges never admits it automatically.
    requireSync(range.kind==='compressed'||kinds[String(manifest.reader)].includes(String(range.kind)),'SOURCE_FORMAT_MISMATCH');
    if (range.sessionAnchorHash !== undefined) digest(range.sessionAnchorHash);
    if (range.commitment !== undefined) {
      fields(range.commitment, ['version','kind','keyRoot','count','schemaHash']);
      requireSync(range.commitment.version === 1 && range.commitment.kind === 'stable-key-set', 'UNSUPPORTED_EVIDENCE');
      digest(range.commitment.keyRoot); count(range.commitment.count, SYNC_LIMITS.records); digest(range.commitment.schemaHash);
    }
    if (range.previous !== undefined) { fields(range.previous, ['locatorHash','root','retainedRoot','retainedBytes','change']);
      for (const key of ['locatorHash','root','retainedRoot']) digest(range.previous[key]); count(range.previous.retainedBytes);
      requireSync(['append','usage-revision','rotation'].includes(String(range.previous.change)), 'INVALID_CHANGE'); }
  }
  requireSync(new Set(manifest.ranges.map(row => row.locatorHash)).size === manifest.ranges.length, 'DUPLICATE_RANGE');
  fields(value.basis, ['rates','aliases','schedule']); requireSync(value.basis.schedule === 'commandcode-peak-v1', 'UNKNOWN_SCHEDULE');
  // Reuse the exact v1 rate bounds/poison-key checks without changing v1 semantics.
  const basis = value.basis as SyncBasis; fields(basis.aliases, Object.keys(basis.aliases ?? {}));
  fields(basis.rates, Object.keys(basis.rates ?? {}));
  for (const [model, price] of Object.entries(basis.rates)) {
    text(model, 200); requireSync(!['__proto__','constructor','prototype'].includes(model), 'INVALID_RATE');
    fields(price, ['inputPerMillion','outputPerMillion','cacheReadPerMillion','cacheWritePerMillion']);
    requireSync(price.inputPerMillion !== undefined && price.outputPerMillion !== undefined, 'INVALID_RATE');
    for (const rate of Object.values(price)) requireSync(typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 1e6, 'INVALID_RATE');
  }
  for (const [key, alias] of Object.entries(basis.aliases)) { text(key, 200); text(alias, 200); requireSync(!['__proto__','constructor','prototype'].includes(key), 'INVALID_ALIAS'); }
  fields(value.mappings, Object.keys(value.mappings ?? {}));
  for (const [key, target] of Object.entries(value.mappings)) { text(key); if (target !== null) text(target); requireSync(!['__proto__','constructor','prototype'].includes(key), 'INVALID_MAPPING'); }
  const result = value as unknown as SyncHeader;
  requireSync(hash(basis) === manifest.basisHash && hash(value.mappings) === manifest.mappingsHash, 'BASIS_HASH_MISMATCH');
  const { generationId, manifestHash, ...body } = result.manifest;
  requireSync(hash(makeManifest(body)) === hash(result.manifest) && generationId && manifestHash, 'MANIFEST_HASH_MISMATCH');
  return result;
}
export function validateRecords(input: unknown, header: SyncHeader): SyncRecord[] {
  requireSync(Array.isArray(input) && input.length <= SYNC_LIMITS.pageRecords, 'PAGE_RECORD_LIMIT');
  requireSync(Buffer.byteLength(JSON.stringify(input)) <= SYNC_LIMITS.pageBytes, 'PAGE_BYTE_LIMIT');
  const records = input as SyncRecord[];
  for (const record of records) {
    fields(record, ['event','envelopeHash','nativeKey','pointKey','cumulative']); digest(record.envelopeHash);
    requireSync(record.event?.source === header.manifest.scope.source && record.event?.sessionId === header.manifest.scope.sessionId, 'SCOPE_MISMATCH');
    requireSync(syncEnvelope(record) === record.envelopeHash, 'ENVELOPE_HASH_MISMATCH');
    if (record.nativeKey !== undefined) {
      fields(record.nativeKey, ['source','keyHash']); requireSync(record.nativeKey.source === record.event.source && record.event.source !== 'codex' && header.manifest.reader !== 'aiusage', 'INVALID_NATIVE_KEY'); digest(record.nativeKey.keyHash);
    }
    if (record.pointKey !== undefined) digest(record.pointKey);
    if (record.cumulative !== undefined) { fields(record.cumulative, ['input','cache','output','reasoning']);
      for (const key of ['input','cache','output','reasoning'] as const) count(record.cumulative[key]);
      requireSync(record.event.source === 'codex' && header.manifest.reader === 'codex' && record.pointKey, 'INVALID_CUMULATIVE_SOURCE'); }
  }
  if (records.length) {
    const payload = { format: 'incept-token-transfer', version: 1, exportId: '00000000-0000-4000-8000-000000000001',
      device: { id: '00000000-0000-4000-8000-000000000001', label: 'validated', platform: 'node' }, exportedAt: new Date().toISOString(),
      events: records.map(row => row.event), prices: header.basis.rates, warnings: [] };
    validateBundle({ ...payload, checksum: hash(payload) });
  }
  return records;
}
export function qualifyRanges(parent: SyncManifest | undefined, next: SyncManifest) {
  requireSync(next.read.status === 'complete' && next.read.beforeRoot === next.read.afterRoot && next.read.beforeRoot === next.read.snapshotRoot, 'INCOMPLETE_READ');
  requireSync(next.read.inventoryHash === hash(next.ranges.map(row => row.locatorHash).sort()), 'INVENTORY_HASH_MISMATCH');
  requireSync(next.read.snapshotRoot === hash(next.ranges.map(row => [row.locatorHash,row.root])), 'SNAPSHOT_ROOT_MISMATCH');
  requireSync(next.ranges.every(row => row.kind !== 'compressed'), 'UNSUPPORTED_EVIDENCE');
  if (!parent) { requireSync(next.parent === null, 'PARENT_MISMATCH');requireSync(next.ranges.every(range=>!range.previous),'ROTATION_UNVERIFIED');requireSync(next.recordCount>0||next.intent==='rebase','EMPTY_BASELINE_SCOPE_UNVERIFIED');return; }
  requireSync(hash(next.scope) === hash(parent.scope) && next.reader === parent.reader && next.collectorVersion === parent.collectorVersion, 'SCOPE_MISMATCH');
  requireSync(next.parent?.generationId === parent.generationId && next.parent.manifestHash === parent.manifestHash, 'PARENT_MISMATCH');
  const stable=(range:SyncRange)=>range.commitment?.kind==='stable-key-set';
  const stableScope=next.ranges.some(stable)||parent.ranges.some(stable);
  const verifyStable=(old:SyncRange,current:SyncRange)=>{
    requireSync(next.scope.source==='antigravity','UNSUPPORTED_EVIDENCE');
    requireSync(old.commitment&&current.commitment,'UNSUPPORTED_EVIDENCE');
    requireSync(old.commitment.schemaHash===current.commitment.schemaHash,'SOURCE_REVISION_UNVERIFIED');
    requireSync(current.commitment.count>=old.commitment.count,'PREFIX_LOST');
  };
  if(!stableScope)requireSync(next.recordCount >= parent.recordCount, 'PREFIX_LOST');
  for(const range of next.ranges){if(stable(range))continue;if(range.previous) {
    const proof=range.previous,old=parent.ranges.find(row=>row.locatorHash===proof.locatorHash);
    requireSync(old&&old.root===proof.root,'ROTATION_UNVERIFIED');requireSync(old.kind===range.kind,'UNSUPPORTED_EVIDENCE');
    if(proof.change==='rotation') requireSync(range.sessionAnchorHash&&range.sessionAnchorHash===old.sessionAnchorHash&&proof.retainedRoot===old.root&&proof.retainedBytes===old.byteLength
      && (range.identityHash===old.identityHash||['codex','claudeCode','geminiCli','deepseekHarness'].includes(next.scope.source)),'ROTATION_UNVERIFIED');
    else {
      requireSync(range.locatorHash===old.locatorHash&&range.identityHash===old.identityHash,'ROTATION_UNVERIFIED');
      if(proof.change==='append')requireSync(proof.retainedRoot===old.root&&proof.retainedBytes===old.byteLength&&(range.kind!=='jsonl'||range.byteLength>=old.byteLength),'PREFIX_LOST');
      else requireSync(range.envelopeRoot===old.envelopeRoot&&next.scope.source!=='antigravity'&&next.reader!=='aiusage','SOURCE_REVISION_UNVERIFIED');
    }
  }}
  for (const old of parent.ranges) {
    const current = next.ranges.find(row => row.locatorHash === old.locatorHash || row.previous?.locatorHash === old.locatorHash);
    requireSync(current, 'ROTATION_UNVERIFIED');
    requireSync(current.kind===old.kind,'UNSUPPORTED_EVIDENCE');
    if(stable(old)||stable(current)){verifyStable(old,current);continue;}
    if (current.locatorHash === old.locatorHash && current.identityHash !== old.identityHash) throw new SyncError(old.kind === 'sqlite' ? 'DB_REPLACED_UNVERIFIED' : 'ROTATION_UNVERIFIED');
    if (current.root === old.root && current.identityHash === old.identityHash && current.locatorHash === old.locatorHash) continue;
    const proof = current.previous;
    requireSync(proof?.root === old.root, 'PREFIX_LOST');
    if (proof.change === 'rotation') requireSync(current.sessionAnchorHash && current.sessionAnchorHash === old.sessionAnchorHash
      && proof.retainedRoot === old.root && proof.retainedBytes === old.byteLength
      && (current.identityHash === old.identityHash || ['codex','claudeCode','geminiCli','deepseekHarness'].includes(next.scope.source)), 'ROTATION_UNVERIFIED');
    else if (proof.change === 'append') requireSync(proof.retainedRoot === old.root && proof.retainedBytes === old.byteLength && (current.kind!=='jsonl'||current.byteLength >= old.byteLength), 'PREFIX_LOST');
    else requireSync(current.envelopeRoot === old.envelopeRoot && next.scope.source !== 'antigravity' && next.reader !== 'aiusage', 'SOURCE_REVISION_UNVERIFIED');
  }
  for (const added of next.ranges.filter(row => !parent.ranges.some(old => old.locatorHash === row.locatorHash) && !row.previous))
    requireSync(!parent.ranges.some(old=>old.root===added.root)&&added.sessionAnchorHash === hash(next.scope.sessionId) && ['codex','claudeCode','geminiCli','deepseekHarness'].includes(next.scope.source), 'ROTATION_UNVERIFIED');
}
export function qualifyRecords(parent: Iterable<SyncRecord>, next: Iterable<SyncRecord>, manifest: SyncManifest) {
  const accumulate=(total:number,record:SyncRecord)=>{const next=total+record.event.inputTokens+record.event.outputTokens+record.event.cacheReadTokens+record.event.cacheCreationTokens+record.event.reasoningTokens;requireSync(Number.isSafeInteger(next),'TOKEN_TOTAL_OVERFLOW');return next;};
  if (manifest.scope.source !== 'codex' || manifest.reader !== 'codex') {
    const native = new Map<string,SyncRecord>(), weak = new Map<string,number>(), ids = new Set<string>(), anchors = new Set<string>();
    for (const row of parent) { if (row.nativeKey) native.set(row.nativeKey.keyHash,row); else weak.set(hash(row),(weak.get(hash(row)) ?? 0)+1); }
    let count = 0,totalTokens=0;
    for (const row of next) {
      totalTokens=accumulate(totalTokens,row);
      count++; requireSync(!ids.has(row.event.eventId),'AMBIGUOUS_RECORD'); ids.add(row.event.eventId);
      if (row.nativeKey) {
        requireSync(!anchors.has(row.nativeKey.keyHash),'AMBIGUOUS_NATIVE_KEY'); anchors.add(row.nativeKey.keyHash);
        const old = native.get(row.nativeKey.keyHash);
        if (old) {
          const relocated=['commandcode','geminiCli'].includes(manifest.scope.source)&&manifest.ranges.some(range=>range.previous?.change==='rotation');
          const unchangedUsage=(record:SyncRecord)=>hash({...record.event,projectKey:undefined,projectName:undefined,workspacePath:undefined});
          requireSync(old.envelopeHash === row.envelopeHash || relocated&&unchangedUsage(old)===unchangedUsage(row),'REVISION_ENVELOPE_CHANGED');
          if (manifest.scope.source === 'antigravity') requireSync(hash(old) === hash(row),'SOURCE_REVISION_UNVERIFIED'); native.delete(row.nativeKey.keyHash); }
      } else { const key=hash(row), n=weak.get(key) ?? 0; if(n) weak.set(key,n-1); }
    }
    requireSync(!native.size,'NATIVE_ANCHOR_CHANGED'); requireSync([...weak.values()].every(n=>n===0),'WEAK_REVISION_REVIEW_REQUIRED');
    requireSync(count === manifest.recordCount,'RECORD_COUNT_MISMATCH'); return totalTokens;
  }
  const old = parent[Symbol.iterator](), incoming = next[Symbol.iterator](); let previous: SyncCountersState | undefined, at = -Infinity;
  const nativeKeys = new Set<string>(), eventIds = new Set<string>(); let count = 0,totalTokens=0,current = incoming.next(), prior = old.next();
  while (!current.done) {
    const record = current.value; count++;
    totalTokens=accumulate(totalTokens,record);
    requireSync(!eventIds.has(record.event.eventId), 'AMBIGUOUS_RECORD'); eventIds.add(record.event.eventId);
    if (record.nativeKey) { requireSync(!nativeKeys.has(record.nativeKey.keyHash), 'AMBIGUOUS_NATIVE_KEY'); nativeKeys.add(record.nativeKey.keyHash); }
    if (!prior.done) {
      if (manifest.scope.source === 'codex' && manifest.reader === 'codex') {
        requireSync(record.pointKey === prior.value.pointKey && record.envelopeHash === prior.value.envelopeHash, 'REVISION_ENVELOPE_CHANGED');
        if (hash(record) !== hash(prior.value)) requireSync(manifest.ranges.every(range => range.sessionAnchorHash === hash(manifest.scope.sessionId)), 'NATIVE_ANCHOR_CHANGED');
      } else if (prior.value.nativeKey) {
        requireSync(hash(record.nativeKey) === hash(prior.value.nativeKey), 'NATIVE_ANCHOR_CHANGED');
        requireSync(record.envelopeHash === prior.value.envelopeHash, 'REVISION_ENVELOPE_CHANGED');
      } else requireSync(hash(record) === hash(prior.value), 'WEAK_REVISION_REVIEW_REQUIRED');
      prior = old.next();
    }
    if (manifest.scope.source === 'codex' && manifest.reader === 'codex') {
      const total = record.cumulative; requireSync(total && record.pointKey && record.event.timestampMs > at, 'CODEX_COUNTER_INVALID');
      requireSync(total.cache <= total.input && total.reasoning <= total.output, 'CODEX_COUNTER_INVALID');
      for (const key of ['input','cache','output','reasoning'] as const) requireSync(total[key] >= (previous?.[key] ?? 0), 'CODEX_COUNTER_INVALID');
      const delta = { input: total.input - (previous?.input ?? 0), cache: total.cache - (previous?.cache ?? 0), output: total.output - (previous?.output ?? 0), reasoning: total.reasoning - (previous?.reasoning ?? 0) };
      requireSync(record.event.inputTokens === delta.input - delta.cache && record.event.cacheReadTokens === delta.cache
        && record.event.outputTokens === delta.output - delta.reasoning && record.event.reasoningTokens === delta.reasoning && record.event.cacheCreationTokens === 0, 'CODEX_COUNTER_INVALID');
      previous = total; at = record.event.timestampMs;
    }
    current = incoming.next();
  }
  requireSync(prior.done, 'PREFIX_LOST'); requireSync(count === manifest.recordCount, 'RECORD_COUNT_MISMATCH');
  return totalTokens;
}
type SyncCountersState = NonNullable<SyncRecord['cumulative']>;
