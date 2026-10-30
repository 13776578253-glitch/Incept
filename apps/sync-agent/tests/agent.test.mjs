import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,appendFileSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {AgentState,SyncEngine,AgentHttp,RemoteError,RemoteLink,captureHome,buildCandidate,storeToken,loadToken,protectDirectory,validateEndpoint,resumeReviewed,reconcileHeads} from '../dist/library.mjs';
import {fixtures as f} from './helpers.mjs';
const sources=['codex','commandcode','claudeCode','geminiCli','antigravity','opencode','zcode'];
const deviceId='00000000-0000-4000-8000-000000000003',actor={role:'device',deviceId};
async function sandbox(fn){const dir=mkdtempSync(join(tmpdir(),'incept-agent-test-'));try{await fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}}
async function scan(home,dir,parents=[]){const path=join(dir,'snapshot-'+randomUUID());try{return await captureHome(home,path,sources,parents);}finally{rmSync(path,{recursive:true,force:true});}}
const scope=c=>({source:c.source,sessionId:c.sessionId,deviceId,originId:f.hash(['incept-origin/1',c.source,c.sessionId])});

test('local status never calls a stopped Agent online based on a persisted old heartbeat',()=>sandbox(async dir=>{
  const state=new AgentState(join(dir,'state'));writeFileSync(join(state.directory,'config.json'),JSON.stringify({version:1,deviceId,endpoint:'https://localhost:1',home:dir,allowedSources:['claudeCode'],remote:true}));state.set('remoteOnline',true);state.close();
  const status=JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('../dist/agent.mjs',import.meta.url)),'status','--state',join(dir,'state')],{encoding:'utf8',windowsHide:true}));assert.equal(status.running,false);assert.equal(status.remoteOnline,false);
}));

