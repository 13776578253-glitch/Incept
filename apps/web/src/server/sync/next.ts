import 'server-only';
import {isAbsolute,resolve} from 'node:path';
import {SyncExecutor,SyncTransportError,DEFAULT_CAPACITY,importStorePath,readRpcSecret} from '@incept/dashboard/sync';
import {requireRecentOwnerSession,writeSecurityAudit,finishSecurityAudit} from '@incept/db/owner';
import {getCurrentViewer} from '../auth/viewer';
import {hasSameOrigin} from '../auth/request-origin';
import {createSyncHandler} from './controller';
import {response,DeviceRequestLimiter,PreAuthRequestLimiter} from './http';
import {RemoteSync} from './remote';
import {configureTrustedDashboardExecutor, trustedDashboardEnabled} from '@incept/dashboard/adapters';
const limiter=new DeviceRequestLimiter();
const preAuthLimiter=new PreAuthRequestLimiter();

declare global {var __inceptSyncExecutor: {path:string;executor:SyncExecutor}|undefined;}
declare global {var __inceptRemoteSync:RemoteSync|undefined;}
export function syncExecutor() {
  const path=process.env.INCEPT_SYNC_DATABASE_FILE;
  const legacyPath=importStorePath(process.env.INCEPT_DASHBOARD_HOME);
  const trusted=process.env.INCEPT_SYNC_TRUSTED_MODE==='1';
  if(!path||!isAbsolute(path)||(!trusted&&resolve(path)===resolve(legacyPath)))throw new SyncTransportError('SYNC_NOT_CONFIGURED');
  if(globalThis.__inceptSyncExecutor&&globalThis.__inceptSyncExecutor.path!==path)throw new SyncTransportError('SYNC_CONFIG_CHANGED');
  if(!globalThis.__inceptSyncExecutor) {
    const configured=(name:string,fallback:number)=>process.env[name]===undefined?fallback:Number(process.env[name]);
    const policy={warnBytes:configured('INCEPT_SYNC_WARN_BYTES',DEFAULT_CAPACITY.warnBytes),reviewBytes:configured('INCEPT_SYNC_REVIEW_BYTES',DEFAULT_CAPACITY.reviewBytes),
      warnFreeBytes:configured('INCEPT_SYNC_WARN_FREE_BYTES',DEFAULT_CAPACITY.warnFreeBytes),rejectFreeBytes:configured('INCEPT_SYNC_REJECT_FREE_BYTES',DEFAULT_CAPACITY.rejectFreeBytes),
      maxStoreBytes:configured('INCEPT_SYNC_MAX_STORE_BYTES',DEFAULT_CAPACITY.maxStoreBytes!),memoryPercent:configured('INCEPT_SYNC_MEMORY_PERCENT',85),maxBatchRecords:configured('INCEPT_SYNC_MAX_BATCH_RECORDS',100_000)};
    globalThis.__inceptSyncExecutor={path,executor:new SyncExecutor(path,{legacyPath:trusted?undefined:legacyPath,trusted,policy,maxQueue:configured('INCEPT_SYNC_MAX_QUEUE',16),timeoutMs:configured('INCEPT_SYNC_TIMEOUT_MS',30_000)})};
  }
  if(trustedDashboardEnabled())configureTrustedDashboardExecutor(globalThis.__inceptSyncExecutor.executor);
  return globalThis.__inceptSyncExecutor.executor;
}
export async function handleSyncRequest(request:Request) {
  if(process.env.INCEPT_SYNC_ENABLED!=='1')return response({error:'SYNC_DISABLED'},404);
  let auditId:string|undefined;
  try {
    const owner=async(req:Request,mutating:boolean)=>{
      if(mutating&&!hasSameOrigin(req))throw new SyncTransportError('FORBIDDEN',403,0);
      const viewer=await getCurrentViewer();if(viewer.role!=='owner')throw new SyncTransportError('FORBIDDEN',403,0);
      if(mutating){
        await requireRecentOwnerSession(viewer.sessionId);
        auditId=(await writeSecurityAudit('sync.owner.manage','started',undefined,viewer.sessionId)).id;
      }
      return {sessionId:viewer.sessionId,ownerId:'owner'};
    };
    const handler=createSyncHandler({enabled:()=>true,executor:syncExecutor(),limiter,preAuth:preAuthLimiter,owner,remote:remoteSync()});
    const result=await handler(request);
    if(auditId)await finishSecurityAudit(auditId,result.ok?'success':'failure').catch(()=>{});
    return result;
  }catch(error){
    if(auditId)await finishSecurityAudit(auditId,'failure').catch(()=>{});
    // Keep the client error generic, but record why so 503s are diagnosable.
    const name=error instanceof Error?error.name:'unknown';
    const message=(error instanceof Error?error.message:String(error)).slice(0,300);
    console.error(JSON.stringify({event:'sync_request_failed',name,message}));
    return response({error:'BACKEND_UNAVAILABLE'},503,undefined,2);
  }
}
export function remoteSync(){if(process.env.INCEPT_SYNC_REMOTE_ENABLED!=='1')return undefined;return globalThis.__inceptRemoteSync??=(new RemoteSync({executor:syncExecutor(),secret:readRpcSecret(),gatewayBase:process.env.INCEPT_SYNC_GATEWAY_INTERNAL_URL??'',readMode:()=>process.env.INCEPT_SYNC_READ_MODE??'v1',pollMs:Number(process.env.INCEPT_SYNC_POLL_MS??300000),owner:async(req,mutating)=>{if(mutating&&!hasSameOrigin(req))throw new SyncTransportError('FORBIDDEN',403);const viewer=await getCurrentViewer();if(viewer.role!=='owner')throw new SyncTransportError('FORBIDDEN',403);if(mutating){await requireRecentOwnerSession(viewer.sessionId);await writeSecurityAudit('sync.remote.owner.manage','started',undefined,viewer.sessionId);}return {sessionId:viewer.sessionId,ownerId:'owner'};}}));}
