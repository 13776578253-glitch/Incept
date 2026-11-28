export type RemoteActivity='idle'|'collecting'|'uploading';
export type RemotePhase='requesting'|'collecting'|'uploading'|'still_syncing'|'updating_charts'|'committed'|'no_change'|'partial'|'review'|'failed'|'offline'|'expired'|'cancelled';
export type DeviceIntegrityItem={source:string;sessionHash:string;models:string[];reason:string;affectedRecords:number;blockedRecords:number;blockedTokens:number;firstAffectedAt:string|null;lastAffectedAt:string|null;lastConfirmedRevision:number|null};
export type DeviceIntegrityReport={version:1;collectedAt:string;reportedAt:string;outcome:string;lastConfirmedRevision:number|null;totalIsolatedSessions:number;actionableSessions:number;totalBlockedRecords:number;totalBlockedTokens:number;earliestAffectedAt:string|null;items:DeviceIntegrityItem[]};
export type RemoteDevice={id:string;name:string;online:boolean;activity?:RemoteActivity;lastCollectedAt?:string;lastReportAt?:string;lastCommittedAt?:string;integrity?:DeviceIntegrityReport|null;lastJob?:{id?:string;status:string;phase?:RemotePhase;dataRevision?:number|null;reviewTotal?:number;reviewNew?:number;held?:number;warnings?:number;blockingIssues?:number;newTokens?:number}|null};
export type RemoteStatus={remoteEnabled:boolean;readMode:string;intervalMs:number;devices:RemoteDevice[]};
export type RemoteJob={id:string;status:string;phase?:RemotePhase;online?:boolean;dataRevision:number|null;errorCode:string|null};
export type PersistedRemoteJob={jobId:string;deviceId:string;startedAt:number};
export type PollRemoteJobResult={job:RemoteJob;timedOut:boolean};

export const REMOTE_ACTIVE_POLL_MS=180_000;
export const REMOTE_POLL_INTERVAL_MS=750;
const ACTIVE_JOB_STORAGE_KEY='incept.dashboard.activeRemoteJob.v1';
const terminal=new Set(['completed','completed_no_change','partial','review_required','failed','offline','expired','cancelled']);

export function isTerminalRemoteJobStatus(status?:string|null):boolean{
  return !!status&&terminal.has(status);
}

export function loadActiveRemoteJob():PersistedRemoteJob|null{
  try{
    if(typeof window==='undefined'||!window.sessionStorage)return null;
    const raw=window.sessionStorage.getItem(ACTIVE_JOB_STORAGE_KEY);
    if(!raw)return null;
    const parsed=JSON.parse(raw) as Partial<PersistedRemoteJob>;
    if(typeof parsed.jobId==='string'&&parsed.jobId.length>0&&typeof parsed.deviceId==='string'&&parsed.deviceId.length>0&&typeof parsed.startedAt==='number'&&Number.isFinite(parsed.startedAt)){
      // Discard abandoned entries older than 35 minutes (beyond server running grace).
      if(Date.now()-parsed.startedAt>35*60_000){
        window.sessionStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
        return null;
      }
      return {jobId:parsed.jobId,deviceId:parsed.deviceId,startedAt:parsed.startedAt};
    }
  }catch{/* Ignore storage restrictions in private browsing/SSR. */}
  return null;
}

export function saveActiveRemoteJob(job:PersistedRemoteJob|null){
  try{
    if(typeof window==='undefined'||!window.sessionStorage)return;
    if(!job)window.sessionStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
    else window.sessionStorage.setItem(ACTIVE_JOB_STORAGE_KEY,JSON.stringify(job));
  }catch{/* Ignore storage restrictions. */}
}

export async function remoteStatus(signal?:AbortSignal):Promise<RemoteStatus>{
  const res=await fetch('/api/dashboard/sync/devices/status',{cache:'no-store',signal});
  if(!res.ok)throw Error('REMOTE_STATUS_FAILED');
  return res.json();
}

export async function fetchRemoteJob(jobId:string,signal?:AbortSignal):Promise<RemoteJob>{
  const next=await fetch('/api/dashboard/sync/jobs/'+encodeURIComponent(jobId),{cache:'no-store',signal});
  if(!next.ok)throw Error('REMOTE_JOB_FAILED');
  const {job}=await next.json() as {job:RemoteJob};
  return job;
}

export async function startOrResumeRemoteJob(deviceId:string,existingJobId?:string|null,signal?:AbortSignal):Promise<RemoteJob>{
  if(existingJobId){
    try{
      const existing=await fetchRemoteJob(existingJobId,signal);
      if(!isTerminalRemoteJobStatus(existing.status))return existing;
    }catch(error){
      if(signal?.aborted)throw Error('ABORTED');
      // If the prior Job ID is no longer retrievable, fall through to create a fresh Job.
      if(error instanceof Error&&error.message==='ABORTED')throw error;
    }
  }
  const start=await fetch('/api/dashboard/sync/jobs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId,idempotencyKey:crypto.randomUUID()}),signal});
  if(!start.ok)throw Error('REMOTE_TRIGGER_FAILED');
  const {job}=await start.json() as {job:RemoteJob};
  return job;
}

function sleepAbortable(ms:number,signal:AbortSignal):Promise<void>{
  return new Promise<void>((yes,no)=>{
    const abort=()=>{clearTimeout(timer);no(Error('ABORTED'));};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);yes();},ms);
    if(signal.aborted)abort();
    else signal.addEventListener('abort',abort,{once:true});
  });
}

export async function pollRemoteJob(
  initialJob:RemoteJob,
  onJob:(job:RemoteJob)=>void,
  signal:AbortSignal,
  maxWaitMs=REMOTE_ACTIVE_POLL_MS,
  pollIntervalMs=REMOTE_POLL_INTERVAL_MS,
):Promise<PollRemoteJobResult>{
  let job=initialJob;
  const end=Date.now()+maxWaitMs;
  while(true){
    onJob(job);
    if(isTerminalRemoteJobStatus(job.status))return {job,timedOut:false};
    if(Date.now()>=end)return {job,timedOut:true};
    await sleepAbortable(pollIntervalMs,signal);
    job=await fetchRemoteJob(job.id,signal);
  }
}

export async function remoteRefresh(deviceId:string,onJob:(job:RemoteJob)=>void,signal:AbortSignal,existingJobId?:string|null):Promise<RemoteJob>{
  const initial=await startOrResumeRemoteJob(deviceId,existingJobId,signal);
  const {job,timedOut}=await pollRemoteJob(initial,onJob,signal);
  if(timedOut)throw Error('REMOTE_WAIT_TIMEOUT');
  return job;
}
