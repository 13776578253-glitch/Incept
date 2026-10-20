import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,appendFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {AgentState,SyncEngine,captureHome,buildCandidate} from '../dist/library.mjs';
import {fixtures as f} from './helpers.mjs';

const deviceId='00000000-0000-4000-8000-000000000003',actor={role:'device',deviceId};
const at=Date.parse('2026-10-15T23:59:00Z');
async function sandbox(action){const dir=mkdtempSync(join(tmpdir(),'incept-integrity-'));try{await action(dir);}finally{rmSync(dir,{recursive:true,force:true});}}
function point(timestamp,input,last=input,extra={}){return {timestamp:new Date(timestamp).toISOString(),type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:input,cached_input_tokens:0,output_tokens:0,reasoning_output_tokens:0,...extra},...(last===null?{}:{last_token_usage:{input_tokens:last,cached_input_tokens:0,output_tokens:0,reasoning_output_tokens:0}})}}};}
function session(home,id,points){const file=join(home,'.codex','sessions',id+'.jsonl');mkdirSync(join(home,'.codex','sessions'),{recursive:true});writeFileSync(file,[{type:'session_meta',payload:{id,cwd:'D:/synthetic-project'}},{type:'turn_context',payload:{model:f.PHASE0_MODEL}},...points].map(JSON.stringify).join('\n')+'\n');return file;}
async function scan(home,dir,parents=[],options={}){const snapshot=join(dir,'snapshot-'+randomUUID());try{return await captureHome(home,snapshot,['codex'],parents,options);}finally{rmSync(snapshot,{recursive:true,force:true});}}
const tokenSum=records=>records.reduce((sum,{event:e})=>sum+e.inputTokens+e.outputTokens+e.cacheReadTokens+e.cacheCreationTokens+e.reasoningTokens,0);
const scope=c=>({source:c.source,sessionId:c.sessionId,deviceId,originId:f.hash(['incept-origin/1',c.source,c.sessionId])});
function localHttp(service){const batches=new Map();return {request:async(path,method='GET',body)=>{
  if(path==='/scopes/resolve')return f.resolveScope(service,body,actor);
  if(path==='/batches'){const header=body.header;batches.set(header.batchId,{header,records:[]});return {nextOffset:0};}
  const match=/^\/batches\/([^/]+)(?:\/pages\/(\d+)|\/(commit))?$/.exec(path);assert(match,path);const batch=batches.get(match[1]);
  if(method==='GET')return batch?.receipt?{receipt:batch.receipt}:{state:'missing'};
  assert(batch);if(match[2]!==undefined){assert.equal(Number(match[2]),batch.records.length);batch.records.push(...body.records);return {nextOffset:batch.records.length};}
  assert.equal(match[3],'commit');batch.receipt=service.ingest(batch.header,batch.records,actor);return {receipt:batch.receipt};
}};}

test('strict capture quarantines only the incomplete Codex session and preserves raw files',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);const file=session(home,'broken',[point(at,1000,10)]),before=readFileSync(file);
  session(home,'healthy',[point(at+1000,30),point(at+2000,50,20)]);
  const result=await scan(home,dir);assert.deepEqual(result.captures.map(c=>c.sessionId),['healthy']);assert.equal(tokenSum(result.captures[0].records),50);
  const isolation=result.isolations.find(i=>i.sessionId==='broken');assert(isolation);assert.equal(isolation.source,'codex');assert.match(isolation.reason,/OPENING/);assert.equal(isolation.coverage,'session');assert.equal(isolation.unattributedTokens,990);assert(isolation.affectedRecords>=1);assert.deepEqual(readFileSync(file),before);
}));

test('all sessions quarantined reports source_failed and repeated scans notify only once across restart',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);session(home,'broken',[point(at,1000,10)]);let state=new AgentState(join(dir,'state'));
  const config={version:1,endpoint:'https://synthetic.invalid',deviceId,home,allowedSources:['codex']},http={request:async()=>{assert.fail('quarantined records must not upload');}},collect=(h,_a,parents)=>scan(h,dir,parents);
  try{const first=await new SyncEngine(state,config,http,collect).run();assert.equal(first.outcome,'source_failed');assert.equal(first.sent,0);assert.equal(first.quarantineNew,1);assert.equal(first.quarantineActive,1);assert.equal(state.status().receiptCount,0);state.close();state=new AgentState(join(dir,'state'));
    const second=await new SyncEngine(state,config,http,collect).run();assert.equal(second.outcome,'source_failed');assert.equal(second.quarantineNew,0);assert.equal(second.quarantineActive,1);const rows=state.sessionIsolations();assert.equal(rows.length,1);assert.equal(rows[0].sessionId,'broken');assert.equal(rows[0].occurrences,2);
  }finally{state.close();}
}));

