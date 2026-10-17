import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { TRANSFER_SOURCES } from '../../domain';
import type { SyncActor } from '../../domain/sync';
import { hash } from '../../adapters/local/imports/identity';
import { CompatibleSyncService } from '../../adapters/local/imports/sync/legacy';
import { readSyncView } from '../../adapters/local/imports/sync/read';
import { listReviewSummaries } from '../../adapters/local/imports/sync/reviews';
import { resolveScope } from '../../sync/admission';
import {
  PHASE0_DEVICE,
  phase0Export,
  phase0Import,
  writePhase0Pricing,
  writePhase0Source,
} from '../fixtures/sync-agent-phase0';
import { fromEvents } from '../phase1/fixtures';

let directory:string,legacy:string,service:CompatibleSyncService;
const device:SyncActor={role:'device',deviceId:PHASE0_DEVICE};

beforeEach(()=>{
  directory=mkdtempSync(join(tmpdir(),'sync-agent-phase5-'));
  legacy=join(directory,'legacy-copy.db');
  service=new CompatibleSyncService(join(directory,'sync.db'));
});
afterEach(()=>{
  service.close();
  rmSync(directory,{recursive:true,force:true});
});

function stageCandidate(candidate:ReturnType<typeof fromEvents>) {
  service.begin(candidate.header,device);
  service.stage(PHASE0_DEVICE,candidate.header.batchId,0,candidate.records,device);
}

it('migration alone keeps review required; an explicit Owner grant adopts only an exact candidate',()=>{
  writePhase0Pricing(directory);
  writePhase0Source(directory,'claudeCode');
  const bundle=phase0Export(directory),receipt=phase0Import(bundle,legacy);
  service.migrateV1(legacy,{role:'owner',subject:'owner',reason:'shadow migration'});
  const source=bundle.events[0].source,sessionId=bundle.events[0].sessionId;
  const admission=resolveScope(service,{source,sessionId},device,legacy);
  expect(admission).toMatchObject({status:'review-required',code:'V1_ADOPTION_REVIEW_REQUIRED'});
  const owner:SyncActor={role:'owner',subject:'owner',reason:'explicit historical scope and exact batch authorization'};
  service.register(admission.scope,'Synthetic device',owner);
  const candidate=fromEvents(bundle.events,admission.scope,undefined,'exact');
  stageCandidate(candidate);
  service.adopt(candidate.header,receipt.id,owner);
  expect(service.commit(PHASE0_DEVICE,candidate.header.batchId,device).status).toBe('committed');
  const view=readSyncView(service);
  expect(view.events).toHaveLength(1);
  expect(view.events[0].inputTokens).toBe(100);
  expect(service.db.prepare('SELECT COUNT(*) n FROM sync_adoptions WHERE batch_id=?').get(receipt.id)!.n).toBe(1);
  expect(service.db.prepare('SELECT COUNT(*) n FROM sync_review_resolutions').get()!.n).toBe(0);
});

it('a mismatched collector candidate retains v1 and exposes only a redacted review summary',()=>{
  writePhase0Pricing(directory);
  writePhase0Source(directory,'geminiCli');
  const bundle=phase0Export(directory);
  const receipt=phase0Import(bundle,legacy);
  service.migrateV1(legacy,{role:'owner',subject:'owner',reason:'shadow migration'});
  const source=bundle.events[0].source,sessionId=bundle.events[0].sessionId;
  const admission=resolveScope(service,{source,sessionId},device,legacy);
  const owner:SyncActor={role:'owner',subject:'owner',reason:'explicit historical review'};
  service.register(admission.scope,'Synthetic device',owner);
  const changed=bundle.events.map(event=>({...event,inputTokens:event.inputTokens+1}));
  const candidate=fromEvents(changed,admission.scope,undefined,'changed');
  stageCandidate(candidate);
  expect(()=>service.adopt(candidate.header,receipt.id,owner)).toThrow('ADOPTION_REVIEW_REQUIRED');
  expect(service.commit(PHASE0_DEVICE,candidate.header.batchId,device)).toMatchObject({status:'review-required',code:'V1_ADOPTION_REVIEW_REQUIRED'});
  expect(readSyncView(service).events).toHaveLength(1);
  expect(readSyncView(service).events[0].inputTokens).toBe(100);
  const reviews=listReviewSummaries(service.db);
  expect(reviews).toHaveLength(1);
  expect(reviews[0]).toMatchObject({source:'geminiCli',code:'V1_ADOPTION_REVIEW_REQUIRED',oldDataRetained:true});
  expect(JSON.stringify(reviews)).not.toContain(sessionId);
});

it.each(TRANSFER_SOURCES)('%s keeps a real collector baseline and ordinary append reviewable without duplicates',source=>{
  writePhase0Pricing(directory);
  writePhase0Source(directory,source);
  const bundle=phase0Export(directory),event=bundle.events[0],scope={deviceId:PHASE0_DEVICE,source,sessionId:event.sessionId,originId:'origin:'+source};
  service.register(scope,'Synthetic device',{role:'owner',subject:'owner',reason:'fixture'});
  const first=fromEvents([event],scope,undefined,'first');stageCandidate(first);service.commit(PHASE0_DEVICE,first.header.batchId,device);
  const next=fromEvents([event,{...event,eventId:hash(['next',source,event.eventId]),timestampMs:event.timestampMs+1000}],scope,first.header,'next');
  stageCandidate(next);service.commit(PHASE0_DEVICE,next.header.batchId,device);
  expect(readSyncView(service).events).toHaveLength(2);
});
