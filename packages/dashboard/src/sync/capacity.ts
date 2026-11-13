import { existsSync,statSync,statfsSync,readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { DEFAULT_CAPACITY,SyncTransportError,type CapacityPolicy } from './protocol';
function cgroupBytes(value: string): number | null {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  const bytes = Number(text);
  return Number.isSafeInteger(bytes) ? bytes : null;
}

export function memoryPressure(read: (path: string) => string = path => readFileSync(path, 'utf8')) {
  let currentBytes: number | null;
  let maximumBytes: number | null;
  try {
    currentBytes = cgroupBytes(read('/sys/fs/cgroup/memory.current'));
    maximumBytes = cgroupBytes(read('/sys/fs/cgroup/memory.max'));
  } catch {
    return null;
  }
  if (currentBytes === null || maximumBytes === null || maximumBytes === 0) return null;

  let inactiveFileBytes: number | null = null;
  try {
    const stat = read('/sys/fs/cgroup/memory.stat');
    const inactiveFile = /^inactive_file[ \t]+(\d+)[ \t]*\r?$/m.exec(stat);
    if (inactiveFile) inactiveFileBytes = cgroupBytes(inactiveFile[1]);
  } catch {
    // Keep using the raw charge when the cache breakdown is unavailable.
  }
  // The files are sampled separately. An inconsistent sample must not suppress pressure.
  if (inactiveFileBytes !== null && inactiveFileBytes > currentBytes) inactiveFileBytes = null;
  const workingSetBytes = inactiveFileBytes === null ? null : currentBytes - inactiveFileBytes;
  return {
    currentBytes,
    maximumBytes,
    percent: currentBytes / maximumBytes * 100,
    inactiveFileBytes,
    workingSetBytes,
    workingSetPercent: workingSetBytes === null ? null : workingSetBytes / maximumBytes * 100,
  };
}
export function capacityState(path:string,db:DatabaseSync,policy:CapacityPolicy=DEFAULT_CAPACITY,free?:number,memory=memoryPressure()) {
  const size=(suffix:string)=>existsSync(path+suffix)?statSync(path+suffix).size:0;
  const files={dbBytes:size(''),walBytes:size('-wal'),shmBytes:size('-shm')};
  const usedBytes=files.dbBytes+files.walBytes+files.shmBytes;
  const fs=free===undefined?statfsSync(dirname(path)):undefined;
  const freeBytes=free??fs!.bavail*fs!.bsize;
  const staged=db.prepare('SELECT COALESCE(SUM(byte_count),0) bytes,COUNT(*) batches FROM sync_staging').get()!;
  const pressurePercent = memory ? memory.workingSetPercent ?? memory.percent : null;
  return {...files,usedBytes,stagingLogicalBytes:Number(staged.bytes),incompleteBatches:Number(staged.batches),freeBytes,memory,
    pressure:pressurePercent!==null&&pressurePercent>=(policy.memoryPercent??85)?'defer-new-upload':'ok',
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
