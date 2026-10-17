import { existsSync,statSync,statfsSync,readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { DEFAULT_CAPACITY,SyncTransportError,type CapacityPolicy } from './protocol';
export function memoryPressure(read:(path:string)=>string=path=>readFileSync(path,'utf8')) {
  try {
    const current=Number(read('/sys/fs/cgroup/memory.current').trim()),maximum=Number(read('/sys/fs/cgroup/memory.max').trim());
    if(!Number.isSafeInteger(current)||!Number.isSafeInteger(maximum)||maximum<=0)return null;
    return {currentBytes:current,maximumBytes:maximum,percent:current/maximum*100};
  }catch{return null;}
}
export function capacityState(path:string,db:DatabaseSync,policy:CapacityPolicy=DEFAULT_CAPACITY,free?:number,memory=memoryPressure()) {
  const size=(suffix:string)=>existsSync(path+suffix)?statSync(path+suffix).size:0;
  const files={dbBytes:size(''),walBytes:size('-wal'),shmBytes:size('-shm')};
  const usedBytes=files.dbBytes+files.walBytes+files.shmBytes;
  const fs=free===undefined?statfsSync(dirname(path)):undefined;
  const freeBytes=free??fs!.bavail*fs!.bsize;
  const staged=db.prepare('SELECT COALESCE(SUM(byte_count),0) bytes,COUNT(*) batches FROM sync_staging').get()!;
  return {...files,usedBytes,stagingLogicalBytes:Number(staged.bytes),incompleteBatches:Number(staged.batches),freeBytes,memory,
    pressure:memory&&memory.percent>=(policy.memoryPercent??85)?'defer-new-upload':'ok',
    store:usedBytes>=(policy.maxStoreBytes??4*1024**3)?'defer-new-upload':'ok',
    usage:usedBytes>=policy.reviewBytes?'review-required':usedBytes>=policy.warnBytes?'warning':'ok',
    disk:freeBytes<policy.rejectFreeBytes?'reject-new-staging':freeBytes<policy.warnFreeBytes?'warning':'ok'};
}
export function guardCapacity(state:ReturnType<typeof capacityState>) {
  if(state.disk==='reject-new-staging')throw new SyncTransportError('INSUFFICIENT_STORAGE',503,60);
  if(state.pressure==='defer-new-upload')throw new SyncTransportError('MEMORY_PRESSURE',503,30);
  if(state.store==='defer-new-upload')throw new SyncTransportError('STORE_CAPACITY',503,60);
}

// Called only between synchronous Worker operations. External readers/writers
// are respected: never wait on them, never alter a logical record or revision.
export function checkpointWal(db:DatabaseSync) {
  const previous=Number(db.prepare('PRAGMA busy_timeout').get()!.timeout);
  try {
    db.exec('PRAGMA busy_timeout=0');
    const progress=db.prepare('PRAGMA wal_checkpoint(PASSIVE)').get()!;
    if(Number(progress.busy)||Number(progress.log)!==Number(progress.checkpointed))return {state:'busy',retryAfter:30};
    const truncated=db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get()!;
    return {state:Number(truncated.busy)?'busy':'checkpointed',retryAfter:Number(truncated.busy)?30:0};
  }catch{return {state:'busy',retryAfter:30};}
  finally{db.exec('PRAGMA busy_timeout='+previous);}
}
