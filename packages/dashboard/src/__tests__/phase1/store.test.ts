import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { SyncService } from '../../adapters/local/imports/sync/service';
import { makeManifest, sequenceHash, syncScopeId } from '../../adapters/local/imports/sync/contract';
import { PHASE0_DEVICE, PHASE0_MODEL, PHASE0_PRICE, writePhase0Source } from '../fixtures/sync-agent-phase0';
import { scan } from '../phase0c/phase0c-evidence';
import { fromCapture } from './fixtures';
import type { SyncActor } from '../../domain/sync';
let home: string, service: SyncService;
const scope = { deviceId: PHASE0_DEVICE, source: 'geminiCli' as const, sessionId: 'phase0-geminiCli', originId: 'g' };
const owner: SyncActor = { role: 'owner', subject: 'fixture-owner', reason: 'test' }, device: SyncActor = { role: 'device', deviceId: PHASE0_DEVICE };
const basis = { rates: { [PHASE0_MODEL]: PHASE0_PRICE }, aliases: {}, schedule: 'commandcode-peak-v1' as const, provenance: 'fixture' };
beforeEach(() => { home = mkdtempSync(join(tmpdir(),'sync-agent-phase1-')); service = new SyncService(join(home,'sync.db')); service.register(scope,'Synthetic device',owner); });
afterEach(() => { service.close(); rmSync(home,{recursive:true,force:true}); });
async function fixture(count = 1, parent?: { capsule: Awaited<ReturnType<typeof scan>>; header: ReturnType<typeof fromCapture>['header'] }, batch = 'base') {
  writePhase0Source(home,'geminiCli',{count}); const capsule = await scan(home,scope,basis); return { capsule,...fromCapture(capsule,parent,batch) };
}
const total = () => [...service.current(syncScopeId(scope))].reduce((sum,row) => sum + row.event.inputTokens,0);
it('durable generation deltas, no-op revision and 100 retries do not grow observations', async () => {
  const first = await fixture(); const receipt = service.ingest(first.header,first.records,device); expect(receipt.code).toBe('baseline-observed');
  for (let i=0;i<100;i++) expect(service.ingest(first.header,first.records,device)).toEqual(receipt);
  const next = await fixture(2,first,'append'); service.ingest(next.header,next.records,device); expect(total()).toBe(200);
  expect(service.db.prepare('SELECT COUNT(*) n FROM sync_observations').get()!.n).toBe(2); expect(service.db.prepare('SELECT COUNT(*) n FROM sync_changes').get()!.n).toBe(2);
  const unchanged = await fixture(2,next,'noop'), version = service.snapshotVersion(); service.ingest(unchanged.header,unchanged.records,device);
  expect(service.snapshotIsCurrent(version)).toBe(true); expect(service.revision()).toBe(2);
  service.rebuild(owner); service.rebuild(owner); expect(total()).toBe(200);
  service.rollback(next.header.manifest.generationId,owner); // Old revision may be rolled without rewriting its descendant.
  expect(total()).toBe(200);
});
it.each(['after-observations','after-visible','before-receipt'] as const)('%s fault is atomic to another connection and retryable', async fault => {
  const first = await fixture(); service.ingest(first.header,first.records,device); const reader = new SyncService(service.path);
  try { const next = await fixture(2,first,'fault');
    expect(() => service.ingest(next.header,next.records,device,{fault,onStage:()=>expect(reader.revision()).toBe(1)})).toThrow('INJECTED_FAILURE');
    expect(total()).toBe(100); expect(reader.receipt(PHASE0_DEVICE,'fault')).toBe(undefined);
    expect(service.ingest(next.header,next.records,device).status).toBe('committed'); expect(reader.revision()).toBe(2);
  } finally { reader.close(); }
});
it('staging survives reopen, rejects missing/order/changed pages and is invisible until final commit', async () => {
  const first = await fixture(2); service.begin(first.header,device); service.stage(PHASE0_DEVICE,'base',0,first.records.slice(0,1),device); expect(total()).toBe(0);
  service.close(); service = new SyncService(join(home,'sync.db')); expect(service.begin(first.header,device).nextOffset).toBe(1);
  expect(() => service.commit(PHASE0_DEVICE,'base',device)).toThrow('INCOMPLETE_STAGING');
  expect(() => service.stage(PHASE0_DEVICE,'base',0,first.records,device)).toThrow('PAGE_PAYLOAD_MISMATCH');
  expect(() => service.stage(PHASE0_DEVICE,'base',2,first.records.slice(1),device)).toThrow('PAGE_ORDER_MISMATCH');
  service.stage(PHASE0_DEVICE,'base',1,first.records.slice(1),device); service.commit(PHASE0_DEVICE,'base',device); expect(total()).toBe(200);
});
it('rejects stale concurrent parents, ownership, same-batch payload changes and rollback revival', async () => {
  const first = await fixture(); service.ingest(first.header,first.records,device); const next = await fixture(2,first,'next'); service.ingest(next.header,next.records,device);
  expect(() => service.register({...scope,deviceId:'other'},'other',owner)).toThrow('ORIGIN_OWNERSHIP_CONFLICT');
  expect(()=>service.begin({...first.header,basis:{...basis,rates:{}}},device)).toThrow();
  const stale = {...next.header,batchId:'stale'}; expect(service.ingest(stale,next.records,device).code).toBe('PARENT_MISMATCH');
  service.rollback(next.header.manifest.generationId,owner); expect(total()).toBe(100);
  const replay = await fixture(2,next,'replay'); expect(service.ingest(replay.header,replay.records,device).code).toBe('ROLLED_BACK_LINEAGE'); expect(total()).toBe(100);
});
it('truncation retains old data and busy retry is bounded; expired pages can be cleaned', async () => {
  const first = await fixture(2); service.ingest(first.header,first.records,device); const truncated = await fixture(1,first,'truncate');
  expect(service.ingest(truncated.header,truncated.records,device).status).toBe('review-required'); expect(total()).toBe(200);
  const contender = new SyncService(service.path,{busyTimeoutMs:1,busyRetries:2});
  service.db.exec('BEGIN IMMEDIATE'); try { expect(()=>contender.transaction(()=>{})).toThrow('SQLITE_BUSY_EXHAUSTED'); } finally { service.db.exec('ROLLBACK'); contender.close(); }
  const expired = {...truncated.header,batchId:'expired'}; service.begin(expired,device,1); expect(service.cleanup(Date.now())).toBe(1);
  expect(()=>service.stage(PHASE0_DEVICE,'expired',0,[],device)).toThrow('STAGING_NOT_FOUND');
});
it('full sequence validation binds pages and revision-backed snapshots invalidate only committed data', async () => {
  const first = await fixture(), snapshot = service.snapshotVersion(), bad = {...first.header,manifest:makeManifest({...first.header.manifest,sequenceHash:sequenceHash([])})};
  expect(()=>service.ingest(bad,first.records,device)).toThrow('SEQUENCE_HASH_MISMATCH'); expect(service.snapshotIsCurrent(snapshot)).toBe(true);
  service.ingest(first.header,first.records,device); expect(service.snapshotIsCurrent(snapshot)).toBe(false);
});
