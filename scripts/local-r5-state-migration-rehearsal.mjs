// Offline, copy-only rehearsal. Never imports collectors, transport or Docker helpers.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,lstatSync,realpathSync,readFileSync,writeFileSync,copyFileSync,constants} from 'node:fs';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {isDeepStrictEqual} from 'node:util';
import {createConnection} from 'node:net';
import {backupSqlite} from './production-sync-backup.mjs';

const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const json = (file,value) => writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
const inside = (parent,child) => {const p=relative(resolve(parent),resolve(child));return p===''||(!p.startsWith('..')&&!isAbsolute(p));};
function safePath(path){
  assert(isAbsolute(path),'ABSOLUTE_PATH_REQUIRED');
  for(let part=resolve(path);;part=dirname(part)){
    if(existsSync(part))assert(!lstatSync(part).isSymbolicLink(),'SYMLINK_PATH_REJECTED');
    if(dirname(part)===part)break;
  }
}
function fingerprint(directory){
  return Object.fromEntries(['state.db','state.db-wal','state.db-shm','config.json','credential.dpapi','agent.log'].map(name=>{
    const file=join(directory,name);return [name,existsSync(file)?digest(file):null];
  }));
}
const readDb = (file,fn) => {const db=new DatabaseSync(file,{readOnly:true});try{db.exec('BEGIN');return fn(db);}finally{db.close();}};
const parse = text => JSON.parse(String(text));
function compareLegacy(oldFile,v4File){
  return readDb(oldFile,old=>readDb(v4File,v4=>{
    const scopes=old.prepare('SELECT * FROM lineage ORDER BY scope').all().map(row=>{
      const oldParent=parse(row.parent_json),other=v4.prepare('SELECT * FROM lineage WHERE scope=?').get(row.scope);
      const oldManifest=oldParent.header.manifest,newManifest=other?parse(other.parent_json).header.manifest:null;
      const sameScope=!!newManifest&&isDeepStrictEqual(oldManifest.scope,newManifest.scope);
      return {scope:String(row.scope),sessionId:oldManifest.scope.sessionId,source:oldManifest.scope.source,
        old:{manifest:oldManifest.manifestHash,generation:oldManifest.generationId,receipt:parse(row.receipt_json),proofs:oldParent.proofs},
        v4:other?{manifest:newManifest.manifestHash,generation:newManifest.generationId,receipt:parse(other.receipt_json),proofs:parse(other.parent_json).proofs}:null,
        disposition:!other?'missing_from_v4':!sameScope?'scope_identity_conflict':oldManifest.manifestHash===newManifest.manifestHash&&oldManifest.generationId===newManifest.generationId?'same_head':
          oldManifest.generationId===newManifest.generationId?'same_generation_changed_head_requires_evidence':'different_generation_requires_evidence',
        forwardMovementProven:false};
    });
    const reviews=old.prepare("SELECT * FROM outbox WHERE state='review' ORDER BY serial").all().map(row=>({
      outbox:row,records:old.prepare('SELECT * FROM records WHERE batch=? ORDER BY position').all(row.batch),
      disposition:'pending_owner_review',coverageProven:false,
    }));
    const collisions=[];
    for(const row of old.prepare('SELECT batch,json FROM receipts').iterate()){
      const other=v4.prepare('SELECT json FROM receipts WHERE batch=?').get(row.batch);
      if(other&&!isDeepStrictEqual(parse(row.json),parse(other.json)))collisions.push({batch:String(row.batch),code:'RECEIPT_PAYLOAD_CONFLICT'});
    }
    return {scopes,reviews,collisions,legacyReceiptCount:Number(old.prepare('SELECT COUNT(*) n FROM receipts').get().n)};
  }));
}

