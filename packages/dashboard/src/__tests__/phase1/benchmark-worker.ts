// Synthetic standalone worker; prints numerical metrics only.
import { mkdirSync,statSync,existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash } from '../../adapters/local/imports/identity';
import { ImportStore } from '../../adapters/local/imports/store';
import { loadImportedEvents } from '../../adapters/local/imports/layer';
import { CompatibleSyncService } from '../../adapters/local/imports/sync/legacy';
import { readSyncView,LEGACY_READ_SQL,CURRENT_READ_SQL,PROVENANCE_READ_SQL } from '../../adapters/local/imports/sync/read';
import type { TransferBundle } from '../../domain';
import type { SyncActor } from '../../domain/sync';
import { fromEvents } from './fixtures';
import { PHASE0_AT,PHASE0_DEVICE,PHASE0_MODEL,PHASE0_PRICE } from '../fixtures/sync-agent-phase0';
const [mode,directory,sizeArg,batchesArg]=process.argv.slice(2),size=Number(sizeArg),batches=Number(batchesArg||1);
mkdirSync(directory,{recursive:true});const path=join(directory,'sync.db'),legacyPath=join(directory,'legacy-copy.db');
const owner:SyncActor={role:'owner',subject:'fixture-owner',reason:'isolated benchmark'},device:SyncActor={role:'device',deviceId:PHASE0_DEVICE};
const scope={deviceId:PHASE0_DEVICE,source:'claudeCode' as const,sessionId:'benchmark-session',originId:'benchmark-origin'};
const events=()=>Array.from({length:size},(_,i)=>({eventId:hash(['benchmark',i]),source:scope.source,sessionId:scope.sessionId,timestampMs:PHASE0_AT+i,
  modelName:PHASE0_MODEL,projectKey:'benchmark-project',projectName:'Synthetic project',inputTokens:100,outputTokens:20,cacheReadTokens:10,cacheCreationTokens:0,reasoningTokens:0}));
if(mode==='prepare-legacy'){
  const records=events(),store=new ImportStore(legacyPath);try{for(let i=0;i<batches;i++){
    const body={format:'incept-token-transfer' as const,version:1 as const,exportId:randomUUID(),device:{id:PHASE0_DEVICE,label:'Synthetic device',platform:'synthetic'},exportedAt:new Date().toISOString(),events:records,prices:{[PHASE0_MODEL]:PHASE0_PRICE},warnings:[]},bundle:TransferBundle={...body,checksum:hash(body)},receipt={id:randomUUID(),deviceId:PHASE0_DEVICE,deviceLabel:'Synthetic device',exportId:body.exportId,checksum:bundle.checksum,importedAt:new Date(Date.now()+i).toISOString(),status:'active' as const,received:size,added:i?0:size,duplicateLocal:0,duplicateImported:i?size:0,addedTokens:i?0:size*130};
    store.saveBatch({bundle,receipt,mappings:{}},hash({}));}}finally{store.close();}process.stdout.write('{}');
}else{
  const candidate=mode==='write'||mode==='adopt-legacy'?fromEvents(events(),scope,undefined,'benchmark-adopt'):undefined,service=mode==='old-read'?undefined:new CompatibleSyncService(path);
  try{
    if(candidate)service!.register(scope,'Synthetic device',owner);
    const before=process.cpuUsage(),start=performance.now();let count=0,revision=0;
    if(mode==='write'){service!.ingest(candidate!.header,candidate!.records,device);count=service!.db.prepare('SELECT COUNT(*) n FROM sync_current').get()!.n as number;revision=service!.revision();}
    else if(mode==='migrate'){service!.migrateV1(legacyPath,owner);count=Number(service!.db.prepare('SELECT COUNT(*) n FROM sync_legacy_projection').get()!.n);revision=service!.revision();}
    else if(mode==='adopt-legacy') {
      service!.begin(candidate!.header,device);for(let offset=0;offset<candidate!.records.length;offset+=500)service!.stage(PHASE0_DEVICE,candidate!.header.batchId,offset,candidate!.records.slice(offset,offset+500),device);
      for(const batch of service!.db.prepare('SELECT id FROM sync_legacy_batches ORDER BY source_order').all())service!.adopt(candidate!.header,String(batch.id),owner);
      const receipt=service!.commit(PHASE0_DEVICE,candidate!.header.batchId,device);if(receipt.status!=='committed')throw new Error('adoption-failed');count=readSyncView(service!).events.length;revision=service!.revision();
    }
    else if(mode==='read'||mode==='mixed-read'){const result=readSyncView(service!);count=result.events.length;revision=result.dataRevision;}
    else if(mode==='old-read')count=loadImportedEvents([],new Map(),{},legacyPath).events.length;
    else throw new Error('unsupported-mode');
    const wallMs=performance.now()-start,cpu=process.cpuUsage(before),cpuMs=(cpu.user+cpu.system)/1000,peakRssMiB=process.resourceUsage().maxRSS/1024;
    const activePath=mode==='old-read'?legacyPath:path;
    const bytes=()=>['','-wal','-shm'].reduce((sum,suffix)=>sum+(existsSync(activePath+suffix)?statSync(activePath+suffix).size:0),0);
    const beforeCheckpointBytes=bytes();service?.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const plans=service?{legacy:service.db.prepare('EXPLAIN QUERY PLAN '+LEGACY_READ_SQL).all().map(row=>row.detail),current:service.db.prepare('EXPLAIN QUERY PLAN '+CURRENT_READ_SQL).all().map(row=>row.detail),provenance:service.db.prepare('EXPLAIN QUERY PLAN '+PROVENANCE_READ_SQL).all().map(row=>row.detail)}:undefined;
    process.stdout.write(JSON.stringify({mode,size,batches,count,revision,wallMs,cpuMs,averageCorePercent:cpuMs/wallMs*100,peakRssMiB,rssMiB:process.memoryUsage().rss/1024/1024,dbBytes:statSync(activePath).size,totalBytes:bytes(),beforeCheckpointBytes,
      observationRows:service?service.db.prepare('SELECT COUNT(*) n FROM sync_observations').get()!.n:undefined,
      provenanceRows:service?service.db.prepare('SELECT COUNT(*) n FROM sync_provenance').get()!.n:undefined,plans}));
  }finally{service?.close();}
}
