import {join} from 'node:path';
import {atomicJson} from './credentials';
import type {AgentState} from './state';
export const STATUS_FILE='status.json';
export const STATUS_VERSION=1;
export const DEFAULT_INTERVAL_MS=300000;
const publications=new Map<string,{signature:string;at:number}>();
// Display changes publish immediately; unchanged liveness refreshes every five seconds.
// Explicitly selected fields keep credentials, receipts and session diagnostics private.
export function publishStatus(state:AgentState,running=true,force=false){
  try{
    const status=state.status();
    const detail=status.lastErrorDetail as {status?:number;stage?:string}|null|undefined;
    const integrity=state.get<{actionableSessions?:number;totalBlockedRecords?:number;totalBlockedTokens?:number;items?:Array<{reason?:string}>}>('lastIntegrityReport');
    const body={version:STATUS_VERSION,running,pid:process.pid,intervalMs:DEFAULT_INTERVAL_MS,
      paused:state.get<boolean>('paused')===true,activity:state.get<string>('activity')??'idle',
      outbox:status.outbox,confirmedScopes:status.confirmedScopes,lastCollectedAt:status.lastCollectedAt,
      lastReportAt:status.lastReportAt,lastSuccessfulSyncAt:status.lastSuccessfulSyncAt,
      lastErrorCode:status.lastErrorCode,lastErrorAt:status.lastErrorAt,
      lastErrorStatus:typeof detail?.status==='number'?detail.status:null,
      lastErrorStage:typeof detail?.stage==='string'?detail.stage:null,
      quarantineActive:status.quarantineActive,
      actionableIsolations:typeof integrity?.actionableSessions==='number'?integrity.actionableSessions:0,
      blockedRecords:typeof integrity?.totalBlockedRecords==='number'?integrity.totalBlockedRecords:0,
      blockedTokens:typeof integrity?.totalBlockedTokens==='number'?integrity.totalBlockedTokens:0,
      primaryIsolationReason:integrity?.items?.[0]?.reason??null,
      remoteOnline:running&&status.remoteOnline===true};
    const signature=JSON.stringify(body),now=Date.now(),previous=publications.get(state.directory);
    if(!force&&previous?.signature===signature&&now-previous.at<5000)return;
    atomicJson(join(state.directory,STATUS_FILE),{...body,at:now});
    publications.set(state.directory,{signature,at:now});
  }catch{/* A tray display failure must not interrupt synchronization. */}
}
