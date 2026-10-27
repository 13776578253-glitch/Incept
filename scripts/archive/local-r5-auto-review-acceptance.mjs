// User-confirmed source role, measured usage only, fixed local acceptance target.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {AgentState,AgentHttp,SyncEngine,workerCollector,buildCandidate} from '../../apps/sync-agent/dist/library.mjs';
const directory='C:/Users/86139/AppData/Local/Incept/v4-acceptance-20261019';
assert.equal(resolve(process.env.INCEPT_V4_ACCEPTANCE_DIR??''),resolve(directory));
const config=JSON.parse(readFileSync(join(directory,'config.json'),'utf8'));
assert.equal(config.endpoint,'http://127.0.0.1:3305');assert.equal(config.remote,false);
const prior=JSON.parse(readFileSync('output/r5-real-usage-final.json','utf8'));
assert.equal(prior.verifiedCanaries,'passed');
const isolations=JSON.parse(readFileSync(join(prior.evidenceDirectory,'codex-isolations.json'),'utf8'));
const role=isolations.filter(row=>row.reason==='CODEX_RESET_REVIEW');assert.equal(role.length,1,'EXACT_USER_CONFIRMED_SESSION_REQUIRED');
const sessionId=role[0].sessionId;
const {root:preparation}=JSON.parse(readFileSync(join(directory,'real-source-current.json'),'utf8'));
const {hash}=await import(pathToFileURL(join(preparation,'rules.mjs')).href);
const policy={version:1,source:'codex',autoReviewSessions:[sessionId],classificationBasis:'user-confirmed Auto-review role, 2026-10-20',
  usageBasis:'measured last_token_usage; no cumulative total attribution',pricing:'unknown'};
const policyFile=join(directory,'auto-review-source-policy.json');
if(existsSync(policyFile))assert.deepEqual(JSON.parse(readFileSync(policyFile,'utf8')),policy);else writeFileSync(policyFile,JSON.stringify(policy,null,2),{flag:'wx',mode:0o600});
const root=join(directory,'auto-review-'+randomUUID());mkdirSync(root,{mode:0o700});
const report={status:'running',startedAt:new Date().toISOString(),classificationBasis:policy.classificationBasis,
  sessionHash:hash(sessionId),endpoint:config.endpoint,previous187:'PASS retained',productionModified:false,formalAgentStarted:false};
