import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {AgentState,SyncEngine,captureHome,buildCandidate,scopeKey} from '../dist/library.mjs';
import {fixtures as f} from './helpers.mjs';

const deviceId='00000000-0000-4000-8000-000000000003',actor={role:'device',deviceId},source='claudeCode';
const key=scopeKey(source,'historical');
const historicalFile=home=>join(home,'.claude','projects','phase0-project','historical.jsonl');
async function scan(home,dir,parents=[]){const snapshot=join(dir,'capture-'+randomUUID());try{return await captureHome(home,snapshot,[source],parents);}finally{rmSync(snapshot,{recursive:true,force:true});}}
function http(service){const batches=new Map();return {request:async(path,method='GET',body)=>{
  if(path==='/scopes/resolve')return f.resolveScope(service,body,actor);
  if(path==='/batches'){batches.set(body.header.batchId,{header:body.header,records:[]});return {nextOffset:0};}
  const match=/^\/batches\/([^/]+)(?:\/pages\/(\d+)|\/(commit))?$/.exec(path);assert(match,path);const batch=batches.get(match[1]);
  if(method==='GET')return batch?.receipt?{receipt:batch.receipt}:{state:'missing'};
  assert(batch);if(match[2]!==undefined){assert.equal(Number(match[2]),batch.records.length);batch.records.push(...body.records);return {nextOffset:batch.records.length};}
  assert.equal(match[3],'commit');batch.receipt=service.ingest(batch.header,batch.records,actor);return {receipt:batch.receipt};
}};}
async function setup(action){const dir=mkdtempSync(join(tmpdir(),'incept-historical-seal-')),home=join(dir,'home');f.writePhase0Pricing(home);f.writePhase0Source(home,source,{session:'historical'});
  let state=new AgentState(join(dir,'state'));const service=new f.CompatibleSyncService(join(dir,'cloud.db')),transport=http(service),config={version:1,endpoint:'https://synthetic.invalid',deviceId,home,allowedSources:[source]};
  const engine=()=>new SyncEngine(state,config,transport,(h,_allowed,parents)=>scan(h,dir,parents));
  const restart=()=>{state.close();state=new AgentState(join(dir,'state'));return state;};
  try{assert.equal((await engine().run()).sent,1);await action({dir,home,get state(){return state;},service,engine,restart});}finally{state.close();service.close();rmSync(dir,{recursive:true,force:true});}
}
function decision(state){const row=state.db.prepare('SELECT parent_json,receipt_json FROM lineage WHERE scope=?').get(key),manifest=JSON.parse(row.parent_json).header.manifest;
  return {deviceId,manifestHash:manifest.manifestHash,generationId:manifest.generationId,receipt:JSON.parse(row.receipt_json),reason:'Owner reviewed inactive historical scope with trusted receipt',owner:{subject:'fixture-owner',decisionId:'fixture-explicit-seal'}};
}

test('seals only matching confirmed evidence, persists owner decision, and is idempotent',()=>setup(async ctx=>{
  const input=decision(ctx.state),before=ctx.state.db.prepare('SELECT * FROM lineage WHERE scope=?').get(key);
  assert.throws(()=>ctx.state.sealHistorical(key,{...input,owner:{subject:'',decisionId:''}}),/HISTORICAL_OWNER_DECISION_REQUIRED/);
  assert.throws(()=>ctx.state.sealHistorical(key,{...input,deviceId:randomUUID()}),/HISTORICAL_EVIDENCE_MISMATCH/);
  assert.throws(()=>ctx.state.sealHistorical(key,{...input,receipt:{...input.receipt,dataRevision:999}}),/HISTORICAL_EVIDENCE_MISMATCH/);
  const seal=ctx.state.sealHistorical(key,input);assert.equal(seal.proofHash,f.hash(ctx.state.parents()[0].proofs));
  assert.deepEqual(ctx.state.sealHistorical(key,input),seal);assert.equal(ctx.state.historicalSeals().length,1);
  assert.throws(()=>ctx.state.sealHistorical(key,{...input,reason:'different decision'}),/HISTORICAL_SEAL_CONFLICT/);
  ctx.restart();assert.deepEqual(ctx.state.historicalSeals(),[seal]);assert(ctx.state.isHistoricalSealCurrent(ctx.state.parents()[0],deviceId));
  assert.equal(ctx.state.isHistoricalSealCurrent(ctx.state.parents()[0],randomUUID()),false);
  assert.deepEqual(ctx.state.db.prepare('SELECT * FROM lineage WHERE scope=?').get(key),before);
  const capture=(await scan(ctx.home,ctx.dir,ctx.state.parents())).captures[0],parent=ctx.state.parents()[0];
  assert.throws(()=>ctx.state.enqueue(buildCandidate(capture,parent.header.manifest.scope,parent,'seal-enqueue-bypass'),'signature'),/HISTORICAL_SCOPE_SEALED/);
  assert.equal(ctx.state.status().historicalSealedScopes,1);
}));

