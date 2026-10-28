import { parentPort,workerData } from 'node:worker_threads';
import { CompatibleSyncService } from '../adapters/local/imports/sync/legacy';
import { SyncError,requireSync } from '../adapters/local/imports/sync/contract';
import { ImportError } from '../adapters/local/imports/validation';
import { capacityState,guardCapacity,checkpointWal } from './capacity';
import { DEFAULT_CAPACITY,SyncTransportError,type SyncWork } from './protocol';
import {resolveScope,guardExternalLegacy} from './admission';
import {projection} from './projection';
import {hash} from '../adapters/local/imports/identity';
import {listReviewSummaries} from '../adapters/local/imports/sync/reviews';
import {readSyncDatabaseVersion,syncDatabaseFileIdentity} from './database-version';
import {usageRanges,type TokenDashboardData} from '../domain';

if(!parentPort)throw new Error('WORKER_REQUIRED');
const service=new CompatibleSyncService(workerData.path);
const serviceFileIdentity=syncDatabaseFileIdentity(workerData.path);
service.db.exec('PRAGMA cache_size=-8192; PRAGMA wal_autocheckpoint=512;');
const trusted=workerData.trusted===true;
const originalBefore=service.beforeVisible;
if(!trusted)service.beforeVisible=(header,actor)=>{originalBefore?.(header,actor);guardExternalLegacy(service,workerData.legacyPath,header);};
const policy=workerData.policy??DEFAULT_CAPACITY;
let lastCheckpoint=0;
function maintain(){lastCheckpoint=Date.now();return checkpointWal(service.db);}
const idleMaintenance=setInterval(()=>{if(Date.now()-lastCheckpoint>=30000)maintain();},30000);idleMaintenance.unref();
parentPort.on('message',({id,work}:{id:number;work:SyncWork})=>{
  const started=performance.now(),cpu=process.cpuUsage();
  try {
    let result:unknown;
    if(work.actor.role==='device'&&work.allowedSources&&'batch' in work){
      const staged=service.db.prepare('SELECT header_json FROM sync_staging WHERE device_id=? AND batch_id=?').get(work.actor.deviceId,work.batch);
      const receipt=service.receipt(work.actor.deviceId,work.batch);
      const prior=staged??(receipt?(service.db.prepare('SELECT header_json FROM sync_manifests WHERE id=?').get(receipt.manifestHash)??service.db.prepare('SELECT header_json FROM sync_reviews WHERE manifest_id=?').get(receipt.manifestHash)):undefined);
      if(prior&&!work.allowedSources.includes(JSON.parse(String(prior.header_json)).manifest.scope.source))throw new SyncTransportError('FORBIDDEN',403,0);
    }
    switch(work.op) {
      case 'checkpoint':result={dataRevision:service.revision()};break;
      case 'device-summary':service.owner(work.actor);requireSync(work.devices.length<=100,'DEVICE_LIMIT');result=Object.fromEntries(work.devices.map(device=>{const row=service.db.prepare('SELECT MAX(committed_at) at FROM sync_receipt_clock WHERE device_id=?').get(device);return [device,row?.at?new Date(Number(row.at)).toISOString():null];}));break;
      case 'verify-job': {
        requireSync(work.actor.role==='device'&&work.device===work.actor.deviceId,'DEVICE_MISMATCH');let changed=false,revision=service.revision();
        for(const batch of work.batches){const receipt=service.receipt(work.device,batch);requireSync(receipt?.status==='committed','UNCONFIRMED_JOB_RECEIPT');
          const h=service.db.prepare('SELECT header_json FROM sync_manifests WHERE id=?').get(receipt.manifestHash);requireSync(h,'UNCONFIRMED_JOB_RECEIPT');
          if(work.allowedSources)requireSync(work.allowedSources.includes(JSON.parse(String(h.header_json)).manifest.scope.source),'DEVICE_MISMATCH');
          changed ||= receipt.dataRevision>work.since&&receipt.outcome!=='unchanged';revision=Math.max(revision,receipt.dataRevision);}
        const heads=service.db.prepare("SELECT s.scope_id,s.head_manifest,s.visible_generation,s.fenced FROM sync_scopes s JOIN sync_origins o ON o.scope_id=s.scope_id WHERE json_extract(o.scope_json,'$.deviceId')=? AND s.head_manifest IS NOT NULL ORDER BY s.scope_id").all(work.device).map(r=>[r.scope_id,r.head_manifest,r.visible_generation,r.fenced]);
        result={dataRevision:revision,changed,lineageHash:hash(heads)};break;
      }
      case 'projection':service.owner(work.actor);result=projection(service,work.home,work.range,work.minimumRevision,trusted?undefined:workerData.legacyPath);break;
      case 'projection-snapshots': {
        service.owner(work.actor);requireSync(trusted,'TRUSTED_PROJECTION_REQUIRED');
        const before=readSyncDatabaseVersion(workerData.path);
        requireSync(serviceFileIdentity===syncDatabaseFileIdentity(workerData.path)&&before.identity===work.identity&&before.revision===work.revision&&service.revision()===work.revision,'SNAPSHOT_VERSION_CHANGED');
        const snapshots:Partial<Record<typeof usageRanges[number],TokenDashboardData>>={};
        for(const range of usageRanges) {
          const data=projection(service,work.home,range,work.revision,undefined,work.now);
          requireSync(data.sync.dataRevision===work.revision,'SNAPSHOT_VERSION_CHANGED');snapshots[range]=data;
        }
        const after=readSyncDatabaseVersion(workerData.path);
        requireSync(after.identity===before.identity&&after.revision===before.revision,'SNAPSHOT_VERSION_CHANGED');
        result=snapshots;break;
      }
      case 'resolve':result=resolveScope(service,{source:work.source,sessionId:work.sessionId},work.actor,trusted?undefined:workerData.legacyPath);break;
      case 'begin': {
        requireSync(work.actor.role==='device'&&work.header.manifest.scope.deviceId===work.actor.deviceId,'DEVICE_MISMATCH');
        // A device may reclaim only its own expired staging. Committed receipts
        // and unresolved review evidence are retained independently.
        const device=work.actor.deviceId;
        service.transaction(()=>{for(const row of service.db.prepare('SELECT batch_id FROM sync_staging WHERE device_id=? AND expires_at<=?').all(device,Date.now()))service.clearStage(device,String(row.batch_id));});
        const existing=service.db.prepare('SELECT 1 FROM sync_staging WHERE device_id=? AND batch_id=?').get(work.actor.deviceId,work.header.batchId);
        if(!existing&&!service.receipt(work.actor.deviceId,work.header.batchId)) {
          if(work.header.manifest.recordCount>(policy.maxBatchRecords??20000))throw new SyncTransportError('LARGE_BATCH_DEFERRED',429,300);
          guardCapacity(capacityState(service.path,service.db,policy));
          const active=service.db.prepare('SELECT COUNT(*) n FROM sync_staging WHERE device_id=? AND expires_at>?').get(work.actor.deviceId,Date.now())!;
          if(Number(active.n)>=4)throw new SyncTransportError('DEVICE_BATCH_LIMIT',429,60);
        }
        result=service.begin(work.header,work.actor);break;
      }
      case 'stage':guardCapacity(capacityState(service.path,service.db,policy));result={nextOffset:service.stage(work.device,work.batch,work.offset,work.records,work.actor)};break;
      case 'commit':result={receipt:service.commit(work.device,work.batch,work.actor)};if(Date.now()-lastCheckpoint>=30000)maintain();break;
      case 'status': {
        requireSync(work.actor.role==='device'&&work.actor.deviceId===work.device,'DEVICE_MISMATCH');
        const receipt=service.receipt(work.device,work.batch);
        if(receipt){const review=service.db.prepare("SELECT r.id,x.resolution_json FROM sync_reviews r LEFT JOIN sync_review_resolutions x ON x.review_id=r.id WHERE json_extract(r.header_json,'$.batchId')=? LIMIT 1").get(work.batch);
          result={state:receipt.status,receipt,dataRevision:service.revision(),review:review?{id:Number(review.id),resolution:review.resolution_json?JSON.parse(String(review.resolution_json)):null}:null};break;}
        const row=service.db.prepare('SELECT next_offset,expires_at FROM sync_staging WHERE device_id=? AND batch_id=?').get(work.device,work.batch);
        if(!row)throw new SyncTransportError('BATCH_NOT_FOUND',404,0);
        result={state:Number(row.expires_at)<=Date.now()?'expired':'staging',nextOffset:Number(row.next_offset),expiresAt:Number(row.expires_at),dataRevision:service.revision()};break;
      }
      case 'register':service.register(work.scope,work.label,work.actor);result={registered:true};break;
      case 'capacity':service.owner(work.actor);result={...capacityState(service.path,service.db,policy),dataRevision:service.revision(),busyRetries:service.busyRetryCount,
        recent:service.db.prepare('SELECT device_id,COUNT(*) receipts FROM sync_receipts GROUP BY device_id LIMIT 1000').all()};break;
      case 'cleanup':service.owner(work.actor);result={removed:service.cleanup()};break;
      case 'maintain':service.owner(work.actor);result={...maintain(),dataRevision:service.revision()};break;
      case 'reviews':service.owner(work.actor);result={reviews:listReviewSummaries(service.db)};break;
      case 'migrate':service.owner(work.actor);requireSync(Number.isInteger(work.maxBatches)&&work.maxBatches>0&&work.maxBatches<=10,'INVALID_MIGRATION_CHUNK');result={processed:service.migrateV1(work.sourcePath,work.actor,work.maxBatches),dataRevision:service.revision()};break;
      case 'adopt':service.owner(work.actor);result=service.adopt(work.header,work.batch,work.actor);break;
      default:throw new SyncTransportError('UNKNOWN_OPERATION',400,0);
    }
    const used=process.cpuUsage(cpu);
    parentPort!.postMessage({id,result,metrics:{wallMs:performance.now()-started,cpuMs:(used.user+used.system)/1000,rssBytes:process.memoryUsage().rss,heapBytes:process.memoryUsage().heapUsed,busyRetries:service.busyRetryCount}});
  } catch(error) {
    const code=error instanceof ImportError?'INVALID_TRANSFER':error instanceof SyncError||error instanceof SyncTransportError?error.code:'BACKEND_UNAVAILABLE';
    parentPort!.postMessage({id,error:{code,status:error instanceof ImportError?400:error instanceof SyncTransportError?error.status:undefined,retryAfter:error instanceof SyncTransportError?error.retryAfter:undefined}});
  }
});