const save=()=>{writeFileSync(join(root,'report.json'),JSON.stringify(report,null,2));writeFileSync('output/r5-auto-review-acceptance.json',JSON.stringify({...report,evidenceDirectory:root},null,2)+'\n');};
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const protectedFiles=['sync-agent/state.db','sync-agent-v4-prodcheck/state.db'].map(file=>join(process.env.LOCALAPPDATA,'Incept',file));
protectedFiles.push('D:/Desktop/code/code/Incept/output/v4-reset-exceptions.json');
const fingerprint=()=>protectedFiles.map(sha);
function docker(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(r.status,0,'LOCAL_R5_READ_FAILED');return r.stdout;}
const readCode=String.raw`
const{DatabaseSync}=require('node:sqlite'),fs=require('node:fs'),M=require('node:module');const input=JSON.parse(fs.readFileSync(0,'utf8'));
const original=M._load;M._load=function(id,...a){return id==='server-only'?{}:original.call(this,id,...a)};
M.createRequire('/app/packages/db/package.json')('tsx/cjs/api').register();
const{priceSyncRecord}=require('/app/packages/dashboard/src/adapters/local/imports/sync/pricing.ts');
const db=new DatabaseSync('/data/sync/v4.db',{readOnly:true});db.exec('BEGIN');
try{const scope=db.prepare('SELECT * FROM sync_scopes WHERE scope_id=?').get(input.scopeId)??null;
const generation=scope?.visible_generation?db.prepare('SELECT basis_json,mappings_json FROM sync_generations WHERE id=?').get(scope.visible_generation):null;
const records=db.prepare('SELECT o.record_json FROM sync_current c JOIN sync_observations o ON o.id=c.observation_id WHERE c.scope_id=? ORDER BY c.position').all(input.scopeId).map(r=>JSON.parse(r.record_json));
const priced=generation?records.map(record=>priceSyncRecord(input.scope,record,JSON.parse(generation.basis_json),JSON.parse(generation.mappings_json),'Acceptance')):[];
console.log(JSON.stringify({scope,records,total:db.prepare('SELECT SUM(token_total) n FROM sync_scopes').get().n,revision:db.prepare('SELECT data_revision FROM sync_meta WHERE id=1').get().data_revision,
pricing:priced.map(row=>({model:row.modelName,missingPricing:row.missingPricing,apiEquivalentCost:row.apiEquivalentCost}))}));}finally{db.close();}`;
let state;
try{
 const beforeFiles=fingerprint(),home=JSON.parse(readFileSync('output/r5-real-source-inventory.json','utf8')).sourceHome;
 const token=readFileSync(join(directory,'token.txt'),'utf8').trim(),http=new AgentHttp(config.endpoint,token,{allowLoopbackHttp:true});
 assert.equal((await http.request('/agent')).deviceId,config.deviceId);
 const captured=await workerCollector(root)(home,['codex'],[],undefined,{tolerantIncomplete:false,autoReviewSessions:policy.autoReviewSessions});
 const capture=captured.captures.find(c=>c.sessionId===sessionId);assert(capture,'MEASURED_AUTO_REVIEW_USAGE_REQUIRED');
 assert(capture.records.every(r=>r.event.modelName==='codex-auto-review-unpriced'));assert.deepEqual(capture.rates,{});
 assert(!captured.isolations.some(row=>row.sessionId===sessionId),'AUTO_REVIEW_USAGE_NOT_VERIFIABLE');
 const scope={deviceId:config.deviceId,source:'codex',sessionId,originId:hash(['incept-origin/1','codex',sessionId])};
 const scopeId=hash(['sync-scope/2',config.deviceId,'codex',sessionId]);
 const remote=()=>JSON.parse(docker(['exec','-i','incept-v4-acceptance-app-1','node','-e',readCode],JSON.stringify({scopeId,scope})));
 const before=remote();assert.equal(before.scope,null,'EXISTING_SCOPE_REQUIRES_REVIEW');
 state=new AgentState(join(root,'state'));
 const engine=new SyncEngine(state,{...config,home,allowedSources:['codex'],autoReviewSessions:policy.autoReviewSessions},http,
  async()=>({captures:[capture],issues:captured.issues,isolations:captured.isolations}));
 const result=await engine.run();assert.equal(result.sent,1,'AUTO_REVIEW_UPLOAD_FAILED');assert.equal(result.reviewNew,0);
 const after=remote();assert.deepEqual(after.records,capture.records);assert(after.pricing.length>0);
 assert(after.pricing.every(row=>row.missingPricing===true&&row.apiEquivalentCost===null),'RUNTIME_AUTO_REVIEW_MUST_REMAIN_UNPRICED');
 const expected=capture.records.reduce((n,{event:e})=>n+e.inputTokens+e.outputTokens+e.cacheReadTokens+e.cacheCreationTokens+e.reasoningTokens,0);
 assert.equal(after.total-before.total,expected);assert.equal(after.scope.token_total,expected);assert.equal(result.newTokens,expected);assert.equal(after.revision,before.revision+1);
 const receipt=JSON.parse(state.db.prepare('SELECT json FROM receipts').get().json);assert.deepEqual((await http.request('/batches/'+receipt.batchId)).receipt,receipt);
 assert.equal(buildCandidate(capture,scope,undefined,receipt.batchId).header.manifest.manifestHash,receipt.manifestHash);
 const repeated=await engine.run();assert.equal(repeated.sent,0);assert.equal(repeated.newTokens,0);assert.equal(repeated.quarantineNew,0);assert.equal(remote().revision,after.revision);
 writeFileSync(join(root,'record-checks.json'),JSON.stringify({receipt,checks:capture.records.map((record,index)=>({index,eventId:record.event.eventId,hash:hash(record),matched:true,missingPricing:true,apiEquivalentCost:null}))},null,2));
 let retainedOpeningSessions=0;
 const oldState=new AgentState(join(prior.evidenceDirectory,'state'));try{
  const row=oldState.db.prepare("SELECT id,detail_json FROM session_isolations WHERE source='codex' AND session_id=? AND reason='CODEX_RESET_REVIEW'").get(sessionId);
  assert(row);oldState.db.prepare('UPDATE session_isolations SET active=0,detail_json=? WHERE id=?').run(JSON.stringify({...JSON.parse(row.detail_json),disposition:'user-classified-auto-review',pricing:'unknown'}),row.id);
  retainedOpeningSessions=new Set(oldState.sessionIsolations().filter(item=>item.active&&['OPENING_PREFIX_MISSING','OPENING_USAGE_UNCERTAIN'].includes(item.reason)).map(item=>item.sessionId)).size;
  assert.equal(retainedOpeningSessions,2,'ORIGINAL_OPENING_ISOLATIONS_MUST_REMAIN');
 }finally{oldState.close();}
 assert.deepEqual(fingerprint(),beforeFiles,'PROTECTED_INPUT_CHANGED');
 Object.assign(report,{status:'passed',recordCount:capture.records.length,tokenIncrease:expected,unpricedRecords:after.pricing.length,
  apiEquivalentCost:null,receiptMatched:true,allRecordsMatched:true,duplicateEventIds:0,repeatSent:0,openingSessionsStillIsolated:retainedOpeningSessions,
  protectedInputsUnchanged:true,legacyExceptionListUnchanged:true,releaseStatus:'NO-GO',completedAt:new Date().toISOString()});save();
 prior.status='passed-with-quarantined-history';prior.liveUploadsStopped=false;prior.autoReviewRoleCorrection={status:'passed',sourcePolicy:'user-confirmed exact session role',model:'codex-auto-review-unpriced',priced:false,recordCount:report.recordCount,tokenIncrease:expected};
 prior.previousResetPauseSuperseded=true;writeFileSync('output/r5-real-usage-final.json',JSON.stringify(prior,null,2)+'\n');
 console.log(JSON.stringify(report));
}catch(error){report.status='blocked';report.failure={code:error.name==='AssertionError'?String(error.message).split('\n')[0]:'AUTO_REVIEW_ACCEPTANCE_FAILED'};save();console.error(JSON.stringify(report.failure));process.exitCode=1;}
finally{state?.close();}
