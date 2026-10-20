import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach,afterEach,it,expect } from 'vitest';
import { TRANSFER_SOURCES,dateWindow } from '../../domain';
import type { SyncActor } from '../../domain/sync';
import { hash,stableJson,contentHash } from '../../adapters/local/imports/identity';
import { ImportStore } from '../../adapters/local/imports/store';
import { rollbackImport,previewImport,commitImport } from '../../adapters/local/imports/service';
import { loadImportedEvents } from '../../adapters/local/imports/layer';
import { summarizeUsageEvents } from '../../adapters/local/aggregation/summarize';
import { applyCommandCodeQuota } from '../../adapters/local/pricing-schedule';
import { CompatibleSyncService } from '../../adapters/local/imports/sync/legacy';
import { readSyncView } from '../../adapters/local/imports/sync/read';
import { makeManifest } from '../../adapters/local/imports/sync/contract';
import { PHASE0_DEVICE,PHASE0_AT,PHASE0_NOW,PHASE0_MODEL,PHASE0_PRICE,writePhase0Home,writePhase0Source,writePhase0Pricing,phase0Export,phase0Rehash,phase0Import } from '../fixtures/sync-agent-phase0';
import { fromEvents } from './fixtures';
import { priceSyncRecord } from '../../adapters/local/imports/sync/pricing';
let home:string,path:string,service:CompatibleSyncService;
const owner:SyncActor={role:'owner',subject:'fixture-owner',reason:'exact adoption'},device:SyncActor={role:'device',deviceId:PHASE0_DEVICE};
beforeEach(()=>{home=mkdtempSync(join(tmpdir(),'sync-agent-phase1-'));path=join(home,'legacy-copy.db');service=new CompatibleSyncService(join(home,'sync.db'));writePhase0Pricing(home);});
afterEach(()=>{service.close();rmSync(home,{recursive:true,force:true});});
function comparable(value:unknown):unknown {if(Array.isArray(value))return value.map(comparable).sort((a,b)=>stableJson(a).localeCompare(stableJson(b),'en'));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='source'&&typeof v==='string'&&v.includes(' / ')?v.split(' / ').sort().join(' / '):comparable(v)]));return value;}
function stage(candidate:ReturnType<typeof fromEvents>){service.begin(candidate.header,device);service.stage(PHASE0_DEVICE,candidate.header.batchId,0,candidate.records,device);}
it('v1 exact loader parity, idempotent interrupted migration, all supported-source adoptions and three windows',()=>{
  writePhase0Home(home);const original=phase0Export(home),dates=[PHASE0_NOW-45*86400000,PHASE0_NOW-15*86400000,PHASE0_AT];
  const bundle=phase0Rehash({...original,events:dates.flatMap((at,i)=>original.events.map(event=>({...event,eventId:hash([i,event.eventId]),timestampMs:at})))});
  const first=phase0Import(bundle,path);phase0Import(phase0Rehash({...bundle,exportId:randomUUID()}),path);
  expect(service.migrateV1(path,owner,1)).toBe(1);expect(service.migrateV1(path,owner)).toBe(1);
  const revision=service.revision();expect(service.migrateV1(path,owner)).toBe(0);expect(service.revision()).toBe(revision);
  const legacy=loadImportedEvents([],new Map(),{},path).events.map(applyCommandCodeQuota);
  const summary=(rows:typeof legacy,range:'7d'|'30d'|'all')=>{const window=dateWindow(range,PHASE0_NOW,rows.map(r=>r.dateKey).sort()[0]);return summarizeUsageEvents(rows.filter(row=>row.dateKey>=window.from&&row.dateKey<=window.to),home,new Map(),PHASE0_AT,window);};
  const parity=()=>{for(const [range,multiplier] of [['7d',1],['30d',2],['all',3]] as const){const actual=summary(readSyncView(service).events,range);expect(comparable(actual)).toEqual(comparable(summary(legacy,range)));expect(actual.totals.totalTokens).toBe(130*TRANSFER_SOURCES.length*multiplier);}};parity();
  const store=new ImportStore(path),batches=store.batches();store.close();
  for(const source of TRANSFER_SOURCES){const events=bundle.events.filter(e=>e.source===source),scope={deviceId:PHASE0_DEVICE,source,sessionId:events[0].sessionId,originId:'origin:'+source};service.register(scope,'Synthetic device',owner);
    const candidate=fromEvents(events,scope,undefined,'adopt:'+source);stage(candidate);for(const batch of batches)service.adopt(candidate.header,batch.receipt.id,owner);
    expect(service.commit(PHASE0_DEVICE,candidate.header.batchId,device).status).toBe('committed');parity();}
  expect(readSyncView(service).events).toHaveLength(3*TRANSFER_SOURCES.length);service.rebuild(owner);service.rebuildLegacyProjection();parity();
  const tables=service.db.prepare('SELECT COUNT(*) n FROM sync_legacy_members').get()!.n;expect(tables).toBe(6*TRANSFER_SOURCES.length);
  rollbackImport(first.id,path);service.migrateV1(path,owner);parity();
});
it('unadopted v1 survives review, wrong price or mappings require Owner review, and double legacy rollback retains independent v2',()=>{
  writePhase0Source(home,'claudeCode');const bundle=phase0Export(home),a=phase0Import(bundle,path),b=phase0Import(phase0Rehash({...bundle,exportId:randomUUID()}),path);service.migrateV1(path,owner);
  const scope={deviceId:PHASE0_DEVICE,source:'claudeCode' as const,sessionId:bundle.events[0].sessionId,originId:'c'};service.register(scope,'Synthetic device',owner);
  const candidate=fromEvents(bundle.events,scope,undefined,'blocked');expect(service.ingest(candidate.header,candidate.records,device).code).toBe('V1_ADOPTION_REVIEW_REQUIRED');expect(readSyncView(service).events).toHaveLength(1);
  const allowed={...candidate,header:{...candidate.header,batchId:'allowed'}};stage(allowed);service.adopt(allowed.header,a.id,owner);service.adopt(allowed.header,b.id,owner);service.commit(PHASE0_DEVICE,'allowed',device);
  rollbackImport(a.id,path);service.migrateV1(path,owner);expect(readSyncView(service).events[0].inputTokens).toBe(100);rollbackImport(b.id,path);service.migrateV1(path,owner);expect(readSyncView(service).events).toHaveLength(1);
  service.rollback(allowed.header.manifest.generationId,owner);expect(readSyncView(service).events).toHaveLength(0);
});
it('legacy live overrides, native priority and frozen v2/explicit Owner reprice remain separate',()=>{
  writePhase0Source(home,'claudeCode');const bundle=phase0Export(home),receipt=phase0Import(bundle,path);service.migrateV1(path,owner);
  const prices=new Map([[PHASE0_MODEL,{...PHASE0_PRICE,inputPerMillion:2}]]);
  expect(readSyncView(service,[],prices).events[0].cost).toBeCloseTo(.000245,10);
  const scope={deviceId:PHASE0_DEVICE,source:'claudeCode' as const,sessionId:bundle.events[0].sessionId,originId:'c'},first=fromEvents(bundle.events,scope,undefined,'first');service.register(scope,'Synthetic device',owner);stage(first);service.adopt(first.header,receipt.id,owner);service.commit(PHASE0_DEVICE,'first',device);
  expect(readSyncView(service,[],prices).events[0].cost).toBeCloseTo(.000145,10);
  const native=priceSyncRecord(scope,first.records[0],first.header.basis,{},'Synthetic device');expect(readSyncView(service,[native]).events).toHaveLength(1);
  const basis={...first.header.basis,rates:{[PHASE0_MODEL]:{...PHASE0_PRICE,inputPerMillion:2}}},next=fromEvents(bundle.events,scope,first.header,'reprice');
  next.header.basis=basis;next.header.manifest=makeManifest({...next.header.manifest,basisHash:hash(basis),intent:'reprice'});
  expect(service.ingest(next.header,next.records,device).code).toBe('EXPLICIT_OWNER_REQUIRED');next.header.batchId='owner-reprice';expect(service.ingest(next.header,next.records,owner).status).toBe('committed');
  expect(readSyncView(service).events[0].cost).toBeCloseTo(.000245,10);service.rollback(next.header.manifest.generationId,owner);expect(readSyncView(service).events[0].cost).toBeCloseTo(.000145,10);
});
it('manual v1 arriving after v2 is quarantined as overlap rather than added twice',()=>{
  writePhase0Source(home,'claudeCode');const bundle=phase0Export(home),scope={deviceId:PHASE0_DEVICE,source:'claudeCode' as const,sessionId:bundle.events[0].sessionId,originId:'c'};service.register(scope,'Synthetic device',owner);
  const candidate=fromEvents(bundle.events,scope);service.ingest(candidate.header,candidate.records,device);phase0Import(bundle,path);service.migrateV1(path,owner);
  expect(readSyncView(service).events).toHaveLength(1);expect(readSyncView(service).issues).toContain('LEGACY_OVERLAP_REVIEW_REQUIRED');
});
it('replaying a pre-rollback v1 copy cannot resurrect legacy membership',()=>{
  writePhase0Source(home,'claudeCode');const bundle=phase0Export(home),receipt=phase0Import(bundle,path);service.migrateV1(path,owner);
  rollbackImport(receipt.id,path);service.migrateV1(path,owner);expect(readSyncView(service).events).toHaveLength(0);
  const stale=new DatabaseSync(path);try{stale.prepare('UPDATE batches SET status=?,receipt=? WHERE id=?').run('active',JSON.stringify(receipt),receipt.id);}finally{stale.close();}
  expect(()=>service.migrateV1(path,owner)).toThrow('LEGACY_ROLLBACK_FENCE');expect(readSyncView(service).events).toHaveLength(0);
});
it('weak→strong legacy bridges and adoption preserve the selected strong batch provenance',()=>{
  writePhase0Source(home,'geminiCli',{withoutId:true});const weak=phase0Export(home),a=phase0Import(weak,path);
  writePhase0Source(home,'geminiCli');const strong=phase0Export(home),b=phase0Import(strong,path);service.migrateV1(path,owner);
  const expected=loadImportedEvents([],new Map(),{},path).events.map(applyCommandCodeQuota);expect(expected).toHaveLength(1);expect(expected[0].importBatchId).toBe(b.id);
  expect(readSyncView(service).events).toEqual(expected);
  const scope={deviceId:PHASE0_DEVICE,source:'geminiCli' as const,sessionId:strong.events[0].sessionId,originId:'g'};service.register(scope,'Synthetic device',owner);
  const candidate=fromEvents(strong.events,scope,undefined,'bridge');stage(candidate);service.adopt(candidate.header,a.id,owner);service.adopt(candidate.header,b.id,owner);service.commit(PHASE0_DEVICE,'bridge',device);
  expect(readSyncView(service).events[0].importBatchId).toBe(b.id);expect(readSyncView(service).events[0].inputTokens).toBe(100);
});
it('manual mappings/native target metadata and new v2 generation match the old reader',()=>{
  writePhase0Source(home,'claudeCode');const bundle=phase0Export(home),scope={deviceId:PHASE0_DEVICE,source:'claudeCode' as const,sessionId:bundle.events[0].sessionId,originId:'c'};
  const candidate=fromEvents(bundle.events,scope),target={...priceSyncRecord(scope,candidate.records[0],candidate.header.basis,{},'Synthetic device'),eventId:hash('target'),sessionId:'target',projectKey:'mapped-target',projectName:'Mapped project',workspacePath:'D:/synthetic-target'};
  const mappings={[bundle.events[0].projectKey]:target.projectKey},context={events:[target],pricing:new Map(),aliases:{}};
  const preview=previewImport(bundle,mappings,{storePath:path,context}),receipt=commitImport(preview.previewId,{storePath:path,context});service.migrateV1(path,owner);
  const expected=loadImportedEvents([target],new Map(),{},path).events.map(applyCommandCodeQuota);
  expect(readSyncView(service,[target]).events.filter(row=>row.eventId!==target.eventId)).toEqual(expected);
  service.register(scope,'Synthetic device',owner);candidate.header.mappings=mappings;candidate.header.manifest=makeManifest({...candidate.header.manifest,mappingsHash:hash(mappings)});stage(candidate);service.adopt(candidate.header,receipt.id,owner);service.commit(PHASE0_DEVICE,candidate.header.batchId,device);
  const actual=readSyncView(service,[target]).events.find(row=>row.eventId===bundle.events[0].eventId)!;expect(actual.projectName).toBe('Mapped project');expect(actual.workspacePath).toBe('D:/synthetic-target');expect(actual.cost).toBe(expected[0].cost);
});
it('CommandCode peak/off-peak full summary, nominal and API-equivalent values survive exact adoption',()=>{
  writePhase0Source(home,'commandcode',{model:'deepseek-v4-pro',cost:.2,at:Date.parse('2026-10-15T01:00:00Z')});const initial=phase0Export(home);
  const bundle=phase0Rehash({...initial,events:[initial.events[0],{...initial.events[0],eventId:hash('off-peak'),timestampMs:PHASE0_AT}],prices:{'deepseek-v4-pro':PHASE0_PRICE}}),receipt=phase0Import(bundle,path);service.migrateV1(path,owner);
  const old=loadImportedEvents([],new Map(),{},path).events.map(applyCommandCodeQuota),scope={deviceId:PHASE0_DEVICE,source:'commandcode' as const,sessionId:bundle.events[0].sessionId,originId:'cc'};
  service.register(scope,'Synthetic device',owner);const candidate=fromEvents(bundle.events,scope);candidate.header.basis.rates={'deepseek-v4-pro':PHASE0_PRICE};candidate.header.manifest=makeManifest({...candidate.header.manifest,basisHash:hash(candidate.header.basis)});
  stage(candidate);service.adopt(candidate.header,receipt.id,owner);service.commit(PHASE0_DEVICE,candidate.header.batchId,device);
  const rows=readSyncView(service).events,summary=(events:typeof rows)=>comparable(summarizeUsageEvents(events,home,new Map(),PHASE0_AT));expect(summary(rows)).toEqual(summary(old));
  expect(rows.map(row=>row.nominalCost)).toEqual([.2,.2]);expect(rows.map(row=>row.cost)).toEqual([.4,.2]);expect((rows[0] as {apiEquivalentCost?:number}).apiEquivalentCost).toBeCloseTo(.00029,10);
});
it('many weak legacy representations require explicit review before one strong target is adopted',()=>{
  writePhase0Source(home,'geminiCli');const strong=phase0Export(home),event=strong.events[0],weakId=hash([event.source,event.sessionId,event.timestampMs,event.inputTokens,event.outputTokens,event.cacheReadTokens,event.cacheCreationTokens,event.reasoningTokens]);
  const weak=phase0Rehash({...strong,events:[{...event,eventId:weakId},{...event,eventId:contentHash(event)}]}),receipt=phase0Import(weak,path);service.migrateV1(path,owner);expect(readSyncView(service).events).toHaveLength(1);
  const scope={deviceId:PHASE0_DEVICE,source:'geminiCli' as const,sessionId:event.sessionId,originId:'g'};service.register(scope,'Synthetic device',owner);const candidate=fromEvents(strong.events,scope);stage(candidate);
  expect(()=>service.adopt(candidate.header,receipt.id,owner)).toThrow('ADOPTION_REVIEW_REQUIRED');expect(readSyncView(service).events).toHaveLength(1);
  service.adopt(candidate.header,receipt.id,owner,'owner-reviewed');expect(service.commit(PHASE0_DEVICE,candidate.header.batchId,device).status).toBe('committed');expect(readSyncView(service).events).toHaveLength(1);
});