test('missing sealed history permits an independent healthy scope and preserves historical receipts',()=>setup(async ctx=>{
  ctx.state.sealHistorical(key,decision(ctx.state));const parent=structuredClone(ctx.state.parents()[0]);rmSync(historicalFile(ctx.home));
  f.writePhase0Source(ctx.home,source,{session:'independent',id:'new-request',at:f.PHASE0_AT+10000});
  const result=await ctx.engine().run();assert.equal(result.sent,1);assert.equal(result.newTokens,130);assert.equal(result.outcome,'partial_success');
  assert.equal(result.sourceReports[source].sealedSessions,1);assert.equal(result.sourceReports[source].outcome,'partial_success');
  assert.equal(result.blockingIssues,0);assert(result.issues.includes(source+':SEALED_ORIGIN_RETAINED'));assert(!result.issues.includes(source+':ROTATION_UNVERIFIED'));
  assert.deepEqual(ctx.state.parents().find(p=>p.header.manifest.scope.sessionId==='historical'),parent);assert.equal(result.receiptCount,2);
  assert.equal(f.readSyncView(ctx.service).events.reduce((n,e)=>n+e.inputTokens+e.outputTokens+e.cacheReadTokens,0),260);
  const repeat=await ctx.engine().run();assert.equal(repeat.sent,0);assert.equal(repeat.newTokens,0);assert.equal(repeat.outcome,'partial_success');
}));

test('an unsealed missing head continues to block unverified rotation',()=>setup(async ctx=>{
  rmSync(historicalFile(ctx.home));f.writePhase0Source(ctx.home,source,{session:'unverified-new'});
  const result=await ctx.engine().run();assert.equal(result.sent,0);assert(result.issues.includes(source+':ROTATION_UNVERIFIED'));assert.equal(result.receiptCount,1);
}));

test('returning sealed history is isolated before signature comparison and does not re-alert after restart',()=>setup(async ctx=>{
  ctx.state.sealHistorical(key,decision(ctx.state));const parent=structuredClone(ctx.state.parents()[0]);
  const first=await ctx.engine().run();assert.equal(first.sent,0);assert.equal(first.quarantineNew,1);assert.equal(first.outcome,'partial_success');
  assert(ctx.state.sessionIsolations().some(row=>row.reason==='HISTORICAL_SCOPE_SEALED'&&row.active));
  ctx.restart();f.writePhase0Source(ctx.home,source,{session:'historical',count:2});
  f.writePhase0Source(ctx.home,source,{session:'new-after-seal',id:'independent',at:f.PHASE0_AT+10000});
  const next=await ctx.engine().run();assert.equal(next.sent,1);assert.equal(next.newTokens,130);assert.equal(next.quarantineNew,0);assert.equal(next.blockingIssues,0);
  assert.equal(ctx.state.sessionIsolations().filter(row=>row.reason==='HISTORICAL_SCOPE_SEALED').length,1);
  assert.deepEqual(ctx.state.parents().find(p=>p.header.manifest.scope.sessionId==='historical'),parent);
  assert.equal(ctx.service.db.prepare('SELECT COUNT(*) n FROM sync_receipts').get().n,2);
}));

test('all sealed origins absent remain visibly partial without a source failure',()=>setup(async ctx=>{
  ctx.state.sealHistorical(key,decision(ctx.state));rmSync(historicalFile(ctx.home));
  const result=await ctx.engine().run();assert.equal(result.sent,0);assert.equal(result.outcome,'partial_success');assert.equal(result.sourceReports[source].failed,false);
  assert.equal(result.sourceReports[source].outcome,'partial_success');assert.equal(result.sourceReports[source].sealedSessions,1);assert.equal(result.blockingIssues,0);
}));

test('sealing rejects pending, review, held, and unconfirmed local heads',()=>setup(async ctx=>{
  const input=decision(ctx.state);f.writePhase0Source(ctx.home,source,{session:'historical',count:2});
  const capture=(await scan(ctx.home,ctx.dir,ctx.state.parents())).captures[0],parent=ctx.state.parents()[0];
  const candidate=buildCandidate(capture,parent.header.manifest.scope,parent,'pending-history');ctx.state.enqueue(candidate,'signature');
  for(const status of ['pending','review','held']){ctx.state.db.prepare('UPDATE outbox SET state=?').run(status);assert.throws(()=>ctx.state.sealHistorical(key,input),/HISTORICAL_SCOPE_HAS_UNRESOLVED_WORK/);}
  ctx.state.db.exec('DELETE FROM records; DELETE FROM outbox;');
  ctx.state.db.prepare('INSERT INTO heads VALUES(?,?,?)').run(key,JSON.stringify(parent),'unconfirmed');
  assert.throws(()=>ctx.state.sealHistorical(key,input),/HISTORICAL_SCOPE_HAS_UNRESOLVED_WORK/);assert.equal(ctx.state.historicalSeals().length,0);
}));

