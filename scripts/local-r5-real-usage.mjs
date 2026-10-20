// Real source canaries: fixed local r5 endpoint, new scopes only, independent state.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {AgentState,SyncEngine,AgentHttp,workerCollector,buildCandidate,classifyIssues} from '../apps/sync-agent/dist/library.mjs';
const directory='C:/Users/86139/AppData/Local/Incept/v4-acceptance-20261019';
assert.equal(resolve(process.env.INCEPT_V4_ACCEPTANCE_DIR??''),resolve(directory));
const config=JSON.parse(readFileSync(join(directory,'config.json'),'utf8'));
assert.equal(config.endpoint,'http://127.0.0.1:3305');assert.equal(config.remote,false);assert.equal(config.allowLoopbackHttp,true);
const runtime=JSON.parse(readFileSync('output/r5-entry-runtime.json','utf8'));assert.equal(runtime.status,'passed');
assert(Date.now()-Date.parse(runtime.completedAt)<300000,'FRESH_RUNTIME_GATES_REQUIRED');
const inventory=JSON.parse(readFileSync('output/r5-real-source-inventory.json','utf8'));
const {root:preparedRoot}=JSON.parse(readFileSync(join(directory,'real-source-current.json'),'utf8'));
assert(resolve(preparedRoot).startsWith(resolve(directory)+'\\'),'PRIVATE_PREPARATION_REQUIRED');
const {hash,qualifyRanges,qualifyRecords,sequenceHash}=await import(pathToFileURL(join(preparedRoot,'rules.mjs')).href);
const root=join(directory,'real-usage-'+randomUUID());mkdirSync(root,{mode:0o700});
const report={status:'running',startedAt:new Date().toISOString(),kind:'real-source-usage',endpoint:config.endpoint,
  historical359:'not revalidated or changed; canaries require new scopes',globalAllowIncomplete:false,sourceResults:{},steps:[]};
const save=()=>{writeFileSync(join(root,'real-usage-report.json'),JSON.stringify(report,null,2));writeFileSync('output/r5-real-usage-final.json',JSON.stringify(report,null,2)+'\n');};
function record(step,details={}){report.steps.push({step,...details});save();console.log(JSON.stringify({step,...details}));}
function docker(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(r.status,0,'LOCAL_DATABASE_READ_FAILED');return r.stdout;}
const protectedFiles=['sync-agent/state.db','sync-agent-v4-prodcheck/state.db'].map(p=>join(process.env.LOCALAPPDATA,'Incept',p));
const fingerprint=()=>protectedFiles.map(file=>({size:statSync(file).size,sha256:createHash('sha256').update(readFileSync(file)).digest('hex')}));
const tokens=records=>records.reduce((n,{event:e})=>n+e.inputTokens+e.outputTokens+e.cacheReadTokens+e.cacheCreationTokens+e.reasoningTokens,0);
const remoteReadCode=String.raw`
const{DatabaseSync}=require('node:sqlite');const fs=require('node:fs');const input=JSON.parse(fs.readFileSync(0,'utf8'));
const db=new DatabaseSync('/data/sync/v4.db',{readOnly:true});db.exec('BEGIN');
try{const total=db.prepare('SELECT SUM(token_total) tokens FROM sync_scopes').get().tokens;
 const revision=db.prepare('SELECT data_revision FROM sync_meta WHERE id=1').get().data_revision;
 const scope=db.prepare('SELECT * FROM sync_scopes WHERE scope_id=?').get(input.scopeId)??null;
 const records=db.prepare('SELECT o.record_json FROM sync_current c JOIN sync_observations o ON o.id=c.observation_id WHERE c.scope_id=? ORDER BY c.position').all(input.scopeId).map(r=>JSON.parse(r.record_json));
 console.log(JSON.stringify({total,revision,scope,records}));}finally{db.close();}`;
