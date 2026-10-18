import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {AgentState,SyncEngine,RemoteError,captureHome,buildCandidate,resumeHeld,classifyIssues} from '../dist/library.mjs';
import {fixtures as f} from './helpers.mjs';

const deviceId='00000000-0000-4000-8000-000000000003';
const scope=({source,sessionId})=>({source,sessionId,deviceId,originId:f.hash(['incept-origin/1',source,sessionId])});
async function sandbox(fn){const dir=mkdtempSync(join(tmpdir(),'incept-hotfix-'));try{await fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}}
async function scan(home,dir,parents=[],allowed=['claudeCode']){const path=join(dir,'snapshot-'+randomUUID());try{return await captureHome(home,path,allowed,parents);}finally{rmSync(path,{recursive:true,force:true});}}

test('a reviewed scope records a durable held successor and does not duplicate it',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Home(home,1);const first=(await scan(home,dir)).captures.find(c=>c.source==='claudeCode');assert(first);
  let state=new AgentState(join(dir,'state'));const review=buildCandidate(first,scope(first),undefined,'review-seed');state.enqueue(review,'seed-signature');state.fail(review.header.batchId,'V1_ADOPTION_REVIEW_REQUIRED',true);
  f.writePhase0Home(home,2);
  const config={version:1,endpoint:'https://synthetic.invalid',deviceId,home,allowedSources:['claudeCode']};
  const offline={request:async()=>{throw new RemoteError('NETWORK_UNAVAILABLE',503);}};
  const collect=(h,_allowed,parents)=>scan(h,dir,parents);
  try{
    const result=await new SyncEngine(state,config,offline,collect).run();
    assert.equal(state.reviewCount(),1);assert.equal(state.heldCount(),1);assert.equal(result.held,1);assert.equal(state.pending().length,0);
    const held=state.db.prepare("SELECT header_json FROM outbox WHERE state='held'").get();const heldHeader=JSON.parse(String(held.header_json));
    assert.equal(heldHeader.manifest.parent.manifestHash,JSON.parse(String(state.db.prepare("SELECT header_json FROM outbox WHERE state='review'").get().header_json)).manifest.manifestHash);
    const heldBatch=heldHeader.batchId;
    await new SyncEngine(state,config,offline,collect).run();
    assert.equal(state.heldCount(),1);assert.equal(state.db.prepare("SELECT batch FROM outbox WHERE state='held'").get().batch,heldBatch);
    state.close();state=new AgentState(join(dir,'state'));assert.equal(state.heldCount(),1);assert.equal(state.reviewCount(),1);
  }finally{state.close();}
}));

test('resume-held rebases the successor on the committed server head and leaves a pending upload',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Home(home,1);const first=(await scan(home,dir)).captures.find(c=>c.source==='claudeCode');assert(first);
  const service=new f.CompatibleSyncService(join(dir,'cloud.db')),actor={role:'device',deviceId};
  try{
    f.resolveScope(service,first,actor);const baseline=buildCandidate(first,scope(first),undefined,'baseline');service.ingest(baseline.header,baseline.records,actor);
    f.writePhase0Home(home,2);const second=(await scan(home,dir,[baseline])).captures.find(c=>c.source==='claudeCode');assert(second);
    const state=new AgentState(join(dir,'state'));const successor=buildCandidate(second,scope(second),baseline,'held-successor');state.hold(successor,'held-signature');
    try{
      const http={request:async path=>{assert.equal(path,'/scopes/resolve');return {scope:baseline.header.manifest.scope,status:'registered',headManifest:baseline.header.manifest.manifestHash,head:baseline.header};}};
      const result=await resumeHeld(state,http,{version:1,endpoint:'https://synthetic.invalid',deviceId,home,allowedSources:['claudeCode']},successor.header.batchId);
      assert.equal(result.resumed,true);assert.equal(state.heldCount(),0);assert.equal(state.pending().length,1);
      const row=state.pending()[0],header=JSON.parse(row.header_json);assert.equal(header.manifest.parent.manifestHash,baseline.header.manifest.manifestHash);
      const receipt=service.ingest(header,state.page(row.batch,0),actor);assert.equal(receipt.status,'committed');state.acknowledge(row.batch,receipt);assert.equal(state.status().receiptCount,1);
    }finally{state.close();}
  }finally{service.close();}
}));

test('unauthorized collector issues are filtered and empty-usage is warning-only',async()=>{
  const home=mkdtempSync(join(tmpdir(),'incept-hotfix-home-'));try{
    f.writePhase0Home(home,1);const snap=join(home,'snapshot');const captured=await captureHome(home,snap,['claudeCode'],[]);assert(!captured.issues.some(i=>i.startsWith('codex:')));
    const classified=classifyIssues(['codex:COLLECTOR_INCOMPLETE','commandcode:EMPTY_USAGE_SKIPPED','claudeCode:INCOMPLETE_READ'],['commandcode','claudeCode']);
    assert.deepEqual(classified.warnings,['commandcode:EMPTY_USAGE_SKIPPED']);assert.deepEqual(classified.blocking,['claudeCode:INCOMPLETE_READ']);
  }finally{rmSync(home,{recursive:true,force:true});}
});
