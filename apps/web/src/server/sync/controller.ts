import {randomUUID} from 'node:crypto';
import {AgentAuthError,authenticateAgent,manageAgentDevices,type AgentIdentity} from '@incept/db/agent';
import {OwnerAuthError} from '@incept/db/owner';
import {SyncTransportError,isSyncTransportError,type SyncActor,type SyncScope,type SyncHeader,type SyncRecord,type SyncWork} from '@incept/dashboard/sync';
import type {SyncExecutor} from '@incept/dashboard/sync';
import {boundedJson,exactFields,safeId,response,HTTP_LIMITS,DeviceRequestLimiter} from './http';

export type OwnerContext={sessionId:string;ownerId:string};
type Dependencies={executor:SyncExecutor;owner:(request:Request,mutating:boolean)=>Promise<OwnerContext>;enabled:()=>boolean;
  remote?:{handle:(request:Request)=>Promise<Response|undefined>;invalidate?:(device:string)=>Promise<void>};
  authenticate?:typeof authenticateAgent;manage?:typeof manageAgentDevices;limiter?:DeviceRequestLimiter};
// Factory keeps tests on the same real HTTP/auth/service path. Only Owner browser
// cookie acquisition is framework-specific and injected by the Next adapter.
export function createSyncHandler(deps:Dependencies) {
  const limiter=deps.limiter??new DeviceRequestLimiter();
  return async(request:Request):Promise<Response>=>{
    const requestId=randomUUID();
    try {
      if(!deps.enabled())return response({error:'SYNC_DISABLED'},404,requestId);
      const remote=await deps.remote?.handle(request);if(remote)return remote;
      const url=new URL(request.url);if(url.search)throw new SyncTransportError('QUERY_NOT_ALLOWED',400,0);
      const path=url.pathname.replace(/^\/api\/dashboard\/sync\/?/,'').split('/').filter(Boolean);
      if(path.length===1&&path[0]==='reviews'&&request.method==='GET') {
        if(request.headers.has('authorization'))throw new SyncTransportError('FORBIDDEN',403,0);
        const owner=await deps.owner(request,false),actor:SyncActor={role:'owner',subject:owner.ownerId,reason:'Read-only historical review status'};
        return response(await deps.executor.execute({op:'reviews',actor}),200,requestId);
      }
      if(path[0]==='devices'||path[0]==='status') {
        if(request.headers.has('authorization'))throw new SyncTransportError('FORBIDDEN',403,0);
        const owner=await deps.owner(request,request.method!=='GET');
        const actor:SyncActor={role:'owner',subject:owner.ownerId,reason:'Owner device management'};
        if(path[0]==='status'&&path.length===1&&request.method==='GET')return response({capacity:await deps.executor.execute({op:'capacity',actor}),executor:deps.executor.state()},200,requestId);
        if(path[0]!=='devices')throw new SyncTransportError('NOT_FOUND',404,0);
        const manage=deps.manage??manageAgentDevices;
        if(path.length===1&&request.method==='GET')return response(await manage(owner.sessionId,'list'),200,requestId);
        if(path.length===1&&request.method==='POST') {const body=await boundedJson(request,HTTP_LIMITS.managementBytes);exactFields(body,['name','allowedSources','legacyDeviceId']);return response(await manage(owner.sessionId,'create',body),201,requestId);}
        const id=safeId(path[1]);
        if(path.length===2&&request.method==='DELETE'){if(request.body)exactFields(await boundedJson(request,4096,true),[]);const result=await manage(owner.sessionId,'revoke',{id});await deps.remote?.invalidate?.(id);return response(result,200,requestId);}
        if(path.length===2&&request.method==='PATCH'){const body=await boundedJson(request,HTTP_LIMITS.managementBytes);exactFields(body,['name','allowedSources']);if((body.name===undefined)===(body.allowedSources===undefined))throw new SyncTransportError('INVALID_DEVICE_UPDATE',400,0);const result=body.allowedSources!==undefined?await manage(owner.sessionId,'sources',{allowedSources:body.allowedSources,id}):await manage(owner.sessionId,'rename',{...body,id});if(body.allowedSources!==undefined)await deps.remote?.invalidate?.(id);return response(result,200,requestId);}
        if(path.length===3&&path[2]==='rotate'&&request.method==='POST'){if(request.body)exactFields(await boundedJson(request,4096,true),[]);const result=await manage(owner.sessionId,'rotate',{id});await deps.remote?.invalidate?.(id);return response(result,200,requestId);}
        if(path.length===3&&path[2]==='scopes'&&request.method==='POST') {
          const listing=await manage(owner.sessionId,'list');
          const device=listing.devices?.find(row=>row.id===id);
          if(!device||device.revokedAt)throw new SyncTransportError('DEVICE_NOT_FOUND',404,0);
          const body=await boundedJson(request,HTTP_LIMITS.managementBytes);exactFields(body,['source','sessionId','originId']);
          if(typeof body.source!=='string'||!device.allowedSources.includes(body.source))throw new SyncTransportError('FORBIDDEN',403,0);
          const scopeText=(value:unknown)=>{if(typeof value!=='string'||!value.trim()||value.length>512||/[\x00-\x1f]/.test(value))throw new SyncTransportError('INVALID_SCOPE',400,0);return value;};
          const scope={deviceId:id,source:body.source,sessionId:scopeText(body.sessionId),originId:scopeText(body.originId)} as SyncScope;
          return response(await deps.executor.execute({op:'register',scope,label:device.name,actor}),200,requestId);
        }
        throw new SyncTransportError('NOT_FOUND',404,0);
      }
      const authenticate=deps.authenticate??authenticateAgent;
      const authorization=request.headers.get('authorization');
      const identity=await authenticate(authorization);
      const deviceHeader=request.headers.get('x-sync-device-id');
      if(deviceHeader&&deviceHeader!==identity.deviceId)throw new SyncTransportError('FORBIDDEN',403,0);
      limiter.check(identity.deviceId);
      // Revalidation happens again when the bounded queue dispatches the work,
      // so a rotated/revoked token cannot execute a previously waiting request.
      const verify=async()=>{const current=await authenticate(authorization);if(current.deviceId!==identity.deviceId||current.version!==identity.version||JSON.stringify([...current.allowedSources].sort())!==JSON.stringify([...identity.allowedSources].sort()))throw new SyncTransportError('FORBIDDEN',403,0);};
      const actor:SyncActor={role:'device',deviceId:identity.deviceId};let work:SyncWork;
      if(path[0]==='agent'&&path.length===1&&request.method==='GET')return response({deviceId:identity.deviceId,allowedSources:identity.allowedSources,credentialVersion:identity.version},200,requestId);
      if(path.length===2&&path[0]==='scopes'&&path[1]==='resolve'&&request.method==='POST'){
        const body=await boundedJson(request,HTTP_LIMITS.managementBytes);exactFields(body,['source','sessionId']);
        if(typeof body.source!=='string'||!identity.allowedSources.includes(body.source)||typeof body.sessionId!=='string')throw new SyncTransportError('FORBIDDEN',403,0);
        const result=await deps.executor.execute({op:'resolve',source:body.source as SyncScope['source'],sessionId:body.sessionId,actor},verify,request.signal);
        return response(result,(result as {status:string}).status==='review-required'?409:200,requestId);
      }
      if(path[0]!=='batches')throw new SyncTransportError('NOT_FOUND',404,0);
      if(path.length===1&&request.method==='POST') {
        const body=await boundedJson(request,HTTP_LIMITS.headerBytes);exactFields(body,['header']);
        const header=body.header as SyncHeader;checkScope(header?.manifest?.scope,identity);
        safeId(header.batchId);
        if(header.manifest.intent!=='observe')throw new SyncTransportError('FORBIDDEN',403,0);
        work={op:'begin',header,actor};
      }else {
        const batch=safeId(path[1]);
        if(path.length===2&&request.method==='GET')work={op:'status',device:identity.deviceId,batch,actor};
        else if(path.length===3&&path[2]==='commit'&&request.method==='POST') {
          if(request.body){const body=await boundedJson(request,4096,true);exactFields(body,[]);}
          work={op:'commit',device:identity.deviceId,batch,actor};
        }else if(path.length===4&&path[2]==='pages'&&request.method==='PUT') {
          if(!/^\d{1,6}$/.test(path[3]))throw new SyncTransportError('INVALID_OFFSET',400,0);
          const body=await boundedJson(request,HTTP_LIMITS.pageBytes);exactFields(body,['records']);
          work={op:'stage',device:identity.deviceId,batch,offset:Number(path[3]),records:body.records as SyncRecord[],actor};
        }else throw new SyncTransportError('NOT_FOUND',404,0);
      }
      const result=await deps.executor.execute({...work,allowedSources:identity.allowedSources},verify,request.signal);
      const receipt=(result as {receipt?:{status:string}})?.receipt;
      return response(result,receipt?.status==='review-required'?409:200,requestId);
    }catch(error) {
      if(isSyncTransportError(error)||error instanceof AgentAuthError||error instanceof OwnerAuthError) {
        const code=error.code,status=error.status;
        return response({error:status===403?'FORBIDDEN':code},status,requestId,isSyncTransportError(error)?error.retryAfter:undefined);
      }
      // Deliberately discard third-party SQL/stack/path/token-bearing errors.
      return response({error:'BACKEND_UNAVAILABLE'},503,requestId,2);
    }
  };
}
function checkScope(scope:SyncScope|undefined,identity:AgentIdentity) {
  if(!scope||scope.deviceId!==identity.deviceId||!identity.allowedSources.includes(scope.source))throw new SyncTransportError('FORBIDDEN',403,0);
}
