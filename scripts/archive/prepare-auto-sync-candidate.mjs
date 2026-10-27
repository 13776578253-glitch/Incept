// Copy-only preparation. No collectors, transport, token decryption, or Agent startup.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,readdirSync,lstatSync,createReadStream,openSync,readSync,closeSync} from 'node:fs';
import {join,resolve,relative,isAbsolute,basename,dirname} from 'node:path';
import {createInterface} from 'node:readline';
import {zstdDecompressSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {createConnection} from 'node:net';
import {backupSqlite} from '../production-sync-backup.mjs';
import {AgentState,scopeKey,protectDirectory} from '../../apps/sync-agent/dist/library.mjs';

const root=resolve(import.meta.dirname,'..'),privateRoot='C:/Users/86139/AppData/Local/Incept/v4-acceptance-20261019';
const parse=file=>JSON.parse(readFileSync(file,'utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const stable=value=>Array.isArray(value)?'['+value.map(stable).join(',')+']':value&&typeof value==='object'?'{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}':JSON.stringify(value)??'null';
const hash=value=>sha(stable(value));
const json=(file,value)=>writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
const digest=file=>sha(readFileSync(file));
function filesUnder(directory){return readdirSync(directory,{recursive:true,withFileTypes:true}).filter(item=>item.isFile()).map(item=>join(item.parentPath,item.name)).sort();}
function fingerprint(directories){return Object.fromEntries(directories.flatMap(directory=>filesUnder(directory).map(file=>[file,digest(file)])));}
const inside=(parent,child)=>{const path=relative(resolve(parent),resolve(child));return path===''||!path.startsWith('..')&&!isAbsolute(path);};

export function classifyMissingScopes(rows,missingProofLocators,metadata){
  const byScope=new Map(rows.map(row=>[String(row.scope),row])),groups=new Map();
  for(const ref of missingProofLocators){const row=byScope.get(ref.scopeHash);assert(row,'MISSING_SCOPE_NOT_IN_CONFIRMED_LINEAGE');
    const parent=JSON.parse(row.parent_json),scope=parent.header.manifest.scope;
    assert.equal(scope.source,ref.source,'MISSING_SCOPE_SOURCE_MISMATCH');
    assert(parent.proofs.some(proof=>proof.range.locatorHash===ref.locatorHash),'MISSING_LOCATOR_NOT_IN_CONFIRMED_PROOF');
    const group=groups.get(ref.scopeHash)??{scope:String(row.scope),source:scope.source,sessionId:scope.sessionId,missingLocatorHashes:[]};
    if(!group.missingLocatorHashes.includes(ref.locatorHash))group.missingLocatorHashes.push(ref.locatorHash);groups.set(ref.scopeHash,group);
  }
  return [...groups.values()].map(group=>({...group,disposition:metadata.has(scopeKey(group.source,group.sessionId))?'isolated':'sealed',
    classification:metadata.has(scopeKey(group.source,group.sessionId))?'session-metadata-present-continuation-unverified':'session-metadata-absent-inactive-history'}));
}

export async function metadataInventory(home){
  const sessions=new Map(),locators=new Set(),counts={codexFiles:0,claudeFiles:0,antigravityFiles:0};
  function inventory(sub){const directory=join(home,sub);return existsSync(directory)?filesUnder(directory):[];}
  function remember(source,id,file){if(typeof id!=='string'||!id.trim())return false;const key=scopeKey(source,id),items=sessions.get(key)??[];items.push(file);sessions.set(key,items);return true;}
  async function header(file,source){let found=false,lineCount=0;
    const identify=line=>{let row;try{row=JSON.parse(line);}catch{return false;}
      return source==='codex'?row.type==='session_meta'&&remember(source,row.payload?.id,file):remember(source,row.sessionId,file);};
    if(file.endsWith('.zst')){for(const line of zstdDecompressSync(readFileSync(file),{maxOutputLength:32*1024**2}).toString('utf8').split('\n')){if(identify(line)){found=true;break;}if(++lineCount>256)break;}}
    else{const input=createReadStream(file),lines=createInterface({input,crlfDelay:Infinity});try{for await(const line of lines){if(identify(line)){found=true;break;}if(++lineCount>256)break;}}finally{lines.close();input.destroy();}}
    assert(found,'CURRENT_SESSION_METADATA_UNREADABLE');
  }
  for(const sub of ['.codex/sessions','.codex/archived_sessions'])for(const file of inventory(sub).filter(file=>/\.jsonl(?:\.zst)?$/.test(file))){assert(!lstatSync(file).isSymbolicLink());counts.codexFiles++;locators.add(hash(relative(home,file).replaceAll('\\','/')));await header(file,'codex');}
  for(const file of inventory('.claude/projects').filter(file=>file.endsWith('.jsonl'))){counts.claudeFiles++;locators.add(hash(relative(home,file).replaceAll('\\','/')));await header(file,'claudeCode');}
  for(const sub of ['antigravity','antigravity-cli','antigravity-ide'])for(const file of inventory('.gemini/'+sub+'/conversations').filter(file=>file.endsWith('.db'))){counts.antigravityFiles++;locators.add(hash(relative(home,file).replaceAll('\\','/')));remember('antigravity',basename(file,'.db'),file);}
  return {sessions,locators,counts};
}

export function classifyMissingLocators(rows,refs,classification,metadata){
  const byScope=new Map(rows.map(row=>[String(row.scope),JSON.parse(row.parent_json)])),byPolicy=new Map(classification.map(item=>[item.scope,item])),locators=new Map();
  for(const ref of refs){const parent=byScope.get(ref.scopeHash),policy=byPolicy.get(ref.scopeHash),proof=parent.proofs.find(item=>item.range.locatorHash===ref.locatorHash);
    let kind='sealed_historical',prefixMatched=false;
    if(policy.disposition==='isolated'){
      const candidates=metadata.get(scopeKey(policy.source,policy.sessionId))??[];
      assert(Number.isSafeInteger(proof.range.byteLength)&&proof.range.byteLength>=0&&proof.range.byteLength<=256*1024**2,'INVALID_PREFIX_LENGTH');
      prefixMatched=proof.range.kind==='jsonl'&&candidates.some(file=>{
        let bytes;if(file.endsWith('.zst')){const decompressed=zstdDecompressSync(readFileSync(file),{maxOutputLength:32*1024**2});bytes=decompressed.subarray(0,proof.range.byteLength);}
        else{const fd=openSync(file,'r');try{bytes=Buffer.alloc(proof.range.byteLength);let offset=0;while(offset<bytes.length){const size=readSync(fd,bytes,offset,bytes.length-offset,offset);if(!size)break;offset+=size;}bytes=bytes.subarray(0,offset);}finally{closeSync(fd);}}
        return bytes.length===proof.range.byteLength&&hash(bytes.toString('base64'))===proof.range.root;
      });kind=prefixMatched?'recoverable_locator':'continuation_isolated';
    }
    const item=locators.get(ref.locatorHash)??{locatorHash:ref.locatorHash,scopeClassifications:[]};
    if(!item.scopeClassifications.some(scope=>scope.scopeHash===ref.scopeHash))item.scopeClassifications.push({scopeHash:ref.scopeHash,source:ref.source,classification:kind,prefixMatched,autoResume:false});
    locators.set(ref.locatorHash,item);
  }
  return [...locators.values()].map(item=>({...item,classification:item.scopeClassifications.some(scope=>scope.classification==='continuation_isolated')?'continuation_isolated':item.scopeClassifications.some(scope=>scope.classification==='recoverable_locator')?'recoverable_locator':'sealed_historical'}));
}

export async function prepareAutoSyncCandidate(){
  assert.equal(resolve(process.env.INCEPT_V4_ACCEPTANCE_DIR??''),resolve(privateRoot),'PRIVATE_ROOT_ACK_REQUIRED');
  const accepted=parse(join(root,'output/release-clean-candidate-2026-10-20.json')),source=resolve(accepted.candidateDirectory);
  assert.equal(source,resolve(privateRoot,'release-candidate-2026-10-20'));assert.equal(accepted.status,'passed');
  const target=resolve(privateRoot,'auto-sync-candidate-2026-10-20'),formal=resolve(privateRoot,'..','sync-agent'),v4=resolve(privateRoot,'..','sync-agent-v4-prodcheck');
  assert(!existsSync(target),'CANDIDATE_EXISTS');assert(!inside(source,target)&&!inside(formal,target)&&!inside(v4,target));
  const before=fingerprint([source,formal,v4]);
  const agentStopped={};
  for(const directory of [formal,v4]){const pipe='\\\\.\\pipe\\incept-sync-agent-'+sha(JSON.stringify(resolve(directory).toLowerCase()));
    const running=await new Promise((yes,no)=>{const socket=createConnection(pipe),timer=setTimeout(()=>{socket.destroy();no(Error('AGENT_STATUS_TIMEOUT'));},1000);
      socket.once('connect',()=>{clearTimeout(timer);socket.destroy();yes(true);});socket.once('error',error=>{clearTimeout(timer);socket.destroy();if(['ENOENT','ECONNREFUSED'].includes(error.code))yes(false);else no(error);});});
    assert.equal(running,false,'SOURCE_AGENT_MUST_REMAIN_STOPPED');agentStopped[basename(directory)]=true;
  }
  for(const item of accepted.files)assert.equal(digest(join(source,item.file)),item.sha256,'FROZEN_INPUT_HASH_MISMATCH');
  const handoff=parse(join(root,'output/release-incremental-handoff-2026-10-20.json'));assert.equal(handoff.status,'passed');
  const home=parse(join(root,'output/r5-real-source-inventory.json')).sourceHome;
  const formalConfig=parse(join(formal,'config.json')),frozenConfig=parse(join(source,'agent-state/config.json'));
  assert.equal(formalConfig.deviceId,frozenConfig.deviceId);const endpoint=new URL(formalConfig.endpoint);assert.equal(endpoint.protocol,'https:');assert(!endpoint.username&&!endpoint.password&&!endpoint.search&&!endpoint.hash);
  const sourceState=new DatabaseSync(join(source,'agent-state/state.db'),{readOnly:true}),release=new DatabaseSync(join(source,'v4-release.db'),{readOnly:true});
  let rows,heads,tokens;
  try{sourceState.exec('PRAGMA query_only=ON');release.exec('PRAGMA query_only=ON');
    rows=sourceState.prepare('SELECT * FROM lineage ORDER BY scope').all();assert.equal(rows.length,362);
    assert.equal(sourceState.prepare('SELECT COUNT(*) n FROM heads').get().n,0);assert.equal(sourceState.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
    heads=rows.map(row=>{const parent=JSON.parse(row.parent_json),manifest=parent.header.manifest,scope=manifest.scope,receipt=JSON.parse(row.receipt_json);
      assert.equal(scope.deviceId,formalConfig.deviceId);assert.equal(scopeKey(scope.source,scope.sessionId),row.scope);
      const id=hash(['sync-scope/2',scope.deviceId,scope.source,scope.sessionId]);
      const server=release.prepare('SELECT s.*,o.scope_json FROM sync_scopes s JOIN sync_origins o ON o.scope_id=s.scope_id WHERE s.scope_id=?').get(id);
      const remoteReceipt=release.prepare('SELECT receipt_json FROM sync_receipts WHERE device_id=? AND batch_id=?').get(scope.deviceId,receipt.batchId);
      assert(server&&remoteReceipt,'CONFIRMED_SERVER_EVIDENCE_MISSING');assert.equal(hash(JSON.parse(server.scope_json)),hash(scope));assert.equal(server.head_manifest,manifest.manifestHash);assert.equal(server.head_generation,manifest.generationId);assert.equal(server.visible_generation,manifest.generationId);assert.equal(server.fenced,0);
      assert.equal(hash(JSON.parse(remoteReceipt.receipt_json)),hash(receipt));assert.equal(receipt.status,'committed');assert.equal(receipt.payloadHash,hash(parent.header));
      assert(Number.isSafeInteger(server.token_total)&&server.token_total>=0);
      return {scope:String(row.scope),tokens:Number(server.token_total)};
    });tokens=heads.reduce((n,row)=>n+row.tokens,0);assert.equal(tokens,4558021501);
  }finally{sourceState.close();release.close();}
  const metadata=await metadataInventory(home),refs=handoff.sourceRetention.missingProofLocators;
  assert.equal(new Set(refs.map(row=>row.locatorHash)).size,204);assert(refs.every(row=>!metadata.locators.has(row.locatorHash)),'REPORTED_MISSING_LOCATOR_REAPPEARED');
  const classification=classifyMissingScopes(rows,refs,metadata.sessions),sealed=classification.filter(row=>row.disposition==='sealed'),held=classification.filter(row=>row.disposition==='isolated');
  assert.equal(classification.length,194);assert.equal(sealed.length,187);assert.equal(held.length,7);assert(held.every(row=>row.source==='codex'));
  const locatorClassification=classifyMissingLocators(rows,refs,classification,metadata.sessions);assert.equal(locatorClassification.length,204);
  const locatorCounts=locatorClassification.reduce((counts,item)=>(counts[item.classification]++,counts),{sealed_historical:0,recoverable_locator:0,continuation_isolated:0});
  const coverage=parse(join(root,'output/state-migration-review-coverage.json'));assert(coverage.allRecordsCovered&&coverage.reviewCount===2&&coverage.recordCount===72);
  const evidenceRoot=coverage.privateEvidenceDirectory,oldReviewsFile=join(evidenceRoot,'archive/legacy-review-decisions.json'),oldReviews=parse(oldReviewsFile);
  assert.equal(oldReviews.length,2);assert.equal(oldReviews.reduce((n,row)=>n+row.records.length,0),72);
  for(const review of oldReviews){const covered=coverage.batches.find(row=>row.batchHash===hash(String(review.outbox.batch)));assert(covered?.allRecordsCovered);assert.equal(covered.recordCount,review.records.length);}
  const real=parse(join(root,'output/r5-real-usage-final.json')),realStateFile=join(real.evidenceDirectory,'state/state.db');
  const realState=new DatabaseSync(realStateFile,{readOnly:true});let isolations;
  try{isolations=realState.prepare("SELECT * FROM session_isolations WHERE active=1 AND reason IN ('OPENING_PREFIX_MISSING','OPENING_USAGE_UNCERTAIN') ORDER BY id").all();}finally{realState.close();}
  assert.equal(new Set(isolations.map(row=>row.session_id)).size,2);
  const policy=parse(join(privateRoot,'auto-review-source-policy.json')),autoReview=parse(join(root,'output/r5-auto-review-acceptance.json'));
  assert(Array.isArray(policy.autoReviewSessions)&&policy.autoReviewSessions.length===1);assert.equal(hash(policy.autoReviewSessions[0]),autoReview.sessionHash);
  const originalArchive=join(evidenceRoot,'archive'),protectedExtra=[oldReviewsFile,realStateFile,join(evidenceRoot,'review-coverage-evidence.json'),join(privateRoot,'auto-review-source-policy.json'),...filesUnder(originalArchive)],extraBefore=Object.fromEntries(protectedExtra.map(file=>[file,digest(file)]));
  mkdirSync(target,{mode:0o700});await protectDirectory(target);const archive=join(target,'archive'),candidate=join(target,'agent-state');mkdirSync(archive,{mode:0o700});mkdirSync(candidate,{mode:0o700});
  for(const input of filesUnder(originalArchive)){const output=join(archive,'original-migration-archive',relative(originalArchive,input));mkdirSync(dirname(output),{recursive:true,mode:0o700});copyFileSync(input,output);assert.equal(digest(input),digest(output));}
  copyFileSync(oldReviewsFile,join(archive,'legacy-review-decisions-original.json'));
  copyFileSync(join(evidenceRoot,'review-coverage-evidence.json'),join(archive,'review-coverage-evidence-original.json'));
  json(join(archive,'owner-review-disposition.json'),{decisionId:'user-approved-covered-historical-reviews-2026-10-20',owner:'current-human-user',disposition:'archive-covered-review-without-reupload',
    originalReviewArchiveSha256:digest(oldReviewsFile),coverageReportSha256:digest(join(root,'output/state-migration-review-coverage.json')),batches:coverage.batches.map(row=>({batchHash:row.batchHash,recordCount:row.recordCount,allRecordsCovered:row.allRecordsCovered})),oldBatchCommitted:false});
  await backupSqlite(join(source,'agent-state/state.db'),join(candidate,'state.db'));
  const state=new AgentState(candidate);let status;
  try{for(const head of heads){const existing=state.confirmedTokenTotal(head.scope);if(existing!==undefined)assert.equal(existing,head.tokens,'EXISTING_TOKEN_WATERMARK_CONFLICT');state.db.prepare('INSERT OR IGNORE INTO lineage_tokens VALUES(?,?)').run(head.scope,head.tokens);}
    assert.equal(state.db.prepare('SELECT COUNT(*) n FROM lineage_tokens').get().n,362);assert.equal(state.db.prepare('SELECT SUM(token_total) n FROM lineage_tokens').get().n,4558021501);
    for(const item of classification){const row=rows.find(row=>row.scope===item.scope),parent=JSON.parse(row.parent_json),manifest=parent.header.manifest;
      const decision={deviceId:formalConfig.deviceId,manifestHash:manifest.manifestHash,generationId:manifest.generationId,receipt:JSON.parse(row.receipt_json),reason:item.classification,
        owner:{subject:'current-human-user',decisionId:'user-approved-historical-session-policy-2026-10-20'}};
      if(item.disposition==='sealed')state.sealHistorical(item.scope,decision);else state.quarantineHistorical(item.scope,decision);
    }
    for(const row of isolations)state.db.prepare('INSERT INTO session_isolations VALUES(?,?,?,?,?,?,?,?,?)').run(row.id,row.source,row.session_id,row.reason,row.detail_json,row.first_seen,row.last_seen,row.occurrences,row.active);
    state.db.exec('DELETE FROM commands; DELETE FROM remote_jobs;');state.set('heartbeat',null);state.set('remoteOnline',false);state.set('activity','idle');
    state.set('candidatePolicy',{sealed:187,held:7,openingSessions:2,remote:false,enabled:false});status=state.status();
    assert.equal(status.confirmedScopes,362);assert.equal(status.receiptCount,362);assert.equal(status.historicalSealedScopes,187);assert.equal(status.historicalHeldScopes,7);
    assert.equal(state.db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
  }finally{state.close();}
  const config={...frozenConfig,endpoint:formalConfig.endpoint,deviceId:formalConfig.deviceId,home,allowedSources:['codex','commandcode','claudeCode','geminiCli','antigravity','opencode','zcode'],allowIncomplete:false,allowLoopbackHttp:false,remote:false,autoReviewSessions:policy.autoReviewSessions};
  json(join(candidate,'config.json'),config);copyFileSync(join(formal,'credential.dpapi'),join(candidate,'credential.dpapi'));assert.equal(digest(join(candidate,'credential.dpapi')),digest(join(formal,'credential.dpapi')));
  copyFileSync(join(privateRoot,'auto-review-source-policy.json'),join(candidate,'auto-review-source-policy.json'));
  json(join(archive,'historical-classification.json'),classification.map(item=>({...item,currentMetadataFiles:metadata.sessions.get(scopeKey(item.source,item.sessionId))??[]})));
  json(join(archive,'missing-locator-classification.json'),locatorClassification);
  const after=fingerprint([source,formal,v4]);assert.equal(hash(after),hash(before),'PROTECTED_INPUT_CHANGED');assert.equal(hash(Object.fromEntries(protectedExtra.map(file=>[file,digest(file)]))),hash(extraBefore),'PRIVATE_EVIDENCE_CHANGED');
  const artifactHashes=filesUnder(target).map(file=>({path:relative(target,file).replaceAll('\\','/'),sha256:digest(file)}));
  const report={status:'prepared-not-started',preparedAt:new Date().toISOString(),candidateDirectory:target,agentStateDirectory:candidate,
    counts:{scopes:362,receipts:362,tokens,tokenWatermarkEntries:362,tokenWatermarkSum:4558021501,missingUniqueLocators:204,affectedScopes:194,sealedScopes:187,historicalHeldScopes:7,openingIsolatedSessions:2,archivedReviews:2,archivedReviewRecords:72},
    classification:classification.map(({scope,source,disposition,classification,missingLocatorHashes})=>({scopeHash:scope,source,disposition,classification,missingLocatorCount:missingLocatorHashes.length})),locatorClassification,locatorClassificationCounts:locatorCounts,metadataScanned:metadata.counts,
    config:{formalHttps:true,sameDevice:true,originalHome:true,sevenSources:true,strict:true,remote:false,dpapiCopiedByteForByte:true,autoReviewPolicyExact:true},
    historicalUsageRecordsRead:0,newUsageCollected:0,uploads:0,agentStarted:false,formalStateModified:false,agentStoppedReadOnlyCheck:agentStopped,
    protectedInputsUnchanged:true,protectedFingerprints:Object.entries(before).map(([file,beforeSha256])=>({file,beforeSha256,afterSha256:after[file],matched:beforeSha256===after[file]})),enabled:false,releaseStatus:'NO-GO',artifacts:artifactHashes};
  json(join(target,'CANDIDATE-MANIFEST.json'),report);json(join(root,'output/auto-sync-candidate-2026-10-20.json'),report);return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{const report=await prepareAutoSyncCandidate();console.log(JSON.stringify({status:report.status,candidateDirectory:report.candidateDirectory,counts:report.counts,config:report.config,protectedInputsUnchanged:report.protectedInputsUnchanged,manifestSha256:digest(join(report.candidateDirectory,'CANDIDATE-MANIFEST.json'))}));}catch(error){console.error(JSON.stringify({error:error.message}));process.exitCode=1;}}