test('partial upload stays partial on repetition and a newly created healthy session continues incrementally',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);session(home,'broken',[point(at,1000,10)]);session(home,'healthy',[point(at+1000,30)]);
  const state=new AgentState(join(dir,'state')),service=new f.CompatibleSyncService(join(dir,'cloud.db')),config={version:1,endpoint:'https://synthetic.invalid',deviceId,home,allowedSources:['codex']};
  const engine=new SyncEngine(state,config,localHttp(service),(h,_a,parents)=>scan(h,dir,parents));
  try{const first=await engine.run();assert.equal(first.outcome,'partial_success');assert.equal(first.sent,1);assert.equal(first.newTokens,30);assert.equal(first.quarantineNew,1);
    const second=await engine.run();assert.equal(second.outcome,'partial_success');assert.equal(second.sent,0);assert.equal(second.newTokens,0);assert.equal(second.quarantineNew,0);assert.equal(state.status().receiptCount,1);
    session(home,'new-healthy',[point(at+2000,17)]);const third=await engine.run();assert.equal(third.outcome,'partial_success');assert.equal(third.sent,1);assert.equal(third.newTokens,17);assert.equal(state.status().receiptCount,2);assert.equal(f.readSyncView(service).events.reduce((sum,e)=>sum+e.inputTokens,0),47);
  }finally{state.close();service.close();}
}));

test('explicit recovery takes only adjacent reliable deltas after the anchor and never dates the missing prefix',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);const nextDay=Date.parse('2026-10-16T00:01:00Z');session(home,'broken',[point(at,25_459_535,null),point(nextDay,25_459_555,20),point(nextDay+1000,25_459_562,7)]);
  assert.equal((await scan(home,dir)).captures.length,0);
  const result=await scan(home,dir,[],{recoveryRanges:[{source:'codex',sessionId:'broken',afterTimestampMs:at}]});assert.equal(result.captures.length,1);const capture=result.captures[0];assert.equal(tokenSum(capture.records),27);assert.deepEqual(capture.records.map(r=>r.event.timestampMs),[nextDay,nextDay+1000]);assert.equal(result.isolations[0].coverage,'prefix');assert.equal(result.isolations[0].unattributedTokens,25_459_535);
  const service=new f.CompatibleSyncService(join(dir,'cloud.db'));try{f.resolveScope(service,capture,actor);const candidate=buildCandidate(capture,scope(capture),undefined,'recovered');assert.equal(service.ingest(candidate.header,candidate.records,actor).status,'committed');assert.equal(f.readSyncView(service).events.reduce((sum,e)=>sum+e.inputTokens,0),27);}finally{service.close();}
}));

test('recovered intervals retain their identities on repeat and admit only newly appended usage',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);const file=session(home,'broken',[point(at,1000,null),point(at+1000,1010,10)]),options={recoveryRanges:[{source:'codex',sessionId:'broken',afterTimestampMs:at}]};
  const first=await scan(home,dir,[],options),capture=first.captures[0],parent=buildCandidate(capture,scope(capture),undefined,'recovery-parent');assert(parent.proofs.every(proof=>proof.recoveryAfterTimestampMs===at));
  const again=await scan(home,dir,[parent],options);assert.deepEqual(first.captures[0].records,again.captures[0].records);appendFileSync(file,JSON.stringify(point(at+2000,1017,7))+'\n');const appended=await scan(home,dir,[parent],options);assert.equal(tokenSum(appended.captures[0].records),17);assert.deepEqual(appended.captures[0].records.slice(0,1),first.captures[0].records);
  const service=new f.CompatibleSyncService(join(dir,'cloud.db'));try{f.resolveScope(service,capture,actor);assert.equal(service.ingest(parent.header,parent.records,actor).status,'committed');const successor=buildCandidate(appended.captures[0],scope(capture),parent,'recovery-append');assert.equal(service.ingest(successor.header,successor.records,actor).status,'committed');assert.equal(f.readSyncView(service).events.reduce((sum,e)=>sum+e.inputTokens,0),17);}finally{service.close();}
}));

