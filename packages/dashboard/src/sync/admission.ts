import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {hash} from '../adapters/local/imports/identity';
import {SyncError,requireSync,syncScopeId} from '../adapters/local/imports/sync/contract';
import type {CompatibleSyncService} from '../adapters/local/imports/sync/legacy';
import type {SyncActor,SyncScope,SyncHeader} from '../domain/sync';
import {TRANSFER_SOURCES} from '../domain';

export const originId=(source:string,sessionId:string)=>hash(['incept-origin/1',source,sessionId]);
// Source/session is a GLOBAL claim, never a device-prefixed escape from old ownership.
export function resolveScope(service:CompatibleSyncService,input:Pick<SyncScope,'source'|'sessionId'>,actor:SyncActor,legacyPath?:string,now=Date.now()) {
  requireSync(actor.role==='device','DEVICE_MISMATCH');
  requireSync(TRANSFER_SOURCES.includes(input.source)&&typeof input.sessionId==='string'&&input.sessionId.trim().length>0&&input.sessionId.length<=512&&!/[\x00-\x1f]/.test(input.sessionId),'INVALID_SCOPE');
  service.db.exec(`CREATE TABLE IF NOT EXISTS sync_admissions(id TEXT PRIMARY KEY,device_id TEXT NOT NULL,source TEXT NOT NULL,session_id TEXT NOT NULL,receipt_json TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sync_admissions_device ON sync_admissions(device_id,created_at);
    CREATE TABLE IF NOT EXISTS sync_admission_reviews(id TEXT PRIMARY KEY,device_id TEXT NOT NULL,source TEXT NOT NULL,session_id TEXT NOT NULL,code TEXT NOT NULL,created_at INTEGER NOT NULL);`);
  return service.transaction(()=>{
    const rows=service.db.prepare("SELECT o.scope_json,s.head_manifest,s.fenced FROM sync_origins o JOIN sync_scopes s ON s.scope_id=o.scope_id WHERE json_extract(o.scope_json,'$.source')=? AND json_extract(o.scope_json,'$.sessionId')=?").all(input.source,input.sessionId);
    const matches=rows.filter(row=>JSON.parse(String(row.scope_json)).deviceId===actor.deviceId);
    // An existing claim by another device needs one explicit Owner binding. A
    // bound device keeps its own lineage and resolves normally afterwards.
    requireSync(rows.length===0||matches.length>0,'ORIGIN_OWNERSHIP_CONFLICT');
    const prior=matches[0];requireSync(!prior?.fenced,'ROLLED_BACK_LINEAGE');
    const scope:SyncScope=prior?JSON.parse(String(prior.scope_json)):{deviceId:actor.deviceId,source:input.source,sessionId:input.sessionId,originId:originId(input.source,input.sessionId)};
    const head=prior?.head_manifest?service.db.prepare('SELECT header_json FROM sync_manifests WHERE id=?').get(String(prior.head_manifest)):undefined;
    const headHeader=head?JSON.parse(String(head.header_json)):null;
    const id=hash(['admission/1',scope]),saved=service.db.prepare('SELECT receipt_json FROM sync_admissions WHERE id=?').get(id);
    if(saved)return {...JSON.parse(String(saved.receipt_json)),headManifest:prior?.head_manifest??null,head:headHeader};
    const overlap=legacyOverlap(service,legacyPath,input.source,input.sessionId);
    if(overlap.overlap&&!prior?.head_manifest){
      const inserted=service.db.prepare('INSERT OR IGNORE INTO sync_admission_reviews VALUES(?,?,?,?,?,?)').run(id,actor.deviceId,input.source,input.sessionId,'V1_ADOPTION_REVIEW_REQUIRED',now);
      if(inserted.changes)service.audit('device-scope-review',syncScopeId(scope),id,actor);
      return {scope,status:'review-required' as const,code:'V1_ADOPTION_REVIEW_REQUIRED'};
    }
    const minute=service.db.prepare('SELECT COUNT(*) n FROM sync_admissions WHERE device_id=? AND created_at>?').get(actor.deviceId,now-60_000)!;
    const day=service.db.prepare('SELECT COUNT(*) n FROM sync_admissions WHERE device_id=? AND source=? AND created_at>?').get(actor.deviceId,input.source,now-86400_000)!;
    const total=service.db.prepare('SELECT COUNT(*) n FROM sync_admissions WHERE device_id=?').get(actor.deviceId)!;
    requireSync(Number(minute.n)<20&&Number(day.n)<1000&&Number(total.n)<20000,'ADMISSION_RATE_LIMIT');
    if(!prior){service.db.prepare('INSERT INTO sync_origins VALUES(?,?,?,?)').run(scope.originId,syncScopeId(scope),JSON.stringify(scope),'Auto-enrolled session');service.db.prepare('INSERT INTO sync_scopes(scope_id) VALUES(?)').run(syncScopeId(scope));}
    const receipt={scope,status:'registered' as const,admissionId:id};
    service.db.prepare('INSERT INTO sync_admissions VALUES(?,?,?,?,?,?)').run(id,actor.deviceId,scope.source,scope.sessionId,JSON.stringify(receipt),now);
    service.audit('device-scope-admit',syncScopeId(scope),id,actor);
    return {...receipt,headManifest:prior?.head_manifest??null,head:headHeader};
  });
}
function legacyOverlap(service:CompatibleSyncService,path:string|undefined,source:string,session:string) {
  const devices=new Set<string>();
  let overlap=false,migrated=true;
  for(const row of service.db.prepare(`SELECT DISTINCT b.id,b.checksum,json_extract(b.metadata_json,'$.device.id') device_id
    FROM sync_legacy_members m JOIN sync_observations o ON o.id=m.observation_id JOIN sync_legacy_batches b ON b.id=m.batch_id
    WHERE o.source=? AND o.session_id=?`).all(source,session)) {
    overlap=true;devices.add(String(row.device_id??''));
    const current=service.db.prepare('SELECT checksum FROM sync_legacy_batches WHERE id=?').get(row.id);
    if(!current||current.checksum!==row.checksum)migrated=false;
  }
  if(path&&existsSync(path)){
    const db=new DatabaseSync(path,{readOnly:true});
    try {
      for(const row of db.prepare(`SELECT DISTINCT b.id,b.checksum,json_extract(b.payload,'$.bundle.device.id') device_id
        FROM batches b,json_each(b.payload,'$.bundle.events') e
        WHERE json_extract(e.value,'$.source')=? AND json_extract(e.value,'$.sessionId')=?`).all(source,session)) {
        overlap=true;devices.add(String(row.device_id??''));
        const current=service.db.prepare('SELECT checksum FROM sync_legacy_batches WHERE id=?').get(row.id);
        if(!current||current.checksum!==row.checksum)migrated=false;
      }
    } finally {db.close();}
  }
  return {overlap,migrated,devices:[...devices]};
}
// Also guard the real v1 store at COMMIT, including v1 imports that arrived after admission.
// No migration, loader switch, or fabricated Owner actor is performed here.
export function guardExternalLegacy(service:CompatibleSyncService,path:string|undefined,header:SyncHeader) {
  const {source,sessionId,deviceId}=header.manifest.scope;
  let weak=header.manifest.reader==='aiusage';if(source!=='codex')for(const record of service.staged(deviceId,header.batchId)){if(!record.nativeKey){weak=true;break;}}
  const prior=service.db.prepare(`SELECT DISTINCT json_extract(b.metadata_json,'$.device.id') device,o.session_id session
    FROM sync_legacy_members m JOIN sync_observations o ON o.id=m.observation_id JOIN sync_legacy_batches b ON b.id=m.batch_id
    WHERE o.source=? ${weak?'':'AND o.session_id=?'}`).all(...(weak?[source]:[source,sessionId]));
  if(prior.some(row=>row.device!==deviceId||row.session!==sessionId))throw new SyncError('V1_ADOPTION_REVIEW_REQUIRED');
  if(!path||!existsSync(path))return;
  const db=new DatabaseSync(path,{readOnly:true});
  try {
    const rows=db.prepare(`SELECT DISTINCT b.id,b.checksum,json_extract(b.payload,'$.bundle.device.id') device,json_extract(e.value,'$.sessionId') session FROM batches b,json_each(b.payload,'$.bundle.events') e WHERE json_extract(e.value,'$.source')=? ${weak?'':"AND json_extract(e.value,'$.sessionId')=?"}`).all(...(weak?[source]:[source,sessionId]));
    for(const row of rows){const migrated=service.db.prepare('SELECT checksum FROM sync_legacy_batches WHERE id=?').get(row.id as string);if(row.device!==deviceId||row.session!==sessionId||!migrated||migrated.checksum!==row.checksum)throw new SyncError('V1_ADOPTION_REVIEW_REQUIRED');}
  }finally{db.close();}
}