const remote=scopeId=>JSON.parse(docker(['exec','-i','incept-v4-acceptance-app-1','node','-e',remoteReadCode],JSON.stringify({scopeId})));
let state;
try{
 const beforeFiles=fingerprint();
 const token=readFileSync(join(directory,'token.txt'),'utf8').trim(),http=new AgentHttp(config.endpoint,token,{allowLoopbackHttp:true});
 const who=await http.request('/agent');assert.equal(who.deviceId,config.deviceId);assert(['codex','antigravity'].every(s=>who.allowedSources.includes(s)));
 const accepted=new DatabaseSync(protectedFiles[1],{readOnly:true});let rows;
 try{rows=accepted.prepare('SELECT parent_json FROM lineage').all();}finally{accepted.close();}
 const parents=rows.map(r=>JSON.parse(r.parent_json)),acceptedSessions=new Set(parents.map(p=>JSON.stringify([p.header.manifest.scope.source,p.header.manifest.scope.sessionId])));
 const collect=workerCollector(root);
 const codex=await collect(inventory.sourceHome,['codex'],parents,undefined,{tolerantIncomplete:false});
 assert.equal(classifyIssues(codex.issues,['codex']).blocking.length,0,'CODEX_SOURCE_LEVEL_FAILURE');
 writeFileSync(join(root,'codex-isolations.json'),JSON.stringify(codex.isolations??[],null,2));
 const cutoff=Date.parse(inventory.baseline.lastCollectedAt);
 const options=codex.captures.filter(c=>c.reader==='codex'&&!acceptedSessions.has(JSON.stringify(['codex',c.sessionId]))
  &&! /^(?:local-r5-|pending-restart-|phase0-|fixture-|test-)/i.test(c.sessionId)
  &&c.records.length>0&&c.records.every(r=>r.event.timestampMs>cutoff));
 assert(options.length>0,'NO_HEALTHY_NEW_CODEX_SESSION');
 // Prefer a settled session, while always preserving its complete frozen evidence.
 const latest=c=>Math.max(...c.records.map(r=>r.event.timestampMs));
 options.sort((a,b)=>Number(latest(a)>Date.now()-120000)-Number(latest(b)>Date.now()-120000)||latest(b)-latest(a));
 const antigravity=JSON.parse(readFileSync(join(preparedRoot,'antigravity-candidate.json'),'utf8')).capture;
 assert.equal(antigravity.source,'antigravity');assert.equal(antigravity.reader,'antigravity');assert.equal(antigravity.records.length,124);
 assert(!acceptedSessions.has(JSON.stringify(['antigravity',antigravity.sessionId])),'ANTIGRAVITY_NOT_NEW_SCOPE');
 const chosen=[options[0],antigravity];
 state=new AgentState(join(root,'state'));
 for(const capture of chosen){
  const source=capture.source,scope={deviceId:config.deviceId,source,sessionId:capture.sessionId,originId:hash(['incept-origin/1',source,capture.sessionId])};
  const candidate=buildCandidate(capture,scope,undefined,randomUUID());qualifyRanges(undefined,candidate.header.manifest);
  const expectedTokens=qualifyRecords([],candidate.records,candidate.header.manifest);assert.equal(expectedTokens,tokens(candidate.records));
  const scopeId=hash(['sync-scope/2',config.deviceId,source,capture.sessionId]);
  const before=remote(scopeId);assert.equal(before.scope,null,'CANARY_WOULD_TOUCH_EXISTING_BASELINE');
  const admission=await http.request('/scopes/resolve','POST',{source,sessionId:capture.sessionId});assert(!admission.headManifest,'EXISTING_REMOTE_HEAD');assert.deepEqual(admission.scope,scope);
  const signatures=hash([capture.reader,capture.records,capture.proofs.map(p=>[p.range.locatorHash,p.range.identityHash,p.range.root])]);
  const frozen=async()=>({captures:[capture],issues:source==='codex'?codex.issues:[],isolations:source==='codex'?codex.isolations??[]:[]});
  const engine=new SyncEngine(state,{...config,home:inventory.sourceHome,allowedSources:[source]},http,frozen);
  const first=await engine.run();assert.equal(first.sent,1,'REAL_CANARY_UPLOAD_NOT_COMMITTED');assert.equal(first.reviewNew,0);assert.equal(first.blockingIssues,0);assert.equal(first.newTokens,expectedTokens);
  const receiptRow=state.db.prepare('SELECT json FROM receipts ORDER BY rowid DESC LIMIT 1').get();assert(receiptRow);const receipt=JSON.parse(receiptRow.json);
  const status=await http.request('/batches/'+receipt.batchId);assert.deepEqual(status.receipt,receipt);assert.equal(receipt.status,'committed');
  assert.equal(receipt.manifestHash,buildCandidate(capture,scope,undefined,receipt.batchId).header.manifest.manifestHash);
  const after=remote(scopeId);assert.equal(after.scope.token_total,expectedTokens);assert.equal(after.total-before.total,expectedTokens);assert.equal(after.revision,before.revision+1);
  assert.equal(after.scope.head_manifest,receipt.manifestHash);assert.equal(after.scope.head_generation,receipt.generationId);
  // Compare every normalized field of every record; no aggregate-only acceptance.
  assert.deepEqual(after.records,capture.records,'REAL_RECORD_ITEM_MISMATCH');assert.equal(sequenceHash(after.records),candidate.header.manifest.sequenceHash);
  assert.equal(new Set(after.records.map(r=>r.event.eventId)).size,after.records.length);
  writeFileSync(join(root,source+'-record-check.json'),JSON.stringify({scope,receipt,recordCount:after.records.length,
    checks:after.records.map((record,index)=>({index,eventId:record.event.eventId,timestampMs:record.event.timestampMs,tokens:tokens([record]),recordHash:hash(record),matched:true}))},null,2));
  const stable=await engine.run();assert.equal(stable.sent,0);assert.equal(stable.newTokens,0);assert.equal(stable.reviewNew,0);assert.equal(stable.quarantineNew,0);
  assert.equal(Number(state.db.prepare('SELECT COUNT(*) n FROM outbox').get().n),0);
  const noChange=remote(scopeId);assert.equal(noChange.total,after.total);assert.equal(noChange.revision,after.revision);
  assert.equal(first.outcome,source==='codex'&&(codex.isolations?.length??0)>0?'partial_success':'complete_success');
  report.sourceResults[source]={status:'passed',reader:capture.reader,sessionHash:hash(capture.sessionId),recordCount:after.records.length,
    tokenIncrease:expectedTokens,revisionBefore:before.revision,revisionAfter:after.revision,receiptMatched:true,allRecordsMatched:true,
    duplicateEventIds:0,frozenSnapshotRepeatSent:stable.sent,outcome:first.outcome,isolatedSessions:source==='codex'?new Set(codex.isolations?.map(i=>i.sessionId)).size:0,
    unassignedPrefixTokens:source==='codex'?(codex.isolations??[]).filter(i=>i.reason==='OPENING_PREFIX_MISSING'||i.reason==='OPENING_USAGE_UNCERTAIN').reduce((n,i)=>n+i.unattributedTokens,0):0};
  record(source+'-real-usage-item-receipt-and-token-delta-verified',report.sourceResults[source]);
 }
 assert.deepEqual(fingerprint(),beforeFiles,'PROTECTED_STATE_CHANGED');
 const opening=(codex.isolations??[]).filter(i=>['OPENING_PREFIX_MISSING','OPENING_USAGE_UNCERTAIN'].includes(i.reason));
 report.quarantine={sessionCount:new Set(codex.isolations?.map(i=>i.sessionId)).size,openingSessions:opening.length,
   unattributedOpeningTokens:opening.reduce((n,i)=>n+i.unattributedTokens,0),newAlerts:state.sessionIsolations().length};
 report.waitingForRealUsage=['commandcode','claudeCode','geminiCli','opencode','zcode'];
 report.protectedStateUnchanged=true;report.productionModified=false;report.formalAgentStarted=false;report.releaseStatus='NO-GO';
 report.status='passed-with-quarantined-history';report.completedAt=new Date().toISOString();save();
 console.log(JSON.stringify({status:report.status,quarantine:report.quarantine}));
}catch(error){report.status='blocked';report.failure={code:error.name==='AssertionError'?String(error.message).split('\n')[0]:'REAL_CANARY_OPERATION_FAILED'};save();console.error(JSON.stringify(report.failure));process.exitCode=1;}
finally{state?.close();}
