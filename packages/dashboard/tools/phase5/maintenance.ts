import {createHash} from 'node:crypto';
import {chmodSync,existsSync,mkdirSync,readFileSync,renameSync,rmSync,statSync,createReadStream,writeFileSync} from 'node:fs';
import {basename,dirname,isAbsolute,resolve} from 'node:path';
import {DatabaseSync,backup} from 'node:sqlite';
import {CompatibleSyncService} from '../../src/adapters/local/imports/sync/legacy';
import {syncScopeId} from '../../src/adapters/local/imports/sync/contract';
import {checkpointWal,capacityState} from '../../src/sync/capacity';
import {DEFAULT_CAPACITY} from '../../src/sync/protocol';
import {projection} from '../../src/sync/projection';
import {loadTokenDashboardData} from '../../src/adapters/local/loader';
import {hash} from '../../src/adapters/local/imports/identity';
import {listReviewSummaries} from '../../src/adapters/local/imports/sync/reviews';
import type {SyncActor} from '../../src/domain/sync';
import type {TokenDashboardData,UsageRange} from '../../src/domain';

const OWNER_CONFIRMATION='I_AM_THE_OWNER';
type Options=Record<string,string|boolean>;
class MaintenanceError extends Error{constructor(readonly code:string){super(code);}}

function parse(argv:string[]):{command:string;options:Options} {
  const [command,...rest]=argv;
  if(!command)throw new MaintenanceError('COMMAND_REQUIRED');
  const options:Options={};
  for(const item of rest){
    if(!item.startsWith('--'))throw new MaintenanceError('INVALID_ARGUMENT');
    const raw=item.slice(2),at=raw.indexOf('=');if(at<0){options[raw]=true;continue;}
    const key=raw.slice(0,at);if(!key)throw new MaintenanceError('INVALID_ARGUMENT');options[key]=raw.slice(at+1);
  }
  return {command,options};
}

function required(options:Options,key:string) {
  const value=options[key];
  if(typeof value!=='string'||!value.trim())throw new MaintenanceError('MISSING_'+key.toUpperCase().replaceAll('-','_'));
  return value;
}

function owner(options:Options):SyncActor {
  if(options['owner-confirm']!==OWNER_CONFIRMATION)throw new MaintenanceError('OWNER_CONFIRMATION_REQUIRED');
  const reason=required(options,'reason');
  if(reason.length>2000)throw new MaintenanceError('REASON_TOO_LONG');
  return {role:'owner',subject:'owner-maintenance-cli',reason};
}

function absolute(options:Options,key:string) {
  const value=required(options,key);
  if(!isAbsolute(value))throw new MaintenanceError('ABSOLUTE_PATH_REQUIRED');
  return resolve(value);
}

function integrity(db:DatabaseSync) {
  const row=db.prepare('PRAGMA integrity_check').get() as {integrity_check?:string}|undefined;
  if(String(row?.integrity_check??'')!=='ok')throw new MaintenanceError('SQLITE_INTEGRITY_FAILED');
}

function databaseFingerprint(path:string) {
  const db=new DatabaseSync(path,{readOnly:true});
  try {
    integrity(db);
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>String(row.name));
    const counts=Object.fromEntries(tables.map(table=>[table,Number(db.prepare(`SELECT COUNT(*) n FROM "${table.replaceAll('"','""')}"`).get()!.n)]));
    return {schema:Number(db.prepare('PRAGMA user_version').get()!.user_version),tables:counts};
  } finally { db.close(); }
}

export async function backupSqlite(sourcePath:string,outputPath:string) {
  if(resolve(sourcePath)===resolve(outputPath))throw new MaintenanceError('DISTINCT_BACKUP_PATH_REQUIRED');
  if(!existsSync(sourcePath))throw new MaintenanceError('SOURCE_DATABASE_NOT_FOUND');
  if(existsSync(outputPath))throw new MaintenanceError('OUTPUT_ALREADY_EXISTS');
  mkdirSync(dirname(outputPath),{recursive:true,mode:0o700});
  const temporary=outputPath+'.partial-'+process.pid;
  rmSync(temporary,{force:true});
  const source=new DatabaseSync(sourcePath,{readOnly:true});
  try {
    integrity(source);
    await backup(source,temporary,{rate:100});
  } finally { source.close(); }
  try {
    chmodSync(temporary,0o600);
    renameSync(temporary,outputPath);
  } catch(error) {
    rmSync(temporary,{force:true});
    throw error;
  }
  const bytes=statSync(outputPath).size;
  const digest=createHash('sha256');for await(const chunk of createReadStream(outputPath))digest.update(chunk);const sha256=digest.digest('hex');
  return {ok:true,source:basename(sourcePath),backup:basename(outputPath),bytes,sha256,fingerprint:databaseFingerprint(outputPath)};
}

