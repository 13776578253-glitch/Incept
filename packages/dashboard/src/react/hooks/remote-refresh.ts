export type RemoteActivity='idle'|'collecting'|'uploading';
export type RemotePhase='requesting'|'collecting'|'uploading'|'committed'|'no_change'|'partial'|'review'|'failed'|'offline'|'expired'|'cancelled';
export type RemoteDevice={id:string;name:string;online:boolean;activity?:RemoteActivity;lastCollectedAt?:string;lastReportAt?:string;lastCommittedAt?:string;lastJob?:{status:string;phase?:RemotePhase;dataRevision?:number|null;reviewTotal?:number;reviewNew?:number;held?:number;warnings?:number;blockingIssues?:number;newTokens?:number}|null};
export type RemoteStatus={remoteEnabled:boolean;readMode:string;intervalMs:number;devices:RemoteDevice[]};
export type RemoteJob={id:string;status:string;phase?:RemotePhase;online?:boolean;dataRevision:number|null;errorCode:string|null};
export async function remoteStatus(signal?:AbortSignal):Promise<RemoteStatus>{const res=await fetch('/api/dashboard/sync/devices/status',{cache:'no-store',signal});if(!res.ok)throw Error('REMOTE_STATUS_FAILED');return res.json();}
const terminal=new Set(['completed','completed_no_change','partial','review_required','failed','offline','expired','cancelled']);
export async function remoteRefresh(deviceId:string,onJob:(job:RemoteJob)=>void,signal:AbortSignal):Promise<RemoteJob>{
  const start=await fetch('/api/dashboard/sync/jobs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId,idempotencyKey:crypto.randomUUID()}),signal});if(!start.ok)throw Error('REMOTE_TRIGGER_FAILED');let {job}=await start.json() as {job:RemoteJob};const end=Date.now()+180000;
  while(true){onJob(job);if(terminal.has(job.status))return job;if(Date.now()>=end)throw Error('REMOTE_WAIT_TIMEOUT');
    await new Promise<void>((yes,no)=>{const abort=()=>{clearTimeout(timer);no(Error('ABORTED'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);yes();},750);if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});});
    const next=await fetch('/api/dashboard/sync/jobs/'+job.id,{cache:'no-store',signal});if(!next.ok)throw Error('REMOTE_JOB_FAILED');({job}=await next.json() as {job:RemoteJob});
  }
}