test('review recovery confirms the exact committed receipt without requiring the current head',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Home(home,1);const capture=(await scan(home,dir)).captures.find(c=>c.source==='claudeCode'),candidate=buildCandidate(capture,scope(capture),undefined,'review-recovery'),state=new AgentState(join(dir,'state')),service=new f.CompatibleSyncService(join(dir,'cloud.db'));
  try{state.enqueue(candidate,'signature');state.fail(candidate.header.batchId,'V1_ADOPTION_REVIEW_REQUIRED',true);
    service.register(candidate.header.manifest.scope,'Synthetic',{role:'owner',subject:'owner',reason:'fixture'});const receipt=service.ingest(candidate.header,candidate.records,actor);
    const missing={request:async path=>path==='/scopes/resolve'?{scope:candidate.header.manifest.scope,headManifest:'different'}:{}};await assert.rejects(()=>resumeReviewed(state,missing,candidate.header.batchId),/REVIEW_RECEIPT_REQUIRED/);assert.equal(state.status().confirmedScopes,0);assert.equal(state.status().outbox[0].count,1);
    const approved={request:async path=>path==='/scopes/resolve'?{scope:candidate.header.manifest.scope,headManifest:'later-head'}:{receipt}};
    assert.equal((await resumeReviewed(state,approved,candidate.header.batchId)).confirmed,true);assert.equal(state.status().confirmedScopes,1);assert.equal(state.status().receiptCount,1);
  }finally{state.close();service.close();}
}));
test('a review-required receipt becomes a durable review state and never returns to pending',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Home(home,1);const capture=(await scan(home,dir)).captures.find(c=>c.source==='claudeCode'),candidate=buildCandidate(capture,scope(capture),undefined,'review-required'),state=new AgentState(join(dir,'state'));
  try{state.enqueue(candidate,'signature');state.fail(candidate.header.batchId,'V1_ADOPTION_REVIEW_REQUIRED',true);
    const receipt={batchId:candidate.header.batchId,payloadHash:f.hash(candidate.header),generationId:candidate.header.manifest.generationId,
      manifestHash:candidate.header.manifest.manifestHash,dataRevision:7,status:'review-required',outcome:'conflict',code:'PREFIX_LOST'};
    const http={request:async path=>path==='/scopes/resolve'?{scope:candidate.header.manifest.scope,headManifest:candidate.header.manifest.parent?.manifestHash??null}:{receipt}};
    const result=await resumeReviewed(state,http,candidate.header.batchId);
    assert.equal(result.confirmed,false);assert.equal(result.reviewRequired,true);assert.equal(state.reviewCount(),1);assert.equal(state.pending().length,0);
    assert.equal(state.db.prepare("SELECT state,error FROM outbox WHERE batch=?").get(candidate.header.batchId).state,'review');
  }finally{state.close();}
}));
test('a resolved review marks its local batch superseded',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Home(home,1);const capture=(await scan(home,dir)).captures.find(c=>c.source==='claudeCode'),candidate=buildCandidate(capture,scope(capture),undefined,'review-resolved'),state=new AgentState(join(dir,'state'));
  try{state.enqueue(candidate,'signature');state.fail(candidate.header.batchId,'V1_ADOPTION_REVIEW_REQUIRED',true);
    const receipt={batchId:candidate.header.batchId,payloadHash:f.hash(candidate.header),generationId:candidate.header.manifest.generationId,
      manifestHash:candidate.header.manifest.manifestHash,dataRevision:7,status:'review-required',outcome:'conflict',code:'PREFIX_LOST'};
    const http={request:async path=>path==='/scopes/resolve'?{scope:candidate.header.manifest.scope,headManifest:'successor-head'}:{receipt,review:{id:1,resolution:{disposition:'accepted-successor',committedSuccessor:'successor-head'}}}};
    const result=await resumeReviewed(state,http,candidate.header.batchId);
    assert.equal(result.superseded,true);assert.equal(state.reviewCount(),0);assert.equal(state.db.prepare("SELECT state FROM outbox WHERE batch=?").get(candidate.header.batchId).state,'superseded');
  }finally{state.close();}
}));
test('owner rebase reconciliation adopts the server head and supersedes stale candidates',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Home(home,1);const capture=(await scan(home,dir)).captures.find(c=>c.source==='claudeCode'),scopeValue=scope(capture),old=buildCandidate(capture,scopeValue,undefined,'reconcile-old'),fresh=buildCandidate(capture,scopeValue,old,'reconcile-new'),state=new AgentState(join(dir,'state'));
  try{state.enqueue(old,'signature');state.fail(old.header.batchId,'LOCAL_PARENT_MISMATCH',true);
    const http={request:async path=>path==='/scopes/resolve'?{scope:old.header.manifest.scope,headManifest:fresh.header.manifest.manifestHash,head:fresh.header}:{}};
    const result=await reconcileHeads(state,http);
    assert.equal(result.reconciled.length,1);assert.equal(result.reconciled[0].superseded,1);assert.equal(state.reviewCount(),0);
    assert.equal(state.parents().find(parent=>parent.header.manifest.scope.sessionId===capture.sessionId).header.manifest.manifestHash,fresh.header.manifest.manifestHash);
  }finally{state.close();}
}));
test('permanent 4xx quarantines only the failed batch and 409 enters lineage recovery',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Home(home,1);const capture=(await scan(home,dir)).captures.find(c=>c.source==='claudeCode'),candidate=buildCandidate(capture,scope(capture),undefined,'rejection'),state=new AgentState(join(dir,'state'));
  try{state.enqueue(candidate,'signature');state.db.prepare('UPDATE outbox SET admitted=1 WHERE batch=?').run(candidate.header.batchId);
    const bad={request:async()=>{throw new RemoteError('INVALID_HEADER',400);}};
    await new SyncEngine(state,{version:1,endpoint:'https://synthetic.invalid',deviceId,home,allowedSources:['claudeCode']},bad,async()=>{throw Error('NO_CAPTURE');}).flush();
    assert.equal(state.db.prepare("SELECT state FROM outbox WHERE batch=?").get(candidate.header.batchId).state,'quarantined');
    state.db.prepare("UPDATE outbox SET state='pending' WHERE batch=?").run(candidate.header.batchId);
    const conflict={request:async()=>{throw new RemoteError('PARENT_MISMATCH',409);}};
    await new SyncEngine(state,{version:1,endpoint:'https://synthetic.invalid',deviceId,home,allowedSources:['claudeCode']},conflict,async()=>{throw Error('NO_CAPTURE');}).flush();
    assert.equal(state.db.prepare("SELECT state FROM outbox WHERE batch=?").get(candidate.header.batchId).state,'lineage');
    assert.equal(state.reviewCount(),0);
  }finally{state.close();}
}));
test('Antigravity capture emits a stable-key commitment and retains it across a parent',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Source(home,'antigravity',{count:2});const first=await scan(home,dir);const capture=first.captures.find(c=>c.source==='antigravity');
  assert(capture);const commitment=capture.proofs[0].range.commitment;assert.equal(commitment.kind,'stable-key-set');assert(commitment.count>0);assert.match(commitment.keyRoot,/^[a-f0-9]{64}$/);
  const parent=buildCandidate(capture,scope(capture),undefined,'antigravity-parent');const second=await scan(home,dir,[parent]);const next=second.captures.find(c=>c.source==='antigravity');
  assert(next);assert(next.proofs[0].range.commitment.count>=commitment.count);
}));
test('seven REAL collectors: baseline and ordinary append preserve all old records',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Home(home,1);const service=new f.CompatibleSyncService(join(dir,'cloud.db'));
  try{const first=await scan(home,dir);assert.equal(first.issues.length,0);assert.equal(first.captures.length,7);const parents=[];
    for(const c of first.captures){f.resolveScope(service,c,actor);const p=buildCandidate(c,scope(c),undefined,randomUUID());assert.equal(service.ingest(p.header,p.records,actor).status,'committed');parents.push(p);}
    f.writePhase0Home(home,2);const second=await scan(home,dir,parents);assert.equal(second.captures.length,7);
    for(const c of second.captures){const parent=parents.find(p=>p.header.manifest.scope.source===c.source),p=buildCandidate(c,scope(c),parent,randomUUID());assert.equal(service.ingest(p.header,p.records,actor).status,'committed',c.source);}
    assert.equal(f.readSyncView(service).events.length,14);
  }finally{service.close();}
}));
test('Codex 50/100/200 → 50/120/200 → 50/120/220 uses session generations',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Home(home);const file=join(home,'.codex/sessions/phase0-codex.jsonl');const service=new f.CompatibleSyncService(join(dir,'cloud.db'));let parent;
  try{for(const [counts,expected] of [[[50,100,200],200],[[50,120,200],200],[[50,120,220],220]]){
    const rows=[{type:'session_meta',payload:{id:'phase0-codex',cwd:'D:/synthetic'}},{type:'turn_context',payload:{model:'phase0-fixture-model'}},...counts.map((input,i)=>({timestamp:new Date(f.PHASE0_AT+i*1000).toISOString(),type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{input_tokens:input,cached_input_tokens:0,output_tokens:0,reasoning_output_tokens:0},last_token_usage:{input_tokens:input-(counts[i-1]??0),output_tokens:0}}}}))];
    writeFileSync(file,rows.map(r=>JSON.stringify(r)).join('\n')+'\n');const capture=(await scan(home,dir,parent?[parent]:[])).captures.find(c=>c.source==='codex');assert(capture);f.resolveScope(service,capture,actor);const p=buildCandidate(capture,scope(capture),parent,randomUUID());const r=service.ingest(p.header,p.records,actor);assert.equal(r.status,'committed');parent=p;
    assert.equal(f.readSyncView(service).events.filter(r=>r.sourceId==='codex').reduce((n,r)=>n+r.inputTokens,0),expected);
  }}finally{service.close();}
}));
test('a real collector candidate retains v1 review until an explicit Owner approves the exact historical scope',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Source(home,'claudeCode');const bundle=f.phase0Export(home),legacy=join(dir,'legacy.db');
  const old=f.phase0Import(bundle,legacy);const service=new f.CompatibleSyncService(join(dir,'cloud.db'));
  try{
    service.migrateV1(legacy,{role:'owner',subject:'owner',reason:'synthetic migration'});
    const capture=(await scan(home,dir)).captures.find(c=>c.source==='claudeCode');assert(capture);
    const historical={role:'device',deviceId:bundle.device.id};const admission=f.resolveScope(service,capture,historical,legacy);assert.equal(admission.status,'review-required');
    const owner={role:'owner',subject:'owner',reason:'explicit review of source, session, device and frozen price'};
    const candidate=buildCandidate(capture,{...scope(capture),deviceId:historical.deviceId},undefined,randomUUID());service.register(candidate.header.manifest.scope,'Synthetic device',owner);
    service.begin(candidate.header,historical);service.stage(historical.deviceId,candidate.header.batchId,0,candidate.records,historical);service.adopt(candidate.header,old.id,owner,'owner-reviewed');
    const receipt=service.commit(historical.deviceId,candidate.header.batchId,historical);
    assert.equal(receipt.status,'committed');assert.equal(f.readSyncView(service).events.length,1);
    assert.equal(service.db.prepare('SELECT COUNT(*) n FROM sync_adoptions').get().n,1);
    const resumed=f.resolveScope(service,{source:capture.source,sessionId:capture.sessionId},historical,legacy);
    assert.equal(resumed.status,'registered');assert.equal(resumed.headManifest,receipt.manifestHash);assert.equal(resumed.head?.manifest?.manifestHash,receipt.manifestHash);
  }finally{service.close();}
}));
test('Gemini deletion returns review, preserving the old200; half JSONL is incomplete',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Home(home,2);const service=new f.CompatibleSyncService(join(dir,'cloud.db'));
  try{const a=(await scan(home,dir)).captures.find(c=>c.source==='geminiCli');f.resolveScope(service,a,actor);const p=buildCandidate(a,scope(a),undefined,randomUUID());service.ingest(p.header,p.records,actor);
    f.writePhase0Source(home,'geminiCli',{count:1});const b=(await scan(home,dir,[p])).captures.find(c=>c.source==='geminiCli'),next=buildCandidate(b,scope(b),p,randomUUID());assert.equal(service.ingest(next.header,next.records,actor).status,'review-required');assert.equal(f.readSyncView(service).events.reduce((n,r)=>n+r.inputTokens,0),200);
    appendFileSync(join(home,'.claude/projects/phase0-project/phase0-claudeCode.jsonl'),'{"half":');const partial=await scan(home,dir);assert(partial.issues.length);assert(!partial.captures.some(c=>c.source==='claudeCode'));assert.equal(partial.captures.length,6);
  }finally{service.close();}
}));
test('offline captures form durable planned parents; only matching committed receipt advances lineage',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Home(home);let state=new AgentState(join(dir,'state'));
  const config={version:1,endpoint:'https://synthetic.invalid',deviceId,home,allowedSources:sources};const offline={request:async()=>{throw new RemoteError('NETWORK_UNAVAILABLE',503);}};
  const collect=(home,allowed,parents)=>scan(home,dir,parents);
  await new SyncEngine(state,config,offline,collect).run();assert.equal(state.status().confirmedScopes,0);assert.equal(state.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,7);
  f.writePhase0Home(home,2);await new SyncEngine(state,config,offline,collect).run();assert.equal(state.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,14);state.close();state=new AgentState(join(dir,'state'));
  try{assert.equal(state.parents().length,7);const row=state.db.prepare('SELECT * FROM outbox ORDER BY serial LIMIT 1').get(),header=JSON.parse(row.header_json);const fake={batchId:row.batch,payloadHash:f.hash(header),generationId:header.manifest.generationId,manifestHash:header.manifest.manifestHash,dataRevision:1,status:'committed'};
    assert.throws(()=>state.acknowledge(row.batch,{...fake,payloadHash:'f'.repeat(64)}),/RECEIPT_MISMATCH/);assert.equal(state.status().confirmedScopes,0);state.acknowledge(row.batch,fake);assert.equal(state.status().confirmedScopes,1);assert.equal(state.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,13);
    state.fail(state.pending()[0].batch,'PREFIX_LOST',true);assert(state.status().outbox.some(r=>r.state==='review'));
  }finally{state.close();}
}));
test('fallback has weak generation identity and real SQLite snapshot append',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Pricing(home);f.writePhase0Index(home,'claudeCode');const result=await scan(home,dir);const c=result.captures[0];assert(c);assert.equal(c.reader,'aiusage');assert(!c.records[0].nativeKey);assert.equal(c.proofs[0].range.kind,'sqlite');
}));
test('scope admission is device-only, idempotent, global ownership and quota constrained',()=>sandbox(async dir=>{
  const service=new f.CompatibleSyncService(join(dir,'cloud.db'));try{const input={source:'claudeCode',sessionId:'session'};const first=f.resolveScope(service,input,actor);assert.equal(first.scope.originId,f.hash(['incept-origin/1','claudeCode','session']));assert.deepEqual(f.resolveScope(service,input,actor),first);
    assert.throws(()=>f.resolveScope(service,input,{role:'device',deviceId:randomUUID()}),/ORIGIN_OWNERSHIP_CONFLICT/);assert.throws(()=>f.resolveScope(service,input,{role:'owner',subject:'owner',reason:'fake'}),/DEVICE_MISMATCH/);
    for(let i=1;i<20;i++)f.resolveScope(service,{...input,sessionId:'session'+i},actor);assert.throws(()=>f.resolveScope(service,{...input,sessionId:'overflow'},actor),/ADMISSION_RATE_LIMIT/);
  }finally{service.close();}
}));
test('Windows current-user DPAPI and protected directory round trip', {skip:process.platform!=='win32'},()=>sandbox(async dir=>{
  protectDirectory(dir);
  const script=`$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;$acl=[IO.Directory]::GetAccessControl($env:INCEPT_TEST_ACL_DIRECTORY);$rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]));[pscustomobject]@{ownerMatches=($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -eq $sid.Value);protected=$acl.AreAccessRulesProtected;ruleCount=$rules.Count;onlyCurrentUser=($rules[0].IdentityReference.Value -eq $sid.Value);fullControl=($rules[0].FileSystemRights -eq [Security.AccessControl.FileSystemRights]::FullControl)}|ConvertTo-Json -Compress`;
  const acl=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,env:{...process.env,INCEPT_TEST_ACL_DIRECTORY:dir}}));
  assert.deepEqual(acl,{ownerMatches:true,protected:true,ruleCount:1,onlyCurrentUser:true,fullControl:true});
  const token='isync_'+randomBytes(32).toString('base64url');storeToken(dir,token);assert.equal(loadToken(dir),token);assert(!readFileSync(join(dir,'credential.dpapi')).includes(Buffer.from(token)));
}));
test('HTTPS required; only explicit loopback HTTP is accepted; URL credentials rejected',()=>{
  assert.equal(validateEndpoint('https://example.test'),'https://example.test');assert.throws(()=>new AgentHttp('http://example.test','unused'));assert.throws(()=>validateEndpoint('https://user:secret@example.test'));
  assert.throws(()=>validateEndpoint('https://example.test/?token=secret'));assert.equal(validateEndpoint('http://127.0.0.1:1234',true),'http://127.0.0.1:1234');
});
test('agent HTTP retries transient TLS/socket resets',()=>sandbox(async()=>{
  let attempts=0;const server=createServer((_req,res)=>{attempts++;if(attempts<3){_req.socket.destroy();return;}res.writeHead(200,{'content-type':'application/json'});res.end('{"ok":true}');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();if(!address||typeof address==='string')throw Error('SERVER_ADDRESS_REQUIRED');
  try{const http=new AgentHttp('http://127.0.0.1:'+address.port,'token',{allowLoopbackHttp:true,paceMs:0});assert.deepEqual(await http.request('/agent','GET'),{ok:true});assert.equal(attempts,3);}
  finally{await new Promise(resolve=>server.close(()=>resolve()));}
}));
test('a new weak session namespace cannot bypass migrated v1 history',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Source(home,'commandcode',{withoutId:true});const legacy=join(dir,'legacy.db'),bundle=f.phase0Export(home);f.phase0Import(bundle,legacy);
  const service=new f.CompatibleSyncService(join(dir,'cloud.db')),owner={role:'owner',subject:'owner',reason:'synthetic migration'};
  try{service.migrateV1(legacy,owner);const before=service.beforeVisible;service.beforeVisible=(h,a)=>{before(h,a);f.guardExternalLegacy(service,undefined,h);};
    const fresh=join(dir,'fresh');f.writePhase0Source(fresh,'commandcode',{withoutId:true,session:'changed-name'});const capture=(await scan(fresh,dir)).captures[0];assert(capture);f.resolveScope(service,capture,actor);const c=buildCandidate(capture,scope(capture),undefined,randomUUID());const receipt=service.ingest(c.header,c.records,actor);
    assert.equal(receipt.status,'review-required');assert.equal(receipt.code,'V1_ADOPTION_REVIEW_REQUIRED');assert.equal(f.readSyncView(service).events.length,1);
  }finally{service.close();}
}));
test('raw/index dual representation keeps native priority; SQLite deletion keeps its previous generation',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Home(home,2);f.writePhase0Index(home,'claudeCode',{count:2});const first=await scan(home,dir);assert.equal(first.captures.length,7);assert.equal(first.captures.find(c=>c.source==='claudeCode').reader,'claudeCode');
  const service=new f.CompatibleSyncService(join(dir,'cloud.db'));try{const capture=first.captures.find(c=>c.source==='opencode');f.resolveScope(service,capture,actor);const parent=buildCandidate(capture,scope(capture),undefined,randomUUID());service.ingest(parent.header,parent.records,actor);
    f.writePhase0Source(home,'opencode',{count:1});const changed=(await scan(home,dir,[parent])).captures.find(c=>c.source==='opencode');const proposal=buildCandidate(changed,scope(changed),parent,randomUUID());assert.equal(service.ingest(proposal.header,proposal.records,actor).status,'review-required');assert.equal(f.readSyncView(service).events.length,2);
  }finally{service.close();}
}));
test('remote Job retains its cursor across transient upload failure and reports only after durable ACK',()=>sandbox(async dir=>{
  const home=join(dir,'home');f.writePhase0Source(home,'claudeCode');const capture=(await scan(home,dir)).captures[0],candidate=buildCandidate(capture,scope(capture),undefined,randomUUID()),state=new AgentState(join(dir,'state')),service=new f.CompatibleSyncService(join(dir,'cloud.db'));
  try{state.enqueue(candidate,'synthetic');const id=randomUUID();state.db.prepare("INSERT INTO remote_jobs(id,expires_at,state) VALUES(?,?,'pending')").run(id,Date.now()+180000);let reports=0,payload;
    const http={request:async(path,_method,body)=>{if(path.endsWith('/complete')){reports++;payload=body;return {job:{status:'completed',dataRevision:1}};}return {job:{status:'running'}};}};
    const remote=new RemoteLink(state,{version:1,endpoint:'https://synthetic.invalid',deviceId,home,allowedSources:sources},http,'unused',()=>{});
    await remote.execute(async()=>{});assert.equal(reports,0);assert.equal(state.db.prepare('SELECT result_json FROM remote_jobs').get().result_json,null);assert.equal(state.status().lastRemoteJob,undefined);
    f.resolveScope(service,capture,actor);const receipt=service.ingest(candidate.header,candidate.records,actor);state.acknowledge(candidate.header.batchId,receipt);state.set('lastCollectedAt',new Date().toISOString());state.db.exec('UPDATE remote_jobs SET next_retry=0');await remote.execute(async()=>{});
    assert.equal(reports,1);assert.deepEqual(payload.batches,[candidate.header.batchId]);assert.equal(payload.lineageHash.length,64);assert.equal(state.status().lastRemoteJob.status,'completed');
  }finally{state.close();service.close();}
}));