function comparable(data:TokenDashboardData){return {...data,updatedAt:undefined,sync:undefined,checkedAt:undefined};}

function firstDifference(left:unknown,right:unknown,path='$'):string|null {
  if(Object.is(left,right))return null;
  if(Array.isArray(left)&&Array.isArray(right)){
    if(left.length!==right.length)return path+'.length';
    for(let i=0;i<left.length;i++){const found=firstDifference(left[i],right[i],path+'['+i+']');if(found)return found;}
    return null;
  }
  if(left&&right&&typeof left==='object'&&typeof right==='object'){
    const l=left as Record<string,unknown>,r=right as Record<string,unknown>;
    const keys=[...new Set([...Object.keys(l),...Object.keys(r)])];
    for(const key of keys){const found=firstDifference(l[key],r[key],path+'.'+key);if(found)return found;}
    return null;
  }
  return path;
}

async function compare(service:CompatibleSyncService,home:string,legacyPath:string,ranges:UsageRange[]) {
  const result=[];
  for(const range of ranges){
    const baseline=await loadTokenDashboardData({home,range,force:true}),now=Date.parse(baseline.checkedAt!),actual=projection(service,home,range,0,legacyPath,now);
    const difference=firstDifference(comparable(actual),comparable(baseline));
    result.push({range,equal:difference===null,difference,tokens:{baseline:baseline.totals.totalTokens,actual:actual.totals.totalTokens},cost:{baseline:baseline.totals.cost,actual:actual.totals.cost},dateRange:{baseline:baseline.dateRange,actual:actual.dateRange}});
  }
  return result;
}
function legacyState(path:string){if(!existsSync(path))return hash([]);const db=new DatabaseSync(path,{readOnly:true});try{return hash(db.prepare('SELECT id,checksum,receipt FROM batches ORDER BY id').all().map(row=>[row.id,row.checksum,JSON.parse(String(row.receipt)).status]));}finally{db.close();}}

function ranges(option:Options):UsageRange[]{
  const selected=typeof option.range==='string'?option.range:'all-windows';
  if(selected==='all-windows')return ['7d','30d','all'];
  if(!['7d','30d','all'].includes(selected))throw new MaintenanceError('INVALID_RANGE');
  return [selected as UsageRange];
}

