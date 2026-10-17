import { mkdtempSync,rmSync,readFileSync,writeFileSync,appendFileSync,mkdirSync,renameSync,copyFileSync } from 'node:fs';
import { join,resolve,dirname,basename } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync,spawn } from 'node:child_process';
import { build } from 'esbuild';
import { it,expect,beforeEach,afterEach } from 'vitest';
import { TRANSFER_SOURCES } from '../../domain';
import type { SyncActor } from '../../domain/sync';
import { CompatibleSyncService } from '../../adapters/local/imports/sync/legacy';
import { readSyncView } from '../../adapters/local/imports/sync/read';
import { makeManifest,syncScopeId } from '../../adapters/local/imports/sync/contract';
import { hash } from '../../adapters/local/imports/identity';
import { scan,inventory } from '../phase0c/phase0c-evidence';
import { writePhase0Source,writePhase0Index,PHASE0_DEVICE,PHASE0_MODEL,PHASE0_PRICE,PHASE0_AT } from '../fixtures/sync-agent-phase0';
import { fromCapture,fromEvents } from './fixtures';
let home:string,service:CompatibleSyncService;
const owner:SyncActor={role:'owner',subject:'fixture-owner',reason:'review'},device:SyncActor={role:'device',deviceId:PHASE0_DEVICE};
const basis={rates:{[PHASE0_MODEL]:PHASE0_PRICE},aliases:{},schedule:'commandcode-peak-v1' as const,provenance:'fixture'};
const scopeFor=(source:typeof TRANSFER_SOURCES[number])=>({deviceId:PHASE0_DEVICE,source,sessionId:source==='commandcode'?'cc-phase0-commandcode':'phase0-'+source,originId:source});
const total=()=>readSyncView(service).events.reduce((sum,row)=>sum+row.inputTokens,0);
beforeEach(()=>{home=mkdtempSync(join(tmpdir(),'sync-agent-phase1-'));service=new CompatibleSyncService(join(home,'sync.db'));});
afterEach(()=>{service.close();rmSync(home,{recursive:true,force:true});});
it.each([...TRANSFER_SOURCES,'aiusage'] as const)('%s real collector→derived proof→normalized runtime appends and retains unsupported revisions',async reader=>{
  const source=reader==='aiusage'?'claudeCode':reader,scope=scopeFor(source),options=reader==='aiusage'?{reader} as const:{};
  if(reader==='aiusage')writePhase0Index(home,source);else writePhase0Source(home,source);
  service.register(scope,'Synthetic device',owner);const capsule=await scan(home,scope,basis,null,options),first=fromCapture(capsule,undefined,'first');service.ingest(first.header,first.records,device);
  if(reader==='aiusage'){const db=new DatabaseSync(join(home,'.aiusage/cache.db'));try{db.exec('INSERT INTO records SELECT ts+1000,tool,model,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,thinking_tokens,cost,session_id,source_file,cwd FROM records');}finally{db.close();}}
  else writePhase0Source(home,source,{count:2});
  const secondCapsule=await scan(home,scope,basis,null,options),second=fromCapture(secondCapsule,{capsule,header:first.header},'append');
  expect(service.ingest(second.header,second.records,device).status).toBe('committed');expect(total()).toBe(200);
  if(reader==='aiusage'){const db=new DatabaseSync(join(home,'.aiusage/cache.db'));try{db.exec('UPDATE records SET input_tokens=120');}finally{db.close();}}
  else writePhase0Source(home,source,{count:2,input:120});
  const third=fromCapture(await scan(home,scope,basis,null,options),{capsule:secondCapsule,header:second.header},'revise');
  const result=service.ingest(third.header,third.records,device);const supported=source!=='antigravity'&&reader!=='aiusage';expect(result.status).toBe(supported?'committed':'review-required');expect(total()).toBe(supported?240:200);
});
it.each(['commandcode','claudeCode','geminiCli','antigravity','zcode'] as const)('%s weak old record modification stays under review',async source=>{
  const scope=scopeFor(source);writePhase0Source(home,source,{withoutId:true});service.register(scope,'Synthetic device',owner);
  const capsule=await scan(home,scope,basis),first=fromCapture(capsule,undefined,'weak');service.ingest(first.header,first.records,device);
  writePhase0Source(home,source,{withoutId:true,input:120});const next=fromCapture(await scan(home,scope,basis),{capsule,header:first.header},'weak-edit');
  expect(service.ingest(next.header,next.records,device).status).toBe('review-required');expect(total()).toBe(100);
  service.cleanup(Date.now()+1e12);expect(service.db.prepare('SELECT COUNT(*) n FROM sync_review_members').get()!.n).toBe(1);
});
it('Gemini two identical current worlds differ by committed parent; late old timestamps are retained',async()=>{
  const scope=scopeFor('geminiCli');writePhase0Source(home,'geminiCli');const capsule=await scan(home,scope,basis),a=fromCapture(capsule,undefined,'a');service.register(scope,'Synthetic device',owner);service.ingest(a.header,a.records,device);
  const other=new CompatibleSyncService(join(home,'world-b.db'));other.register(scope,'Synthetic device',owner);
  try{writePhase0Source(home,'geminiCli',{count:2});const capB=await scan(home,scope,basis),b=fromCapture(capB,undefined,'b');other.ingest(b.header,b.records,device);
    writePhase0Source(home,'geminiCli');const current=await scan(home,scope,basis),nextA=fromCapture(current,{capsule,header:a.header},'a2'),nextB=fromCapture(current,{capsule:capB,header:b.header},'b2');
    expect(service.ingest(nextA.header,nextA.records,device).code).toBe('unchanged');expect(other.ingest(nextB.header,nextB.records,device).code).toBe('PREFIX_LOST');
    expect(readSyncView(other).events.reduce((sum,row)=>sum+row.inputTokens,0)).toBe(200);
  }finally{other.close();}
});
it.each([{values:[100]},{values:[50,100,200]}])('Codex anchored cumulative correction $values updates usage and costs without additive identities',async ({values})=>{
  const scope=scopeFor('codex');const write=(totals:number[])=>{writePhase0Source(home,'codex',{count:totals.length});const path=join(home,inventory(home,'codex')[0]),rows=readFileSync(path,'utf8').trim().split('\n').map(line=>JSON.parse(line));
    totals.forEach((n,i)=>{rows[i+2].payload.info={total_token_usage:{input_tokens:n,cached_input_tokens:0,output_tokens:0,reasoning_output_tokens:0},last_token_usage:{input_tokens:i?n-totals[i-1]:n,cached_input_tokens:0,output_tokens:0,reasoning_output_tokens:0}};});writeFileSync(path,rows.map(row=>JSON.stringify(row)).join('\n')+'\n');};
  write(values);service.register(scope,'Synthetic device',owner);let capsule=await scan(home,scope,basis),candidate=fromCapture(capsule,undefined,'start');service.ingest(candidate.header,candidate.records,device);
  for(const [i,nextValues] of (values.length===1?[[120]]:[[50,120,200],[50,120,220]]).entries()) {write(nextValues);const nextCap=await scan(home,scope,basis),next=fromCapture(nextCap,{capsule,header:candidate.header},'correction'+i);
    expect(service.ingest(next.header,next.records,device).status).toBe('committed');expect(total()).toBe(nextValues.at(-1));expect(readSyncView(service).events.reduce((sum,row)=>sum+row.cost,0)).toBeCloseTo(nextValues.at(-1)!/1e6,10);capsule=nextCap;candidate=next;}
});
it('late native key can be inserted before existing event order while preserving every old key',()=>{
  const scope=scopeFor('claudeCode'),event={eventId:hash('first'),source:scope.source,sessionId:scope.sessionId,timestampMs:PHASE0_AT,modelName:PHASE0_MODEL,projectKey:'p',projectName:'P',inputTokens:100,outputTokens:20,cacheReadTokens:10,cacheCreationTokens:0,reasoningTokens:0};
  service.register(scope,'Synthetic device',owner);const first=fromEvents([event],scope,undefined,'first');service.ingest(first.header,first.records,device);
  const next=fromEvents([{...event,eventId:hash('late'),timestampMs:PHASE0_AT-8*86400000},event],scope,first.header,'late');expect(service.ingest(next.header,next.records,device).status).toBe('committed');expect(total()).toBe(200);
});
it('half-write and read failure retain visible version; unsupported compressed/version and wrong parent fail closed',async()=>{
  const scope=scopeFor('claudeCode');writePhase0Source(home,'claudeCode');service.register(scope,'Synthetic device',owner);const capsule=await scan(home,scope,basis),first=fromCapture(capsule);service.ingest(first.header,first.records,device);
  appendFileSync(join(home,inventory(home,'claudeCode')[0]),'{');const incomplete=fromCapture(await scan(home,scope,basis),{capsule,header:first.header},'partial');expect(service.ingest(incomplete.header,incomplete.records,device).code).toBe('INCOMPLETE_READ');expect(total()).toBe(100);
  const unsupported={...first.header,batchId:'zst',manifest:makeManifest({...first.header.manifest,parent:{generationId:first.header.manifest.generationId,manifestHash:first.header.manifest.manifestHash},ranges:first.header.manifest.ranges.map(row=>({...row,kind:'compressed' as const}))})};
  expect(service.ingest(unsupported,first.records,device).code).toBe('UNSUPPORTED_EVIDENCE');
  expect(()=>service.begin({...first.header,manifest:{...first.header.manifest,collectorVersion:'unknown'}},device)).toThrow('UNSUPPORTED_VERSION');
});
it('Owner rebase resolves a reviewed truncation in a new epoch and is audited',()=>{
  const scope=scopeFor('claudeCode'),events=[0,1].map(i=>({eventId:hash(i),source:scope.source,sessionId:scope.sessionId,timestampMs:PHASE0_AT+i,modelName:PHASE0_MODEL,projectKey:'p',projectName:'P',inputTokens:100,outputTokens:20,cacheReadTokens:10,cacheCreationTokens:0,reasoningTokens:0}));
  service.register(scope,'Synthetic device',owner);const first=fromEvents(events,scope,undefined,'first');service.ingest(first.header,first.records,device);const next=fromEvents(events.slice(0,1),scope,first.header,'rebase');next.header.manifest=makeManifest({...next.header.manifest,epoch:1,intent:'rebase',ranges:next.header.manifest.ranges.map(row=>({...row,previous:undefined}))});
  expect(service.ingest(next.header,next.records,device).code).toBe('EXPLICIT_OWNER_REQUIRED');next.header.batchId='owner-rebase';expect(service.ingest(next.header,next.records,owner).code).toBe('baseline-observed');expect(total()).toBe(100);
});
it('separately staged concurrent writers use parent CAS and staging limits prevent partial publication',async()=>{
  const scope=scopeFor('geminiCli');writePhase0Source(home,'geminiCli');service.register(scope,'Synthetic device',owner);const capsule=await scan(home,scope,basis),first=fromCapture(capsule);service.ingest(first.header,first.records,device);
  writePhase0Source(home,'geminiCli',{count:2});const candidate=fromCapture(await scan(home,scope,basis),{capsule,header:first.header},'writer-a'),other=new CompatibleSyncService(service.path);
  try{const b={...candidate.header,batchId:'writer-b'};service.begin(candidate.header,device);other.begin(b,device);service.stage(PHASE0_DEVICE,'writer-a',0,candidate.records,device);other.stage(PHASE0_DEVICE,'writer-b',0,candidate.records,device);
    expect(service.commit(PHASE0_DEVICE,'writer-a',device).status).toBe('committed');expect(other.commit(PHASE0_DEVICE,'writer-b',device).code).toBe('PARENT_MISMATCH');expect(total()).toBe(200);
  }finally{other.close();}
});
it('an extra unbound rotation witness cannot introduce a new range beside unchanged old ranges',async()=>{
  const scope=scopeFor('geminiCli');writePhase0Source(home,'geminiCli');service.register(scope,'Synthetic device',owner);const capsule=await scan(home,scope,basis),first=fromCapture(capsule);service.ingest(first.header,first.records,device);
  const next=fromCapture(capsule,{capsule,header:first.header},'unbound'),ranges=[...next.header.manifest.ranges,{...next.header.manifest.ranges[0],locatorHash:hash('alien'),identityHash:hash('alien'),root:hash('alien'),previous:{locatorHash:hash('absent'),root:hash('absent'),retainedRoot:hash('absent'),retainedBytes:1,change:'rotation' as const}}];
  const root=hash(ranges.map(row=>[row.locatorHash,row.root]));next.header.manifest=makeManifest({...next.header.manifest,ranges,read:{status:'complete',inventoryHash:hash(ranges.map(row=>row.locatorHash).sort()),beforeRoot:root,afterRoot:root,snapshotRoot:root}});
  expect(service.ingest(next.header,next.records,device).code).toBe('ROTATION_UNVERIFIED');expect(total()).toBe(100);
});
it.each(['codex','commandcode','claudeCode','geminiCli'] as const)('%s verified rotation hands off the full old range without duplicated counts',async source=>{
  const scope=scopeFor(source);writePhase0Source(home,source);service.register(scope,'Synthetic device',owner);const capsule=await scan(home,scope,basis),first=fromCapture(capsule);service.ingest(first.header,first.records,device);
  const old=capsule.files[0],target=(source==='commandcode'?'.commandcode/projects/archive/'+basename(old.locator):join(dirname(old.locator),'archive',basename(old.locator))).replaceAll('\\','/');mkdirSync(dirname(join(home,target)),{recursive:true});
  if(source==='commandcode')renameSync(join(home,old.locator),join(home,target));else copyFileSync(join(home,old.locator),join(home,target));
  const bridges=[{parentHash:capsule.manifestHash,from:old.locator,to:target,oldRoot:old.root,kind:source==='commandcode'?'same-file' as const:'embedded-session-copy' as const}];
  const nextCap=await scan(home,scope,basis,null,{bridges}),next=fromCapture(nextCap,{capsule,header:first.header},'rotation');expect(service.ingest(next.header,next.records,device).status).toBe('committed');expect(total()).toBe(100);
});
it.each(['antigravity','opencode','zcode'] as const)('%s copy/replaced DB remains isolated even with identical logical bytes',async source=>{
  const scope=scopeFor(source);writePhase0Source(home,source);service.register(scope,'Synthetic device',owner);const capsule=await scan(home,scope,basis),first=fromCapture(capsule);service.ingest(first.header,first.records,device);
  const file=join(home,capsule.files[0].locator);copyFileSync(file,file+'.replacement');renameSync(file,file+'.old');renameSync(file+'.replacement',file);
  const next=fromCapture(await scan(home,scope,basis),{capsule,header:first.header},'replacement');expect(service.ingest(next.header,next.records,device).code).toBe('DB_REPLACED_UNVERIFIED');expect(total()).toBe(100);
});
it('byte-bounded pages accept valid long metadata and a generation larger than one page',()=>{
  const scope=scopeFor('claudeCode'),events=Array.from({length:501},(_,i)=>({eventId:hash(i),source:scope.source,sessionId:scope.sessionId,timestampMs:PHASE0_AT+i,modelName:PHASE0_MODEL,projectKey:'p',projectName:'P',workspacePath:'X'+'.'.repeat(2000),sessionTitle:'s'.repeat(1000),inputTokens:100,outputTokens:20,cacheReadTokens:10,cacheCreationTokens:0,reasoningTokens:0}));
  service.register(scope,'Synthetic device',owner);const candidate=fromEvents(events,scope);expect(service.ingest(candidate.header,candidate.records,device).status).toBe('committed');expect(total()).toBe(50100);
  const first=service.currentPage(scope,0,500,device);expect(first.records.length<500).toBe(true);expect(Buffer.byteLength(JSON.stringify(first.records))<=512*1024).toBe(true);
  expect(()=>service.currentPage(scope,0,500,{role:'device',deviceId:'other'})).toThrow('DEVICE_MISMATCH');
  expect(()=>service.currentPage(scope,0,500,{role:'pro',deviceId:PHASE0_DEVICE} as unknown as SyncActor)).toThrow('DEVICE_MISMATCH');
  const next=fromEvents([...events,{...events[0],eventId:hash('new'),timestampMs:PHASE0_AT+502}],scope,candidate.header,'next');service.ingest(next.header,next.records,device);
  expect(()=>service.currentPage(scope,first.nextOffset,500,device,first.dataRevision)).toThrow('READ_REVISION_CHANGED');
});
it('Owner review resolution is explicit, auditable and preserves the retained proposal',async()=>{
  const scope=scopeFor('geminiCli');writePhase0Source(home,'geminiCli',{count:2});service.register(scope,'Synthetic device',owner);const capsule=await scan(home,scope,basis),first=fromCapture(capsule);service.ingest(first.header,first.records,device);
  writePhase0Source(home,'geminiCli');const next=fromCapture(await scan(home,scope,basis),{capsule,header:first.header},'loss');service.ingest(next.header,next.records,device);
  const reviews=service.reviews(owner);expect(reviews).toHaveLength(1);expect(()=>service.resolveReview(Number(reviews[0].id),device)).toThrow('EXPLICIT_OWNER_REQUIRED');
  expect(service.reviewPage(Number(reviews[0].id),0,500,owner).records).toHaveLength(1);expect(()=>service.reviewPage(Number(reviews[0].id),0,500,device)).toThrow('EXPLICIT_OWNER_REQUIRED');
  expect(()=>service.resolveReview(Number(reviews[0].id),owner,'uncommitted')).toThrow('COMMITTED_SUCCESSOR_REQUIRED');
  service.resolveReview(Number(reviews[0].id),owner);expect(service.reviews(owner)[0].resolution_json).toBeDefined();expect(total()).toBe(200);expect(service.db.prepare('SELECT COUNT(*) n FROM sync_review_members').get()!.n).toBe(1);
});
it.each(['geminiCli','opencode'] as const)('%s logical append can shrink physical bytes without deleting old scope data',async source=>{
  const scope=scopeFor(source);writePhase0Source(home,source);const file=join(home,inventory(home,source)[0]);
  if(source==='geminiCli')writeFileSync(file,' '.repeat(10000)+readFileSync(file,'utf8'));
  else{const db=new DatabaseSync(file);try{db.exec('CREATE TABLE bloater(payload BLOB);INSERT INTO bloater VALUES(zeroblob(1048576));DROP TABLE bloater');}finally{db.close();}}
  service.register(scope,'Synthetic device',owner);const capsule=await scan(home,scope,basis),first=fromCapture(capsule);service.ingest(first.header,first.records,device);writePhase0Source(home,source,{count:2});
  if(source==='opencode'){const db=new DatabaseSync(file);try{db.exec('VACUUM');}finally{db.close();}}
  const nextCap=await scan(home,scope,basis),next=fromCapture(nextCap,{capsule,header:first.header},'logical-append');expect(nextCap.files[0].byteLength<capsule.files[0].byteLength).toBe(true);
  expect(service.ingest(next.header,next.records,device).status).toBe('committed');expect(total()).toBe(200);
});
it('unknown DB schema envelope and source/format mismatches preserve the old generation',async()=>{
  const scope=scopeFor('opencode');writePhase0Source(home,'opencode');service.register(scope,'Synthetic device',owner);const capsule=await scan(home,scope,basis),first=fromCapture(capsule);service.ingest(first.header,first.records,device);
  const db=new DatabaseSync(join(home,capsule.files[0].locator));try{db.exec('ALTER TABLE message ADD COLUMN future_metadata TEXT');}finally{db.close();}
  const next=fromCapture(await scan(home,scope,basis),{capsule,header:first.header},'upgrade');expect(service.ingest(next.header,next.records,device).code).toBe('SOURCE_REVISION_UNVERIFIED');expect(total()).toBe(100);
  const mismatch={...next.header,batchId:'wrong-format',manifest:makeManifest({...next.header.manifest,ranges:next.header.manifest.ranges.map(row=>({...row,kind:'jsonl' as const}))})};
  expect(()=>service.begin(mismatch,device)).toThrow('SOURCE_FORMAT_MISMATCH');expect(total()).toBe(100);
});
it('safe individual pages cannot overflow generation or cross-scope numeric totals',()=>{
  const scope=scopeFor('claudeCode'),events=Array.from({length:2000},(_,i)=>({eventId:hash(i),source:scope.source,sessionId:scope.sessionId,timestampMs:PHASE0_AT+i,modelName:PHASE0_MODEL,projectKey:'p',projectName:'P',inputTokens:1e12,outputTokens:1e12,cacheReadTokens:1e12,cacheCreationTokens:1e12,reasoningTokens:1e12}));
  service.register(scope,'Synthetic device',owner);const excessive=fromEvents(events,scope,undefined,'excessive');expect(service.ingest(excessive.header,excessive.records,device).code).toBe('TOKEN_TOTAL_OVERFLOW');expect(total()).toBe(0);
  const first=fromEvents(events.slice(0,1000),scope,undefined,'safe');expect(service.ingest(first.header,first.records,device).status).toBe('committed');
  const other={...scope,sessionId:'other',originId:'other'};service.register(other,'Synthetic device',owner);const second=fromEvents(events.slice(0,1000).map(event=>({...event,sessionId:'other'})),other,undefined,'global-excessive');
  expect(service.ingest(second.header,second.records,device).code).toBe('TOKEN_TOTAL_OVERFLOW');expect(service.currentPage(other,0,1,device).records).toHaveLength(0);
});
it('real process exit between visible UPDATE and COMMIT rolls back; retry recovers persisted pages and lost ACK',async()=>{
  const scope=scopeFor('geminiCli');writePhase0Source(home,'geminiCli');service.register(scope,'Synthetic device',owner);const capsule=await scan(home,scope,basis),first=fromCapture(capsule);service.ingest(first.header,first.records,device);
  writePhase0Source(home,'geminiCli',{count:2});const candidate=fromCapture(await scan(home,scope,basis),{capsule,header:first.header},'crash');
  const runner=join(home,'worker.cjs'),input=join(home,'input.json');await build({entryPoints:[resolve('src/__tests__/phase1/process-worker.ts')],outfile:runner,bundle:true,platform:'node',format:'cjs'});writeFileSync(input,JSON.stringify({...candidate,actor:device}));
  let status=0;try{execFileSync(process.execPath,[runner,'crash',service.path,input],{windowsHide:true,stdio:'pipe',timeout:30000});}catch(error){status=(error as {status:number}).status;}expect(status).toBe(23);
  expect(total()).toBe(100);expect(service.receipt(PHASE0_DEVICE,'crash')).toBe(undefined);
  const receipt=JSON.parse(execFileSync(process.execPath,[runner,'commit',service.path,input],{windowsHide:true,encoding:'utf8',timeout:30000}));expect(receipt.status).toBe('committed');expect(total()).toBe(200);expect(service.ingest(candidate.header,candidate.records,device)).toEqual(receipt);
  const child=spawn(process.execPath,[runner,'hold',service.path,input],{windowsHide:true,stdio:['ignore','pipe','pipe']});child.stderr.resume();
  await new Promise<void>((resolve,reject)=>{child.stdout.once('data',()=>resolve());child.once('error',reject);});service.transaction(()=>service.audit('contention-test',syncScopeId(scope),'held',owner));
  await new Promise<void>(resolve=>child.once('close',()=>resolve()));expect(total()).toBe(200);
},30000);