// Dependency hooks keep synthetic tests independent of Windows DPAPI and private files.
export async function rehearseStateMigration({formalDirectory,v4Directory,acceptanceDirectory,targetDirectory,summaryFile,
  expectedLegacyScopes,expectedReviews,hooks={}}){
  const sources=[formalDirectory,v4Directory,acceptanceDirectory].map(path=>resolve(path)),target=resolve(targetDirectory);
  for(const source of sources){safePath(source);assert(existsSync(source),'SOURCE_DIRECTORY_REQUIRED');}
  safePath(target);assert(!existsSync(target),'TARGET_EXISTS');
  assert(sources.slice(0,2).every(source=>!inside(source,target)&&!inside(target,source))&&!inside(target,sources[2]),'TARGET_SOURCE_OVERLAP');
  if(summaryFile){safePath(summaryFile);assert(!existsSync(summaryFile),'SUMMARY_EXISTS');assert(sources.every(source=>!inside(source,summaryFile)),'SUMMARY_SOURCE_OVERLAP');}
  assert(new Set(sources.map(source=>realpathSync(source).toLowerCase())).size===3,'DISTINCT_SOURCES_REQUIRED');
  const config=parse(readFileSync(join(acceptanceDirectory,'config.json'),'utf8'));
  assert.equal(config.endpoint,'http://127.0.0.1:3305','LOOPBACK_ENDPOINT_REQUIRED');
  assert.equal(config.remote,false,'REMOTE_MUST_BE_DISABLED');assert.equal(config.allowLoopbackHttp,true);
  const formalConfig=parse(readFileSync(join(formalDirectory,'config.json'),'utf8'));
  const v4Config=parse(readFileSync(join(v4Directory,'config.json'),'utf8'));
  assert.equal(formalConfig.deviceId,v4Config.deviceId,'DEVICE_ID_MISMATCH');assert.equal(config.deviceId,v4Config.deviceId,'DEVICE_ID_MISMATCH');
  const before=sources.slice(0,2).map(fingerprint);
  const library=Object.keys(hooks).length?hooks:await import('../apps/sync-agent/dist/library.mjs');
  mkdirSync(target,{recursive:false,mode:0o700});await library.protectDirectory(target);
  const archive=join(target,'archive');mkdirSync(archive,{mode:0o700});
  const snapshots=[];
  for(const [index,name]of ['formal','v4'].entries()){
    const directory=join(archive,name);mkdirSync(directory,{mode:0o700});
    const database=await backupSqlite(join(sources[index],'state.db'),join(directory,'state.db'));
    const files={};
    for(const name of ['config.json','credential.dpapi','agent.log']){
      const input=join(sources[index],name);if(!existsSync(input))continue;
      copyFileSync(input,join(directory,name),constants.COPYFILE_EXCL);files[name]=digest(join(directory,name));
    }
    snapshots.push({name,database,files});
  }
  const comparison=compareLegacy(join(archive,'formal','state.db'),join(archive,'v4','state.db'));
  if(expectedLegacyScopes!==undefined)assert.equal(comparison.scopes.length,expectedLegacyScopes,'LEGACY_SCOPE_COUNT_CHANGED');
  if(expectedReviews!==undefined)assert.equal(comparison.reviews.length,expectedReviews,'LEGACY_REVIEW_COUNT_CHANGED');
  json(join(archive,'legacy-head-decisions.json'),comparison.scopes);
  json(join(archive,'legacy-review-decisions.json'),comparison.reviews);
  json(join(archive,'receipt-collisions.json'),comparison.collisions);
  const unresolvedHeads=comparison.scopes.filter(row=>row.disposition!=='same_head').length;
  const summary={status:comparison.collisions.length?'blocked':comparison.reviews.length||unresolvedHeads?'prepared_pending_review':'prepared',
    readyForProduction:false,legacyScopes:comparison.scopes.length,legacyReceipts:comparison.legacyReceiptCount,
    archivedReviews:comparison.reviews.length,archivedReviewRecords:comparison.reviews.reduce((n,row)=>n+row.records.length,0),
    pendingOwnerReviews:comparison.reviews.length,unresolvedHeads,receiptConflicts:comparison.collisions.length,
    headDispositions:Object.fromEntries([...new Set(comparison.scopes.map(row=>row.disposition))].map(key=>[key,comparison.scopes.filter(row=>row.disposition===key).length])),
    historical359Revalidation:false,productionModified:false,formalAgentStarted:false,
    sourceFilesUnchanged:false,completedAt:new Date().toISOString()};
  // A conflicting receipt blocks preparation; archives remain for investigation.
  if(!comparison.collisions.length){
    const candidate=join(target,'candidate');mkdirSync(candidate,{mode:0o700});await library.protectDirectory(candidate);
    copyFileSync(join(archive,'v4','state.db'),join(candidate,'state.db'),constants.COPYFILE_EXCL);
    const state=library.initializeState?await library.initializeState(candidate):new library.AgentState(candidate);
    try{
      assert.equal(Number(state.db.prepare('SELECT COUNT(*) n FROM outbox').get().n),0,'V4_OUTBOX_NOT_EMPTY');
      state.db.exec('DELETE FROM commands; DELETE FROM remote_jobs;');
      state.set('heartbeat',null);state.set('remoteOnline',false);state.set('migrationRehearsal',{readyForProduction:false,archivedReviews:comparison.reviews.length});
    }finally{state.close();}
    const home=join(target,'empty-home');mkdirSync(home,{mode:0o700});
    const policyFile=join(acceptanceDirectory,'auto-review-source-policy.json');
    const policy=existsSync(policyFile)?parse(readFileSync(policyFile,'utf8')):null;
    const autoReviewSessions=policy?.autoReviewSessions;
    if(autoReviewSessions!==undefined)assert(Array.isArray(autoReviewSessions)&&autoReviewSessions.every(id=>typeof id==='string'&&id.length>0&&id.length<=512),'INVALID_SOURCE_ROLE_POLICY');
    json(join(candidate,'config.json'),{...config,home,remote:false,allowLoopbackHttp:true,allowIncomplete:false,
      ...(autoReviewSessions?{autoReviewSessions}:{})});
    const token=readFileSync(join(acceptanceDirectory,'token.txt'),'utf8').trim();
    await library.storeToken(candidate,token);
  }
  assert.deepEqual(sources.slice(0,2).map(fingerprint),before,'SOURCE_FILES_CHANGED');summary.sourceFilesUnchanged=true;
  json(join(target,'migration-manifest.json'),{version:1,startedFrom:'old-formal-and-accepted-v4-private-copies',snapshots,sourceFingerprints:before,
    activeStateBasis:'v4-copy; old receipts and reviews retained exclusively in archive; no receipt fabricated',summary});
  json(join(target,'migration-result.json'),summary);
  if(summaryFile)json(summaryFile,summary);
  return {summary,targetDirectory:target};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const base='C:/Users/86139/AppData/Local/Incept';
  const acceptanceDirectory=join(base,'v4-acceptance-20261019');
  const targetDirectory=join(acceptanceDirectory,'state-migration-'+randomUUID());
  // Target is a new sibling of acceptance secrets, never an existing Agent directory.
  const run=async()=>{
    for(const stateName of ['sync-agent','sync-agent-v4-prodcheck']){
      const normalized=resolve(join(base,stateName)).toLowerCase();
      const pipe='\\\\.\\pipe\\incept-sync-agent-'+createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
      const running=await new Promise(yes=>{const socket=createConnection(pipe);const timer=setTimeout(()=>{socket.destroy();yes(false);},500);
        socket.once('connect',()=>{clearTimeout(timer);socket.destroy();yes(true);});socket.once('error',()=>{clearTimeout(timer);socket.destroy();yes(false);});});
      assert.equal(running,false,'SOURCE_AGENT_MUST_REMAIN_STOPPED');
    }
    return rehearseStateMigration({formalDirectory:join(base,'sync-agent'),v4Directory:join(base,'sync-agent-v4-prodcheck'),
      acceptanceDirectory,targetDirectory,expectedLegacyScopes:39,expectedReviews:2,
      summaryFile:resolve('output','state-migration-'+Date.now()+'.json')});
  };
  run().then(({summary})=>{console.log(JSON.stringify(summary));if(summary.status==='blocked')process.exitCode=2;})
    .catch(error=>{console.error(JSON.stringify({status:'blocked',code:error.code??(error.name==='AssertionError'?String(error.message).split('\n')[0]:'STATE_MIGRATION_FAILED')}));process.exitCode=1;});
}