test('proof tampering invalidates a seal exemption instead of trusting its existence',()=>setup(async ctx=>{
  ctx.state.sealHistorical(key,decision(ctx.state));const parent=structuredClone(ctx.state.parents()[0]);parent.proofs[0].range.root='f'.repeat(64);
  ctx.state.db.prepare('UPDATE lineage SET parent_json=? WHERE scope=?').run(JSON.stringify(parent),key);
  assert.equal(ctx.state.isHistoricalSealCurrent(parent,deviceId),false);rmSync(historicalFile(ctx.home));f.writePhase0Source(ctx.home,source,{session:'new-unverified'});
  const result=await ctx.engine().run();assert.equal(result.sent,0);assert(result.issues.includes(source+':ROTATION_UNVERIFIED'));
}));

test('sealing rejects a receipt ledger mismatch and leaves the scope unsealed',()=>setup(async ctx=>{
  const input=decision(ctx.state);ctx.state.db.prepare('UPDATE receipts SET json=? WHERE batch=?').run(JSON.stringify({...input.receipt,payloadHash:'f'.repeat(64)}),input.receipt.batchId);
  assert.throws(()=>ctx.state.sealHistorical(key,input),/HISTORICAL_EVIDENCE_MISMATCH/);assert.equal(ctx.state.historicalSeals().length,0);
}));

test('a persistent historical hold isolates reappearing usage while independent scopes continue without repeated alerts',()=>setup(async ctx=>{
  const parent=structuredClone(ctx.state.parents()[0]),input=decision(ctx.state);
  const hold=ctx.state.quarantineHistorical(key,input);assert.equal(hold.disposition,'isolated');
  assert.deepEqual(ctx.state.quarantineHistorical(key,input),hold);assert.equal(ctx.state.historicalSeals().length,0);assert.equal(ctx.state.historicalHolds().length,1);
  assert.equal(ctx.state.isHistoricalSealCurrent(parent,deviceId),false);assert.equal(ctx.state.isHistoricalPolicyCurrent(parent,deviceId),true);
  f.writePhase0Source(ctx.home,source,{session:'historical',count:2});
  f.writePhase0Source(ctx.home,source,{session:'new-alongside-held',id:'new',at:f.PHASE0_AT+10000});
  const first=await ctx.engine().run();assert.equal(first.sent,1);assert.equal(first.newTokens,130);assert.equal(first.quarantineNew,1);assert.equal(first.blockingIssues,0);
  assert.equal(first.sourceReports[source].heldHistoricalSessions,1);assert.equal(first.sourceReports[source].sealedSessions,0);assert.equal(first.outcome,'partial_success');
  assert.deepEqual(ctx.state.parents().find(p=>p.header.manifest.scope.sessionId==='historical'),parent);
  ctx.restart();const repeat=await ctx.engine().run();assert.equal(repeat.sent,0);assert.equal(repeat.quarantineNew,0);
  const ledger=ctx.state.sessionIsolations().filter(row=>row.reason==='HISTORICAL_CONTINUATION_UNVERIFIED');assert.equal(ledger.length,1);assert.equal(ledger[0].active,true);
  assert.equal(ctx.state.status().historicalHeldScopes,1);assert.equal(ctx.state.status().historicalSealedScopes,0);
  const capture=(await scan(ctx.home,ctx.dir,ctx.state.parents())).captures.find(c=>c.sessionId==='historical');
  assert.throws(()=>ctx.state.enqueue(buildCandidate(capture,parent.header.manifest.scope,parent,'hold-bypass'),'signature'),/HISTORICAL_CONTINUATION_UNVERIFIED/);
  assert.equal(ctx.service.db.prepare('SELECT COUNT(*) n FROM sync_receipts').get().n,2);
}));

test('an absent held origin is retained without blocking an independent new session',()=>setup(async ctx=>{
  ctx.state.quarantineHistorical(key,decision(ctx.state));rmSync(historicalFile(ctx.home));
  const empty=await ctx.engine().run();assert.equal(empty.outcome,'partial_success');assert.equal(empty.sourceReports[source].failed,false);assert.equal(empty.blockingIssues,0);
  assert(empty.issues.includes(source+':HELD_ORIGIN_RETAINED'));
  f.writePhase0Source(ctx.home,source,{session:'independent-after-hold',id:'new',at:f.PHASE0_AT+10000});
  const result=await ctx.engine().run();assert.equal(result.sent,1);assert.equal(result.newTokens,130);assert.equal(result.blockingIssues,0);assert.equal(result.sourceReports[source].heldHistoricalSessions,1);
}));

test('historical hold rejects an unverified receipt and invalid disposition',()=>setup(async ctx=>{
  const input=decision(ctx.state);
  assert.throws(()=>ctx.state.quarantineHistorical(key,{...input,receipt:{...input.receipt,generationId:'f'.repeat(64)}}),/HISTORICAL_EVIDENCE_MISMATCH/);
  assert.throws(()=>ctx.state.sealHistorical(key,{...input,disposition:'ignore'}),/HISTORICAL_DISPOSITION_INVALID/);
  assert.equal(ctx.state.historicalPolicies().length,0);
}));