test('a recovery range cannot reinterpret an existing committed session parent',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);session(home,'existing',[point(at,10)]);const capture=(await scan(home,dir)).captures[0],parent=buildCandidate(capture,scope(capture),undefined,'baseline');session(home,'existing',[point(at,1000,null),point(at+1000,1010,10)]);
  const result=await scan(home,dir,[parent],{recoveryRanges:[{source:'codex',sessionId:'existing',afterTimestampMs:at}]});assert.equal(result.captures.length,0);assert(result.isolations.some(i=>i.sessionId==='existing'));assert.equal(parent.records[0].event.inputTokens,10);
}));

test('invalid counters remain quarantined even with an explicit opening recovery range',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);session(home,'bad-counter',[point(at,1000,null),point(at+1000,1010,10,{cached_input_tokens:2000})]);session(home,'healthy',[point(at+2000,5)]);
  const result=await scan(home,dir,[],{recoveryRanges:[{source:'codex',sessionId:'bad-counter',afterTimestampMs:at}]});assert.deepEqual(result.captures.map(c=>c.sessionId),['healthy']);assert(result.isolations.some(i=>i.sessionId==='bad-counter'&&/COUNTER/.test(i.reason)));
}));

test('complete success and genuinely empty sources receive distinct outcomes',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);const state=new AgentState(join(dir,'state')),service=new f.CompatibleSyncService(join(dir,'cloud.db')),config={version:1,endpoint:'https://synthetic.invalid',deviceId,home,allowedSources:['codex']},engine=new SyncEngine(state,config,localHttp(service),(h,_a,parents)=>scan(h,dir,parents));
  try{assert.equal((await engine.run()).outcome,'no_change');session(home,'healthy',[point(at,9)]);assert.equal((await engine.run()).outcome,'complete_success');assert.equal((await engine.run()).outcome,'no_change');}finally{state.close();service.close();}
}));

test('quarantining an accepted parent preserves its head while a new healthy session uploads',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);session(home,'old-session',[point(at,10)]);const state=new AgentState(join(dir,'state')),service=new f.CompatibleSyncService(join(dir,'cloud.db')),config={version:1,endpoint:'https://synthetic.invalid',deviceId,home,allowedSources:['codex']},engine=new SyncEngine(state,config,localHttp(service),(h,_a,parents)=>scan(h,dir,parents));
  try{assert.equal((await engine.run()).sent,1);const oldParent=structuredClone(state.parents()[0]);session(home,'old-session',[point(at,1000,null),point(at+1000,1010,10)]);session(home,'new-session',[point(at+2000,7)]);const result=await engine.run();assert.equal(result.outcome,'partial_success');assert.equal(result.sent,1);assert.equal(result.newTokens,7);assert.equal(state.status().receiptCount,2);assert(!state.status().issues.includes('codex:ROTATION_UNVERIFIED'));assert.deepEqual(state.parents().find(p=>p.header.manifest.scope.sessionId==='old-session'),oldParent);assert.equal(f.readSyncView(service).events.reduce((sum,e)=>sum+e.inputTokens,0),17);
  }finally{state.close();service.close();}
}));

test('invalid timestamps and malformed JSON isolate their sessions without losing the healthy session',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);const invalid=point(at,10);invalid.timestamp='not-a-date';session(home,'invalid-time',[invalid]);const file=session(home,'malformed',[point(at+1000,9)]);appendFileSync(file,'{"truncated":\n');session(home,'healthy',[point(at+2000,7)]);
  const result=await scan(home,dir);assert.deepEqual(result.captures.map(c=>c.sessionId),['healthy']);assert(result.isolations.some(i=>i.sessionId==='invalid-time'&&i.reason==='INVALID_TIMESTAMP'));assert(result.isolations.some(i=>i.sessionId==='malformed'&&i.reason==='MALFORMED_RECORD'));assert.equal(tokenSum(result.captures[0].records),7);
}));