export async function runMaintenance(argv=process.argv.slice(2),env=process.env) {
  const {command,options}=parse(argv),syncPath=env.INCEPT_SYNC_DATABASE_FILE,legacyPath=env.INCEPT_DASHBOARD_IMPORTS_FILE,home=env.INCEPT_DASHBOARD_HOME;
  if(command==='backup'){
    return backupSqlite(absolute(options,'source'),absolute(options,'output'));
  }
  if(!syncPath||!isAbsolute(syncPath))throw new MaintenanceError('SYNC_DATABASE_NOT_CONFIGURED');
  if(!legacyPath||!isAbsolute(legacyPath))throw new MaintenanceError('V1_DATABASE_NOT_CONFIGURED');
  if(!home||!isAbsolute(home))throw new MaintenanceError('DASHBOARD_HOME_NOT_CONFIGURED');
  if(command==='status'){
    const db=new DatabaseSync(syncPath,{readOnly:true});try{return {ok:true,...capacityState(syncPath,db,DEFAULT_CAPACITY),revision:Number(db.prepare('SELECT data_revision FROM sync_meta').get()!.data_revision),receipts:Number(db.prepare('SELECT COUNT(*) n FROM sync_receipts').get()!.n),reviews:listReviewSummaries(db).length};}finally{db.close();}
  }
  if(command==='legacy-status'){
    const service=new CompatibleSyncService(syncPath);try{return {ok:true,batches:service.db.prepare('SELECT COUNT(*) n FROM sync_legacy_batches').get()!.n,members:service.db.prepare('SELECT COUNT(*) n FROM sync_legacy_members').get()!.n,quarantine:service.db.prepare('SELECT COUNT(*) n FROM sync_legacy_quarantine').get()!.n,adoptions:service.db.prepare('SELECT COUNT(*) n FROM sync_adoptions').get()!.n,revision:service.revision()};}finally{service.close();}
  }
  if(command==='migrate-v1'){
    const actor=owner(options),service=new CompatibleSyncService(syncPath),limit=Number(options['max-batches']??10);
    try{
      if(!Number.isInteger(limit)||limit<1||limit>100)throw new MaintenanceError('INVALID_MIGRATION_CHUNK');
      let total=0,processed=0;do{processed=service.migrateV1(legacyPath,actor,limit);total+=processed;}while(processed===limit);
      return {ok:true,processed:total,revision:service.revision()};
    }finally{service.close();}
  }
  if(command==='compare'){
    const service=new CompatibleSyncService(syncPath);try{
      const before=service.revision(),state=legacyState(legacyPath),comparison=await compare(service,home,legacyPath,ranges(options));
      if(before!==service.revision()||state!==legacyState(legacyPath))throw new MaintenanceError('COMPARISON_INPUT_CHANGED');
      const result={ok:comparison.every(row=>row.equal),ranges:comparison,revision:before,v1StateHash:state,generatedAt:new Date().toISOString()};
      if(options.report){const file=absolute(options,'report');writeFileSync(file,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});}
      return result;
    }finally{service.close();}
  }
  if(command==='shadow-check'){
    const actor=owner(options),service=new CompatibleSyncService(syncPath);
    try{
      const limit=Number(options['max-batches']??10);if(!Number.isInteger(limit)||limit<1||limit>100)throw new MaintenanceError('INVALID_MIGRATION_CHUNK');
      let processed=0;do{processed=service.migrateV1(legacyPath,actor,limit);}while(processed===limit);
      const comparison=await compare(service,home,legacyPath,['7d','30d','all']);
      return {ok:comparison.every(row=>row.equal),ranges:comparison,revision:service.revision()};
    }finally{service.close();}
  }
  if(command==='reviews'){
    const actor=owner(options),service=new CompatibleSyncService(syncPath);try{service.owner(actor);return {ok:true,reviews:listReviewSummaries(service.db)};}finally{service.close();}
  }
  if(command==='adopt-exact'||command==='adopt-reviewed'){
    const actor=owner(options),file=absolute(options,'candidate');
    if(statSync(file).size>64*1024*1024)throw new MaintenanceError('CANDIDATE_LIMIT');
    const candidate=JSON.parse(readFileSync(file,'utf8')) as {header:import('../../src/domain/sync').SyncHeader;records:import('../../src/domain/sync').SyncRecord[]};
    if(!Array.isArray(candidate.records)||candidate.records.length>20000||candidate.header.manifest.intent!=='observe')throw new MaintenanceError('CANDIDATE_LIMIT');
    if(candidate.header.manifest.scope.deviceId!==required(options,'device')||candidate.header.manifest.manifestHash!==required(options,'manifest'))throw new MaintenanceError('EXPLICIT_SCOPE_CONFIRMATION_REQUIRED');
    if(command==='adopt-reviewed'&&required(options,'accept-reviewed-manifest')!==candidate.header.manifest.manifestHash)throw new MaintenanceError('REVIEWED_MANIFEST_CONFIRMATION_REQUIRED');
    const batches=required(options,'legacy-batches').split(',');if(batches.length>100||batches.some(id=>!/^[a-zA-Z0-9_-]{1,128}$/.test(id)))throw new MaintenanceError('LEGACY_BATCH_LIMIT');
    const service=new CompatibleSyncService(syncPath);
    try{
      const scope=candidate.header.manifest.scope;
      const admit=()=>service.transaction(()=>{
        service.db.exec('CREATE TABLE IF NOT EXISTS sync_admissions(id TEXT PRIMARY KEY,device_id TEXT NOT NULL,source TEXT NOT NULL,session_id TEXT NOT NULL,receipt_json TEXT NOT NULL,created_at INTEGER NOT NULL)');
        const id=hash(['admission/1',scope]),admission={scope,status:'registered',admissionId:id};
        service.db.prepare('INSERT OR IGNORE INTO sync_admissions VALUES(?,?,?,?,?,?)').run(id,scope.deviceId,scope.source,scope.sessionId,JSON.stringify(admission),Date.now());
        service.audit('owner-adoption-admission',syncScopeId(scope),id,actor);
      });
      const prior=service.receipt(scope.deviceId,candidate.header.batchId);
      if(prior){const current=service.db.prepare('SELECT head_manifest,fenced FROM sync_scopes WHERE scope_id=?').get(syncScopeId(scope));
        if(prior.status!=='committed'||prior.payloadHash!==hash(candidate.header)||current?.head_manifest!==candidate.header.manifest.manifestHash||current.fenced)throw new MaintenanceError('ADOPTION_PLAN_NO_LONGER_CURRENT');
        admit();return {ok:true,receipt:prior};
      }
      const claims=service.db.prepare("SELECT scope_json FROM sync_origins WHERE json_extract(scope_json,'$.source')=? AND json_extract(scope_json,'$.sessionId')=?").all(scope.source,scope.sessionId);
      if(claims.some(row=>JSON.parse(String(row.scope_json)).deviceId!==scope.deviceId))throw new MaintenanceError('ORIGIN_OWNERSHIP_CONFLICT');
      service.register(candidate.header.manifest.scope,'Owner-approved historical origin',actor);service.begin(candidate.header,actor);
      let offset=Number(service.db.prepare('SELECT next_offset FROM sync_staging WHERE device_id=? AND batch_id=?').get(candidate.header.manifest.scope.deviceId,candidate.header.batchId)?.next_offset??0);
      while(offset<candidate.records.length){const page=candidate.records.slice(offset,offset+100);service.stage(candidate.header.manifest.scope.deviceId,candidate.header.batchId,offset,page,actor);offset+=page.length;}
      for(const batch of batches)service.adopt(candidate.header,batch,actor,command==='adopt-reviewed'?'owner-reviewed':'exact');
      const receipt=service.commit(candidate.header.manifest.scope.deviceId,candidate.header.batchId,actor);
      if(receipt.status==='committed')admit();
      return {ok:receipt.status==='committed',receipt};
    }finally{service.close();}
  }
  if(command==='review'){
    const actor=owner(options),service=new CompatibleSyncService(syncPath),id=Number(required(options,'id'));
    try{
      if(!Number.isSafeInteger(id)||id<1)throw new MaintenanceError('INVALID_REVIEW_ID');
      const page=service.reviewPage(id,0,500,actor);
      return {ok:true,id,source:page.header.manifest.scope.source,sessionSummary:hash([page.header.manifest.scope.source,page.header.manifest.scope.sessionId]).slice(0,12),code:page.code,recordCount:page.nextOffset,hasMore:page.records.length===500};
    }finally{service.close();}
  }
  if(command==='resolve-review'){
    const actor=owner(options),service=new CompatibleSyncService(syncPath),id=Number(required(options,'id')),successor=typeof options.successor==='string'?options.successor:undefined,accept=options.accept===true||options['accept-proposal']===true;
    try{
      if(accept){
        const res=service.acceptReview(id,actor);
        return {ok:true,id,disposition:'accepted-successor',committedSuccessor:res.committedSuccessor,revision:service.revision()};
      }
      service.resolveReview(id,actor,successor);
      return {ok:true,id,disposition:successor?'accepted-successor':'dismissed',committedSuccessor:successor,revision:service.revision()};
    }finally{service.close();}
  }
  if(command==='maintain'){
    const actor=owner(options),service=new CompatibleSyncService(syncPath);
    try{service.owner(actor);const checkpoint=checkpointWal(service.db);return {ok:true,checkpoint,revision:service.revision()};}finally{service.close();}
  }
  if(command==='rollback'){
    const actor=owner(options),service=new CompatibleSyncService(syncPath),generation=required(options,'generation');
    try{service.rollback(generation,actor);return {ok:true,generation,revision:service.revision()};}finally{service.close();}
  }
  throw new MaintenanceError('UNKNOWN_COMMAND');
}
