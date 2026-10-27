// Read original homes only; worker snapshots are private and disposable.
// Select recent usage candidates; this does not enumerate server lineage or upload.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {workerCollector,buildCandidate,classifyIssues} from '../../apps/sync-agent/dist/library.mjs';
const directory='C:/Users/86139/AppData/Local/Incept/v4-acceptance-20261019';
assert.equal(resolve(process.env.INCEPT_V4_ACCEPTANCE_DIR??''),resolve(directory));
const inventory=JSON.parse(readFileSync('output/r5-real-source-inventory.json','utf8'));
assert.equal(inventory.formal.heartbeatPidAlive,false,'FORMAL_AGENT_ACTIVE');
const config=JSON.parse(readFileSync(join(directory,'config.json'),'utf8'));
assert.equal(config.endpoint,'http://127.0.0.1:3305');assert.equal(config.remote,false);
const cutoff=Date.parse(inventory.baseline.lastCollectedAt);assert(Number.isFinite(cutoff));
const root=join(directory,'real-source-'+randomUUID());mkdirSync(root,{mode:0o700});
const report={status:'preparing',startedAt:new Date().toISOString(),cutoff:new Date(cutoff).toISOString(),
 historical359:'previous result reused; no server lineage enumeration',uploadPerformed:false,sources:{}};
const pointer=join(directory,'real-source-current.json');
assert(!existsSync(pointer),'REAL_SOURCE_RUN_ALREADY_EXISTS');
writeFileSync(pointer,JSON.stringify({root}));
const save=()=>{writeFileSync(join(root,'prepare-report.json'),JSON.stringify(report,null,2));writeFileSync('output/r5-real-source-preparation.json',JSON.stringify(report,null,2)+'\n');};
try{
 const {build}=createRequire(new URL('../../packages/dashboard/package.json',import.meta.url))('esbuild');
 const rules=join(root,'rules.mjs');
 await build({stdin:{contents:`export {hash} from ${JSON.stringify(resolve('packages/dashboard/src/adapters/local/imports/identity.ts'))};export {qualifyRanges,qualifyRecords,sequenceHash} from ${JSON.stringify(resolve('packages/dashboard/src/adapters/local/imports/sync/contract.ts'))};`,resolveDir:process.cwd(),loader:'ts'},outfile:rules,bundle:true,platform:'node',format:'esm',target:'node24'});
 const {hash,qualifyRanges}=await import(pathToFileURL(rules).href);
 const baseline=new DatabaseSync(join(process.env.LOCALAPPDATA,'Incept','sync-agent-v4-prodcheck','state.db'),{readOnly:true});
 let rows;try{rows=baseline.prepare('SELECT scope,parent_json,signature,receipt_json FROM lineage').all();}finally{baseline.close();}
 const parents=rows.map(row=>JSON.parse(row.parent_json));
 const byKey=new Map(rows.map((row,i)=>[JSON.stringify([parents[i].header.manifest.scope.source,parents[i].header.manifest.scope.sessionId]),{row,parent:parents[i]}]));
 const collect=workerCollector(root);
 for(const source of config.allowedSources){
  console.log(JSON.stringify({source,step:'read-only-live-source-capture'}));
  const result=await collect(inventory.sourceHome,[source],parents,undefined,{tolerantIncomplete:false});
  const eligible=[];let historicalOrUnchanged=0,syntheticExcluded=0;
  for(const capture of result.captures){
   if(/^(?:local-r5-|pending-restart-|phase0-|fixture-|test-)/i.test(capture.sessionId)){syntheticExcluded++;continue;}
   const fresh=capture.records.filter(r=>r.event.timestampMs>cutoff);
   if(!fresh.length){historicalOrUnchanged++;continue;}
   const previous=byKey.get(JSON.stringify([source,capture.sessionId]));
   const signature=hash([capture.reader,capture.records,capture.proofs.map(p=>[p.range.locatorHash,p.range.identityHash,p.range.root])]);
   if(previous?.row.signature===signature){historicalOrUnchanged++;continue;}
   const scope=previous?.parent.header.manifest.scope??{deviceId:config.deviceId,source,sessionId:capture.sessionId,originId:hash(['incept-origin/1',source,capture.sessionId])};
   assert.equal(scope.deviceId,config.deviceId,'ACCEPTED_PARENT_DEVICE_MISMATCH');
   const candidate=buildCandidate(capture,scope,previous?.parent,randomUUID());
   qualifyRanges(previous?.parent.header.manifest,candidate.header.manifest);
   eligible.push({capture,previous:previous?.row??null,candidate,signature,freshRecords:fresh.length,
    lastUsageAt:new Date(Math.max(...fresh.map(r=>r.event.timestampMs))).toISOString()});
  }
  eligible.sort((a,b)=>Number(!!b.previous)-Number(!!a.previous)||b.lastUsageAt.localeCompare(a.lastUsageAt));
  // Keep only one complete real session per source for this bounded canary.
  const selected=eligible[0];
  if(selected)writeFileSync(join(root,source+'-candidate.json'),JSON.stringify(selected),{mode:0o600});
  const blocked=classifyIssues(result.issues,[source]).blocking.length>0;
  report.sources[source]={status:blocked?'blocked-collector-incomplete':selected?'ready-for-real-canary':'awaiting-real-new-usage',issues:result.issues,
   reader:selected?.capture.reader??null,eligibleSessions:eligible.length,historicalOrUnchanged,syntheticExcluded,
   selected:selected?{sessionHash:hash(selected.capture.sessionId),hasAcceptedParent:!!selected.previous,recordCount:selected.capture.records.length,
    previousRecordCount:selected.previous?JSON.parse(selected.previous.parent_json).header.manifest.recordCount:0,
    freshRecords:selected.freshRecords,lastUsageAt:selected.lastUsageAt}:null};
  save();console.log(JSON.stringify({source,...report.sources[source]}));
  if(blocked)throw Error('REAL_SOURCE_COLLECTOR_BLOCKED');
 }
 report.status='prepared';report.completedAt=new Date().toISOString();save();
}catch(error){report.status='blocked';report.failure={code:/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'REAL_SOURCE_PREPARATION_FAILED'};save();console.error(JSON.stringify(report.failure));process.exitCode=1;}