test('repairing a previously isolated session clears active quarantine but retains the audit ledger',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);session(home,'repairable',[point(at,1000,10)]);const state=new AgentState(join(dir,'state')),service=new f.CompatibleSyncService(join(dir,'cloud.db')),config={version:1,endpoint:'https://synthetic.invalid',deviceId,home,allowedSources:['codex']},engine=new SyncEngine(state,config,localHttp(service),(h,_a,parents)=>scan(h,dir,parents));
  try{const first=await engine.run();assert.equal(first.outcome,'source_failed');assert.equal(first.quarantineActive,1);session(home,'repairable',[point(at,10),point(at+1000,17,7)]);const repaired=await engine.run();assert.equal(repaired.outcome,'complete_success');assert.equal(repaired.quarantineNew,0);assert.equal(repaired.quarantineActive,0);assert.equal(repaired.newTokens,17);assert.equal(state.sessionIsolations().length,1);assert.equal(state.sessionIsolations()[0].active,false);const repeat=await engine.run();assert.equal(repeat.outcome,'no_change');assert.equal(repeat.newTokens,0);assert.equal(repeat.quarantineActive,0);
  }finally{state.close();service.close();}
}));

test('protocol-invalid session and model fields isolate only their own sessions before upload',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);const longId='session-'+ 'x'.repeat(513),idFile=session(home,'short-file-name',[point(at,8)]);writeFileSync(idFile,readFileSync(idFile,'utf8').replaceAll('short-file-name',longId));
  f.writePhase0Source(home,'codex',{session:'long-model',model:'m'.repeat(201),at:at+1000});session(home,'healthy',[point(at+2000,7)]);
  const result=await scan(home,dir);assert.deepEqual(result.captures.map(c=>c.sessionId),['healthy']);assert(result.isolations.some(i=>i.sessionId===longId));assert(result.isolations.some(i=>i.sessionId==='long-model'));assert.equal(tokenSum(result.captures[0].records),7);
}));

test('healthy-session append reports only the new token delta while uploadedTokens reports the full observation',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);const file=session(home,'healthy',[point(at,10)]),state=new AgentState(join(dir,'state')),service=new f.CompatibleSyncService(join(dir,'cloud.db')),config={version:1,endpoint:'https://synthetic.invalid',deviceId,home,allowedSources:['codex']},engine=new SyncEngine(state,config,localHttp(service),(h,_a,parents)=>scan(h,dir,parents));
  try{const baseline=await engine.run();assert.equal(baseline.newTokens,10);assert.equal(baseline.uploadedTokens,10);assert.equal(baseline.tokenDeltaKnown,true);appendFileSync(file,JSON.stringify(point(at+1000,17,7))+'\n');const added=await engine.run();assert.equal(added.newTokens,7);assert.equal(added.uploadedTokens,17);assert.equal(added.tokenDeltaKnown,true);assert.equal(f.readSyncView(service).events.reduce((sum,e)=>sum+e.inputTokens,0),17);const duplicate=await engine.run();assert.equal(duplicate.sent,0);assert.equal(duplicate.newTokens,0);assert.equal(duplicate.uploadedTokens,0);assert.equal(duplicate.tokenDeltaKnown,true);
  }finally{state.close();service.close();}
}));

test('legacy state without confirmed token totals reports unknown delta instead of attributing the full observation',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);const file=session(home,'legacy',[point(at,10)]),state=new AgentState(join(dir,'state')),service=new f.CompatibleSyncService(join(dir,'cloud.db')),config={version:1,endpoint:'https://synthetic.invalid',deviceId,home,allowedSources:['codex']},engine=new SyncEngine(state,config,localHttp(service),(h,_a,parents)=>scan(h,dir,parents));
  try{assert.equal((await engine.run()).newTokens,10);state.db.exec('DELETE FROM lineage_tokens');appendFileSync(file,JSON.stringify(point(at+1000,17,7))+'\n');const result=await engine.run();assert.equal(result.sent,1);assert.equal(result.newTokens,null);assert.equal(result.tokenDeltaKnown,false);assert.equal(result.uploadedTokens,17);assert.equal(f.readSyncView(service).events.reduce((sum,e)=>sum+e.inputTokens,0),17);appendFileSync(file,JSON.stringify(point(at+2000,20,3))+'\n');const knownAgain=await engine.run();assert.equal(knownAgain.newTokens,3);assert.equal(knownAgain.tokenDeltaKnown,true);assert.equal(f.readSyncView(service).events.reduce((sum,e)=>sum+e.inputTokens,0),20);
  }finally{state.close();service.close();}
}));

