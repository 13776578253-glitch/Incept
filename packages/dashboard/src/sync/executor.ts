import { Worker } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { existsSync,statSync } from 'node:fs';
import { dirname,isAbsolute,join,resolve } from 'node:path';
import { DEFAULT_CAPACITY,SyncTransportError,type CapacityPolicy,type SyncWork } from './protocol';
import {syncDatabaseFileIdentity} from './database-version';

export type SyncJobTiming = {
  op: SyncWork['op'];
  queueLengthAtEnqueue: number;
  runningOpAtEnqueue: SyncWork['op'] | null;
  queueWaitMs: number;
  verifyMs: number;
  execMs: number;
  workerWallMs: number | null;
  totalMs: number;
  cancelled: boolean;
  errorCode: string | null;
};
type OpMetric = { count: number; lastQueueWaitMs: number; maxQueueWaitMs: number; lastExecMs: number; maxExecMs: number };
type TimedBatchOp = 'begin' | 'stage' | 'commit';
type Job={id:number;work:SyncWork;device:string;resolve:(v:unknown)=>void;reject:(e:unknown)=>void;verify:()=>Promise<void>;signal?:AbortSignal;abort:()=>void;timer?:ReturnType<typeof setTimeout>;active:boolean;enqueuedAt:number;dequeuedAt?:number;startedAt?:number;queueLengthAtEnqueue:number;runningOpAtEnqueue:SyncWork['op']|null;onTiming?:(timing:SyncJobTiming)=>void};
export type ExecutorOptions={workerFile?:string;legacyPath?:string;trusted?:boolean;maxQueue?:number;perDevice?:number;timeoutMs?:number;policy?:CapacityPolicy};
export function findSyncWorker() {
  if(process.env.INCEPT_SYNC_WORKER_FILE&&isAbsolute(process.env.INCEPT_SYNC_WORKER_FILE))return process.env.INCEPT_SYNC_WORKER_FILE;
  let current=process.cwd();
  while(true){for(const file of [join(current,'packages/dashboard/dist/dashboard-sync-worker.mjs'),join(current,'node_modules/@incept/dashboard/dist/dashboard-sync-worker.mjs')])if(existsSync(file))return file;
    if(dirname(current)===current)throw new SyncTransportError('WORKER_UNAVAILABLE');current=dirname(current);}
}
function emptyOpMetric(): OpMetric { return { count: 0, lastQueueWaitMs: 0, maxQueueWaitMs: 0, lastExecMs: 0, maxExecMs: 0 }; }
export class SyncExecutor {
  private worker?:Worker;private queue:Job[]=[];private running?:Job;private serial=0;private closed=false;
  private workerIdentity?:string;
  private projectionWorker?:Worker;private projectionQueue:Job[]=[];private projectionRunning?:Job;
  private projectionWorkerIdentity?:string;
  private readonly commitListeners=new Set<()=>void>();
  readonly metrics={completed:0,failed:0,lastFailure:null as string|null,lastWallMs:0,lastWriteWallMs:0,lastCommitWallMs:0,lastProjectionWallMs:0,
    lastQueueWaitMs:0,peakQueueWaitMs:0,queueWaitTotalMs:0,queueWaitSamples:0,lastExecutionWallMs:0,processRssBytes:0,workerHeapBytes:0,busyRetries:0,
    opTiming:{begin:emptyOpMetric(),stage:emptyOpMetric(),commit:emptyOpMetric()} as Record<TimedBatchOp,OpMetric>};
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
  state(){const size=(suffix:string)=>{try{return existsSync(this.path+suffix)?statSync(this.path+suffix).size:0;}catch{return 0;}};
    return {queueLength:this.queue.length,running:!!this.running,runningOp:this.running?.work.op??null,projectionQueueLength:this.projectionQueue.length,projectionRunning:!!this.projectionRunning,...this.metrics,mainRssBytes:process.memoryUsage().rss,dbBytes:size(''),walBytes:size('-wal'),shmBytes:size('-shm')};}
  readDeviceSummary(devices:string[]){
    if(!Array.isArray(devices)||devices.length>100||devices.some(device=>typeof device!=='string'))throw new SyncTransportError('INVALID_DEVICE_SUMMARY');
    const db=new DatabaseSync(this.path,{readOnly:true});
    try{db.exec('PRAGMA busy_timeout=5000; PRAGMA query_only=ON;');const statement=db.prepare('SELECT MAX(committed_at) at FROM sync_receipt_clock WHERE device_id=?');
      return Object.fromEntries(devices.map(device=>{const row=statement.get(device) as {at?:number}|undefined;return [device,row?.at?new Date(Number(row.at)).toISOString():null];}));}
    finally{db.close();}
  }
  onCommitted(listener:()=>void){this.commitListeners.add(listener);return ()=>this.commitListeners.delete(listener);}
  private usesReadOnlyProjectionLane(work:SyncWork){
    return work.op==='projection-snapshots'&&this.options.trusted&&existsSync(this.path);
  }
  execute<T=unknown>(work:SyncWork,verify:()=>Promise<void>=async()=>{},signal?:AbortSignal,onTiming?:(timing:SyncJobTiming)=>void):Promise<T> {
    const readOnlyLane=this.usesReadOnlyProjectionLane(work);
    const activeQueue=readOnlyLane?this.projectionQueue:this.queue;
    const activeRunning=readOnlyLane?this.projectionRunning:this.running;
    const reportImmediate=(code:string,cancelled=false)=>{
      onTiming?.({op:work.op,queueLengthAtEnqueue:activeQueue.length,runningOpAtEnqueue:activeRunning?.work.op??null,queueWaitMs:0,verifyMs:0,execMs:0,workerWallMs:null,totalMs:0,cancelled,errorCode:code});
    };
    if(this.closed){reportImmediate('EXECUTOR_CLOSED');return Promise.reject(new SyncTransportError('EXECUTOR_CLOSED'));}
    if(signal?.aborted){reportImmediate('REQUEST_CANCELLED',true);return Promise.reject(new SyncTransportError('REQUEST_CANCELLED',503));}
    const device=work.actor.role==='device'?work.actor.deviceId:'owner';
    if(readOnlyLane) {
      if(this.projectionQueue.length+(this.projectionRunning?1:0)>=4){reportImmediate('QUEUE_FULL');return Promise.reject(new SyncTransportError('QUEUE_FULL',429,2));}
    } else if(this.queue.length+(this.running?1:0)>=this.options.maxQueue||this.queue.filter(j=>j.device===device).length+(this.running?.device===device?1:0)>=this.options.perDevice) {
      reportImmediate('QUEUE_FULL');
      return Promise.reject(new SyncTransportError('QUEUE_FULL',429,2));
    }
    const queueLengthAtEnqueue=activeQueue.length,runningOpAtEnqueue=activeRunning?.work.op??null;
    return new Promise<T>((resolveJob,reject)=>{
      const job:Job={id:++this.serial,work,device,verify,signal,active:false,enqueuedAt:Date.now(),queueLengthAtEnqueue,runningOpAtEnqueue,onTiming,resolve:v=>resolveJob(v as T),reject,abort:()=>{void this.cancel(job,'REQUEST_CANCELLED');}};
      job.timer=setTimeout(()=>{void this.cancel(job,job.active?'RESULT_UNKNOWN':'QUEUE_TIMEOUT');},this.options.timeoutMs);
      signal?.addEventListener('abort',job.abort,{once:true});
      activeQueue.push(job);
      if(readOnlyLane)void this.pumpProjection();else void this.pump();
    });
  }
  private finish(job:Job,error?:unknown,value?:unknown,workerWallMs?:number,cancelled=false) {
    clearTimeout(job.timer);job.signal?.removeEventListener('abort',job.abort);
    const now=Date.now();
    const queueWait=Math.max(0,(job.dequeuedAt??now)-job.enqueuedAt);
    const verifyMs=job.dequeuedAt!==undefined?Math.max(0,(job.startedAt??now)-job.dequeuedAt):0;
    const execMs=job.startedAt!==undefined?Math.max(0,now-job.startedAt):0;
    const totalMs=Math.max(0,now-job.enqueuedAt);
    if(job.startedAt!==undefined){
      const waitBeforeExec=Math.max(0,job.startedAt-job.enqueuedAt);
      this.metrics.lastQueueWaitMs=waitBeforeExec;this.metrics.peakQueueWaitMs=Math.max(this.metrics.peakQueueWaitMs,waitBeforeExec);
      this.metrics.queueWaitTotalMs+=waitBeforeExec;this.metrics.queueWaitSamples++;
      this.metrics.lastExecutionWallMs=execMs;
    }
    if(job.work.op==='begin'||job.work.op==='stage'||job.work.op==='commit'){
      const bucket=this.metrics.opTiming[job.work.op];
      bucket.count++;bucket.lastQueueWaitMs=queueWait;bucket.maxQueueWaitMs=Math.max(bucket.maxQueueWaitMs,queueWait);
      bucket.lastExecMs=execMs;bucket.maxExecMs=Math.max(bucket.maxExecMs,execMs);
    }
    const errorCode=error?(error instanceof SyncTransportError?error.code:'BACKEND_UNAVAILABLE'):null;
    job.onTiming?.({op:job.work.op,queueLengthAtEnqueue:job.queueLengthAtEnqueue,runningOpAtEnqueue:job.runningOpAtEnqueue,queueWaitMs:queueWait,verifyMs,execMs,workerWallMs:workerWallMs!==undefined?Math.round(workerWallMs):null,totalMs,cancelled,errorCode});
    if(error){this.metrics.failed++;this.metrics.lastFailure=errorCode;job.reject(error);}else{this.metrics.completed++;job.resolve(value);}
  }
  private async cancel(job:Job,code:string) {
    if(this.running===job) {
      const worker=this.worker;this.worker=undefined;
      // Do not start the next writer until termination has released the DB.
      await worker?.terminate();
      if(this.running===job){this.running=undefined;this.finish(job,new SyncTransportError(code,code==='QUEUE_TIMEOUT'?429:503),undefined,undefined,true);void this.pump();}
    }else if(this.projectionRunning===job) {
      const worker=this.projectionWorker;this.projectionWorker=undefined;
      await worker?.terminate();
      if(this.projectionRunning===job){this.projectionRunning=undefined;this.finish(job,new SyncTransportError(code,code==='QUEUE_TIMEOUT'?429:503),undefined,undefined,true);void this.pumpProjection();}
    }else {
      const index=this.queue.indexOf(job);
      if(index>=0){this.queue.splice(index,1);this.finish(job,new SyncTransportError(code,code==='QUEUE_TIMEOUT'?429:503),undefined,undefined,true);return;}
      const pIndex=this.projectionQueue.indexOf(job);
      if(pIndex>=0){this.projectionQueue.splice(pIndex,1);this.finish(job,new SyncTransportError(code,code==='QUEUE_TIMEOUT'?429:503),undefined,undefined,true);}
    }
  }
  private async pumpProjection() {
    if(this.projectionRunning||this.closed)return;const job=this.projectionQueue.shift();if(!job)return;this.projectionRunning=job;job.dequeuedAt=Date.now();
    try {
      await job.verify();if(this.projectionRunning!==job)return;job.startedAt=Date.now();job.active=true;
      if(this.projectionWorker&&existsSync(this.path)) {
        const identity=syncDatabaseFileIdentity(this.path);
        if(this.projectionWorkerIdentity&&this.projectionWorkerIdentity!==identity){const previous=this.projectionWorker;this.projectionWorker=undefined;await previous.terminate();}
        this.projectionWorkerIdentity=identity;
      }
      if(!this.projectionWorker) {
        const instance=Reflect.construct(Worker,[resolve(this.options.workerFile),{workerData:{path:this.path,policy:this.options.policy,trusted:this.options.trusted,readOnly:true},resourceLimits:{maxOldGenerationSizeMb:256}}]) as Worker;
        this.projectionWorker=instance;
        instance.on('message',message=>{
          const current=this.projectionRunning;if(this.projectionWorker!==instance||!current||current.id!==message.id)return;this.projectionRunning=undefined;
          if(message.metrics){this.metrics.lastWallMs=message.metrics.wallMs;this.metrics.lastProjectionWallMs=message.metrics.wallMs;this.metrics.processRssBytes=message.metrics.rssBytes;this.metrics.workerHeapBytes=message.metrics.heapBytes;}
          if(existsSync(this.path)&&!this.projectionWorkerIdentity)this.projectionWorkerIdentity=syncDatabaseFileIdentity(this.path);
          this.finish(current,message.error?new SyncTransportError(message.error.code,message.error.status??statusForCode(message.error.code),message.error.retryAfter??2):undefined,message.result,message.metrics?.wallMs);
          void this.pumpProjection();
        });
        const stopped=()=>{if(this.projectionWorker===instance){this.projectionWorker=undefined;const current=this.projectionRunning;this.projectionRunning=undefined;if(current)this.finish(current,new SyncTransportError('RESULT_UNKNOWN'));void this.pumpProjection();}};
        instance.on('error',()=>{void instance.terminate();});instance.on('exit',stopped);
      }
      this.projectionWorker.postMessage({id:job.id,work:job.work});
    }catch(error){if(this.projectionRunning===job){this.projectionRunning=undefined;this.finish(job,error);void this.pumpProjection();}}
  }
  private async pump() {
    if(this.running||this.closed)return;const job=this.queue.shift();if(!job)return;this.running=job;job.dequeuedAt=Date.now();
    try {
      await job.verify();if(this.running!==job)return;job.startedAt=Date.now();job.active=true;
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
          if(message.metrics&&current.work.op==='projection-snapshots')this.metrics.lastProjectionWallMs=message.metrics.wallMs;
          if(existsSync(this.path)&&!this.workerIdentity)this.workerIdentity=syncDatabaseFileIdentity(this.path);
          this.finish(current,message.error?new SyncTransportError(message.error.code,message.error.status??statusForCode(message.error.code),message.error.retryAfter??2):undefined,message.result,message.metrics?.wallMs);
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
  async close(){this.closed=true;for(const job of this.queue.splice(0))this.finish(job,new SyncTransportError('EXECUTOR_CLOSED'));for(const job of this.projectionQueue.splice(0))this.finish(job,new SyncTransportError('EXECUTOR_CLOSED'));const worker=this.worker;this.worker=undefined;const pWorker=this.projectionWorker;this.projectionWorker=undefined;await Promise.all([worker?.terminate(),pWorker?.terminate()]);if(this.running){this.finish(this.running,new SyncTransportError('RESULT_UNKNOWN'));this.running=undefined;}if(this.projectionRunning){this.finish(this.projectionRunning,new SyncTransportError('RESULT_UNKNOWN'));this.projectionRunning=undefined;}}
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
