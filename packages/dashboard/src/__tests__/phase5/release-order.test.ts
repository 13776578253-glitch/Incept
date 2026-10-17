import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,expect,it} from 'vitest';
import type {SyncActor} from '../../domain/sync';
import {hash} from '../../adapters/local/imports/identity';
import {CompatibleSyncService} from '../../adapters/local/imports/sync/legacy';
import {readSyncView} from '../../adapters/local/imports/sync/read';
import {listReviewSummaries} from '../../adapters/local/imports/sync/reviews';
import {projection} from '../../sync/projection';
import {resolveScope} from '../../sync/admission';
import {PHASE0_DEVICE,PHASE0_NOW,phase0Export,phase0Import,writePhase0Pricing,writePhase0Source} from '../fixtures/sync-agent-phase0';
import {fromEvents} from '../phase1/fixtures';

let directory:string,legacy:string,service:CompatibleSyncService;
const device:SyncActor={role:'device',deviceId:PHASE0_DEVICE};
const owner:SyncActor={role:'owner',subject:'owner',reason:'release order fixture'};

beforeEach(()=>{
  directory=mkdtempSync(join(tmpdir(),'sync-release-order-'));
  legacy=join(directory,'legacy.db');
  service=new CompatibleSyncService(join(directory,'sync.db'));
  writePhase0Pricing(directory);
  writePhase0Source(directory,'claudeCode');
  phase0Import(phase0Export(directory),legacy);
  service.migrateV1(legacy,owner);
});
afterEach(()=>{service.close();rmSync(directory,{recursive:true,force:true});});

it('Plan A: migration and v2 read complete before a truly new Agent event increases the v2 chart',()=>{
  const chartHome=join(directory,'chart-home');mkdirSync(chartHome);
  const chartBefore=projection(service,chartHome,'all',0,legacy,PHASE0_NOW).totals.totalTokens;
  const baseline=readSyncView(service);
  expect(baseline.events).toHaveLength(1);
  expect(baseline.events.reduce((total,event)=>total+event.inputTokens,0)).toBe(100);

  const template=phase0Export(directory).events[0],sessionId='release-order-new-session';
  const admission=resolveScope(service,{source:template.source,sessionId},device,legacy);
  expect(admission).toMatchObject({status:'registered'});
  const event={...template,eventId:hash(['release-order-new',template.eventId]),sessionId,timestampMs:template.timestampMs+1_000};
  const candidate=fromEvents([event],admission.scope,undefined,'release-order-new');
  service.begin(candidate.header,device);
  service.stage(PHASE0_DEVICE,candidate.header.batchId,0,candidate.records,device);
  expect(service.commit(PHASE0_DEVICE,candidate.header.batchId,device).status).toBe('committed');

  const after=readSyncView(service);
  expect(after.events).toHaveLength(2);
  expect(after.events.reduce((total,row)=>total+row.inputTokens,0)).toBe(200);
  expect(after.dataRevision).toBeGreaterThan(baseline.dataRevision);
  expect(projection(service,chartHome,'all',0,legacy,PHASE0_NOW).totals.totalTokens).toBeGreaterThan(chartBefore);
});

it('an unclaimed v1 overlap after the switch enters review and preserves the old v2 statistics',()=>{
  const chartHome=join(directory,'chart-home');mkdirSync(chartHome);
  const chartBefore=projection(service,chartHome,'all',0,legacy,PHASE0_NOW).totals.totalTokens;
  const before=readSyncView(service);
  expect(before.events).toHaveLength(1);
  const template=phase0Export(directory).events[0];
  const admission=resolveScope(service,{source:template.source,sessionId:template.sessionId},device,legacy);
  expect(admission).toMatchObject({status:'review-required',code:'V1_ADOPTION_REVIEW_REQUIRED'});

  service.register(admission.scope,'release-order overlap',owner);
  const changed={...template,eventId:hash(['release-order-overlap',template.eventId]),timestampMs:template.timestampMs+1_000,inputTokens:(template.inputTokens??0)+1};
  const candidate=fromEvents([changed],admission.scope,undefined,'release-order-overlap');
  service.begin(candidate.header,device);
  service.stage(PHASE0_DEVICE,candidate.header.batchId,0,candidate.records,device);
  const receipt=service.commit(PHASE0_DEVICE,candidate.header.batchId,device);
  expect(receipt).toMatchObject({status:'review-required',code:'V1_ADOPTION_REVIEW_REQUIRED'});

  const after=readSyncView(service);
  expect(after.events).toHaveLength(1);
  expect(after.events.reduce((total,row)=>total+row.inputTokens,0)).toBe(100);
  expect(after.dataRevision).toBe(before.dataRevision);
  expect(projection(service,chartHome,'all',0,legacy,PHASE0_NOW).totals.totalTokens).toBe(chartBefore);
  expect(service.db.prepare('SELECT COUNT(*) n FROM sync_adoptions').get()!.n).toBe(0);
  expect(listReviewSummaries(service.db)).toEqual(expect.arrayContaining([
    expect.objectContaining({source:template.source,code:'V1_ADOPTION_REVIEW_REQUIRED',oldDataRetained:true}),
  ]));
});