test('missing Codex history isolates only that session while independent anchored sessions continue',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);const file=session(home,'old-session',[point(at,10)]),state=new AgentState(join(dir,'state')),service=new f.CompatibleSyncService(join(dir,'cloud.db')),config={version:1,endpoint:'https://synthetic.invalid',deviceId,home,allowedSources:['codex']},engine=new SyncEngine(state,config,localHttp(service),(h,_a,parents)=>scan(h,dir,parents));
  try{assert.equal((await engine.run()).sent,1);const oldParent=structuredClone(state.parents()[0]);rmSync(file);session(home,'independent-session',[point(at+1000,7)]);
    const result=await engine.run();assert.equal(result.sent,1);assert.equal(result.newTokens,7);assert.equal(result.outcome,'partial_success');assert.equal(result.sourceReports.codex.outcome,'partial_success');assert.equal(result.blockingIssues,0);assert.equal(result.quarantineNew,1);assert(!result.issues.includes('codex:ROTATION_UNVERIFIED'));assert.deepEqual(state.parents().find(p=>p.header.manifest.scope.sessionId==='old-session'),oldParent);
    const repeat=await engine.run();assert.equal(repeat.sent,0);assert.equal(repeat.newTokens,0);assert.equal(repeat.quarantineNew,0);
    session(home,'old-session',[point(at+2000,25)]);session(home,'another-independent',[point(at+3000,3)]);const next=await engine.run();assert.equal(next.sent,1);assert.equal(next.newTokens,3);assert.equal(next.outcome,'partial_success');assert.deepEqual(state.parents().find(p=>p.header.manifest.scope.sessionId==='old-session'),oldParent);assert(state.sessionIsolations().some(row=>row.sessionId==='old-session'&&row.active));assert.equal(f.readSyncView(service).events.reduce((sum,e)=>sum+e.inputTokens,0),20);
  }finally{state.close();service.close();}
}));


test('all missing Codex history is source_failed, and an exact reliable return can resume its own head',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);const file=session(home,'old-session',[point(at,10)]),original=readFileSync(file),state=new AgentState(join(dir,'state')),service=new f.CompatibleSyncService(join(dir,'cloud.db')),config={version:1,endpoint:'https://synthetic.invalid',deviceId,home,allowedSources:['codex']},engine=new SyncEngine(state,config,localHttp(service),(h,_a,parents)=>scan(h,dir,parents));
  try{assert.equal((await engine.run()).sent,1);const parent=structuredClone(state.parents()[0]);const retained=file+'.retained';
    // Keep the same physical file identity while it is absent from the source inventory.
    const {renameSync}=await import('node:fs');renameSync(file,retained);
    const missing=await engine.run();assert.equal(missing.sent,0);assert.equal(missing.outcome,'source_failed');assert.equal(missing.sourceReports.codex.outcome,'source_failed');assert.equal(missing.quarantineNew,1);assert.deepEqual(state.parents()[0],parent);
    const repeated=await engine.run();assert.equal(repeated.outcome,'source_failed');assert.equal(repeated.quarantineNew,0);
    renameSync(retained,file);assert.deepEqual(readFileSync(file),original);appendFileSync(file,JSON.stringify(point(at+1000,13,3))+'\n');const returned=await engine.run();assert.equal(returned.sent,1);assert.equal(returned.newTokens,3);assert.equal(returned.quarantineActive,0);assert.equal(returned.outcome,'complete_success');assert.equal(f.readSyncView(service).events.reduce((sum,e)=>sum+e.inputTokens,0),13);
  }finally{state.close();service.close();}
}));

test('a new Codex session identity cannot reuse an isolated historical locator',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);const file=session(home,'old-session',[point(at,10)]),state=new AgentState(join(dir,'state')),service=new f.CompatibleSyncService(join(dir,'cloud.db')),config={version:1,endpoint:'https://synthetic.invalid',deviceId,home,allowedSources:['codex']},engine=new SyncEngine(state,config,localHttp(service),(h,_a,parents)=>scan(h,dir,parents));
  try{assert.equal((await engine.run()).sent,1);const parent=structuredClone(state.parents()[0]);rmSync(file);assert.equal((await engine.run()).outcome,'source_failed');
    const alternate=session(home,'renamed-session',[point(at+1000,7)]);writeFileSync(file,readFileSync(alternate));rmSync(alternate);
    const result=await engine.run();assert.equal(result.sent,0);assert.equal(result.outcome,'source_failed');assert(state.sessionIsolations().some(row=>row.sessionId==='renamed-session'&&row.reason==='ROTATION_UNVERIFIED'&&row.active));assert.deepEqual(state.parents()[0],parent);assert.equal(f.readSyncView(service).events.reduce((sum,e)=>sum+e.inputTokens,0),10);
  }finally{state.close();service.close();}
}));
