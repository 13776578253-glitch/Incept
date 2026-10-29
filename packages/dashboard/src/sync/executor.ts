import { Worker } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { dirname,isAbsolute,join,resolve } from 'node:path';
import { DEFAULT_CAPACITY,SyncTransportError,type CapacityPolicy,type SyncWork } from './protocol';
import {syncDatabaseFileIdentity} from './database-version';

type Job={id:number;work:SyncWork;device:string;resolve:(v:unknown)=>void;reject:(e:unknown)=>void;verify:()=>Promise<void>;signal?:AbortSignal;abort:()=>void;timer?:ReturnType<typeof setTimeout>;active:boolean};
export type ExecutorOptions={workerFile?:string;legacyPath?:string;trusted?:boolean;maxQueue?:number;perDevice?:number;timeoutMs?:number;policy?:CapacityPolicy};
export function findSyncWorker() {
  if(process.env.INCEPT_SYNC_WORKER_FILE&&isAbsolute(process.env.INCEPT_SYNC_WORKER_FILE))return process.env.INCEPT_SYNC_WORKER_FILE;
  let current=process.cwd();
  while(true){for(const file of [join(current,'packages/dashboard/dist/dashboard-sync-worker.mjs'),join(current,'node_modules/@incept/dashboard/dist/dashboard-sync-worker.mjs')])if(existsSync(file))return file;
    if(dirname(current)===current)throw new SyncTransportError('WORKER_UNAVAILABLE');current=dirname(current);}
}
export class SyncExecutor {
  private worker?:Worker;private queue:Job[]=[];private running?:Job;private serial=0;private closed=false;
  private workerIdentity?:string;
  private readonly commitListeners=new Set<()=>void>();
  readonly metrics={completed:0,failed:0,lastFailure:null as string|null,lastWallMs:0,lastWriteWallMs:0,lastCommitWallMs:0,processRssBytes:0,workerHeapBytes:0,busyRetries:0};
  readonly options:Required<Omit<ExecutorOptions,'workerFile'|'legacyPath'|'trusted'>>&{workerFile:string;legacyPath?:string;trusted:boolean};
  constructor(readonly path:string,options:ExecutorOptions={}) {
    if(!isAbsolute(path))throw new SyncTransportError('EXPLICIT_ABSOLUTE_STORE_PATH_REQUIRED');
    this.options={workerFile:options.workerFile??findSyncWorker(),legacyPath:options.legacyPath,trusted:options.trusted===true,maxQueue:options.maxQueue??16,perDevice:options.perDevice??2,timeoutMs:options.timeoutMs??30_000,policy:options.policy??DEFAULT_CAPACITY};
    if(!Number.isInteger(this.options.maxQueue)||this.options.maxQueue<1||this.options.maxQueue>64||!Number.isInteger(this.options.perDevice)||this.options.perDevice<1||this.options.perDevice>4
      ||!Number.isInteger(this.options.timeoutMs)||this.options.timeoutMs<100||this.options.timeoutMs>120_000)throw new SyncTransportError('INVALID_EXECUTOR_CONFIG');
    for(const value of Object.values(this.options.policy))if(!Number.isSafeInteger(value)||value<0)throw new SyncTransportError('INVALID_CAPACITY_CONFIG');
    if(this.options.policy.warnBytes>this.options.policy.reviewBytes||this.options.policy.rejectFreeBytes>this.options.policy.warnFreeBytes)throw new SyncTransportError('INVALID_CAPACITY_CONFIG');
    if((this.options.policy.memoryPercent??85)<50||(this.options.policy.memoryPercent??85)>95||(this.options.policy.maxBatchRecords??100_000)<1)throw new SyncTransportError('INVALID_CAPACITY_CONFIG');
  }
  state(){return {queueLength:this.queue.length,running:!!this.running,...this.metrics};}
  readDeviceSummary(devices:string[]){
    if(!Array.isArray(devices)||devices.length>100||devices.some(device=>typeof device!=='string'))throw new SyncTransportError('INVALID_DEVICE_SUMMARY');
    const db=new DatabaseSync(this.path,{readOnly:true});
    try{db.exec('PRAGMA busy_timeout=5000; PRAGMA query_only=ON;');const statement=db.prepare('SELECT MAX(committed_at) at FROM sync_receipt_clock WHERE device_id=?');
      return Object.fromEntries(devices.map(device=>{const row=statement.get(device) as {at?:number}|undefined;return [device,row?.at?new Date(Number(row.at)).toISOString():null];}));}
    finally{db.close();}
  }
  onCommitted(listener:()=>void){this.commitListeners.add(listener);return ()=>this.commitListeners.delete(listener);}
  execute<T=unknown>(work:SyncWork,verify:()=>Promise<void>=async()=>{},signal?:AbortSignal):Promise<T> {
    if(this.closed)return Promise.reject(new SyncTransportError('EXECUTOR_CLOSED'));
    if(signal?.aborted)return Promise.reject(new SyncTransportError('REQUEST_CANCELLED',503));
    const device=work.actor.role==='device'?work.actor.deviceId:'owner';
    if(this.queue.length+(this.running?1:0)>=this.options.maxQueue||this.queue.filter(j=>j.device===device).length+(this.running?.device===device?1:0)>=this.options.perDevice)
      return Promise.reject(new SyncTransportError('QUEUE_FULL',429,2));
    return new Promise<T>((resolveJob,reject)=>{
      const job:Job={id:++this.serial,work,device,verify,signal,active:false,resolve:v=>resolveJob(v as T),reject,abort:()=>{void this.cancel(job,'REQUEST_CANCELLED');}};
      job.timer=setTimeout(()=>{void this.cancel(job,job.active?'RESULT_UNKNOWN':'QUEUE_TIMEOUT');},this.options.timeoutMs);
      signal?.addEventListener('abort',job.abort,{once:true});this.queue.push(job);void this.pump();
    });
  }
  private finish(job:Job,error?:unknown,value?:unknown) {
    clearTimeout(job.timer);job.signal?.removeEventListener('abort',job.abort);
    if(error){this.metrics.failed++;this.metrics.lastFailure=error instanceof SyncTransportError?error.code:'BACKEND_UNAVAILABLE';job.reject(error);}else{this.metrics.completed++;job.resolve(value);}
  }
  private async cancel(job:Job,code:string) {
    if(this.running===job) {
      const worker=this.worker;this.worker=undefined;
      // Do not start the next writer until termination has released the DB.
      await worker?.terminate();
      if(this.running===job){this.running=undefined;this.finish(job,new SyncTransportError(code,code==='QUEUE_TIMEOUT'?429:503));void this.pump();}
    }else {const index=this.queue.indexOf(job);if(index>=0){this.queue.splice(index,1);this.finish(job,new SyncTransportError(code,code==='QUEUE_TIMEOUT'?429:503));}}
  }
  private async pump() {
    if(this.running||this.closed)return;const job=this.queue.shift();if(!job)return;this.running=job;
    try {
      await job.verify();if(this.running!==job)return;job.active=true;
      if(this.worker&&existsSync(this.path)) {
        const identity=syncDatabaseFileIdentity(this.path);
        if(this.workerIdentity&&this.workerIdentity!==identity){const previous=this.worker;this.worker=undefined;await previous.terminate();}
        this.workerIdentity=identity;
      }
      if(!this.worker) {
        const instance=Reflect.construct(Worker,[resolve(this.options.workerFile),{workerData:{path:this.path,policy:this.options.policy,legacyPath:this.options.legacyPath,trusted:this.options.trusted},resourceLimits:{maxOldGenerationSizeMb:256}}]) as Worker;
        this.worker=instance;
        instance.on('message',message=>{
          const current=this.running;if(this.worker!==instance||!current||current.id!==message.id)return;this.running=undefined;
          if(message.metrics){this.metrics.lastWallMs=message.metrics.wallMs;this.metrics.processRssBytes=message.metrics.rssBytes;this.metrics.workerHeapBytes=message.metrics.heapBytes;this.metrics.busyRetries=message.metrics.busyRetries;}
          if(message.metrics&&!['status','capacity'].includes(current.work.op))this.metrics.lastWriteWallMs=message.metrics.wallMs;
          if(message.metrics&&current.work.op==='commit')this.metrics.lastCommitWallMs=message.metrics.wallMs;
          if(existsSync(this.path)&&!this.workerIdentity)this.workerIdentity=syncDatabaseFileIdentity(this.path);
          this.finish(current,message.error?new SyncTransportError(message.error.code,message.error.status??statusForCode(message.error.code),message.error.retryAfter??2):undefined,message.result);
          if(!message.error&&current.work.op==='commit'&&message.result?.receipt?.status==='committed') {
            // Receipt delivery never waits for aggregation or publication.
            for(const listener of this.commitListeners)queueMicrotask(()=>{try{listener();}catch{/* A display refresh cannot reject a committed receipt. */}});
          }
          void this.pump();
        });
        const stopped=()=>{if(this.worker===instance){this.worker=undefined;const current=this.running;this.running=undefined;if(current)this.finish(current,new SyncTransportError('RESULT_UNKNOWN'));void this.pump();}};
        instance.on('error',()=>{void instance.terminate();});instance.on('exit',stopped);
      }
      this.worker.postMessage({id:job.id,work:job.work});
    }catch(error){if(this.running===job){this.running=undefined;this.finish(job,error);void this.pump();}}
  }
  async close(){this.closed=true;for(const job of this.queue.splice(0))this.finish(job,new SyncTransportError('EXECUTOR_CLOSED'));const worker=this.worker;this.worker=undefined;await worker?.terminate();if(this.running){this.finish(this.running,new SyncTransportError('RESULT_UNKNOWN'));this.running=undefined;}}
}
export function statusForCode(code:string) {
  if(['DEVICE_MISMATCH','SCOPE_MISMATCH','EXPLICIT_OWNER_REQUIRED'].includes(code))return 403;
  if(code==='STAGING_NOT_FOUND')return 404;
  if(code==='ADMISSION_RATE_LIMIT')return 429;
  if(code.endsWith('_LIMIT')||code==='TOO_MANY_RECORDS')return 413;
  if(['SQLITE_BUSY_EXHAUSTED','BACKEND_UNAVAILABLE','RESULT_UNKNOWN'].includes(code))return 503;
  if(['BATCH_PAYLOAD_MISMATCH','PAGE_PAYLOAD_MISMATCH','PAGE_ORDER_MISMATCH','INCOMPLETE_STAGING','STAGING_EXPIRED','SEQUENCE_HASH_MISMATCH','ORIGIN_OWNERSHIP_CONFLICT','ROLLED_BACK_LINEAGE'].includes(code))return 409;
  return 400;
}
