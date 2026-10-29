import {authenticateAgent,requireCanaryDevice,policyHash,requireSyncOwner,createSyncJob,getSyncJob,deviceJob,beginSyncJob,finishSyncJob,expireJobs,activeJobStates,isSyncJobId,JobError,type JobCompletion} from '@incept/db/agent';
import {prisma} from '@incept/db';
import type {SyncExecutor} from '@incept/dashboard/sync';
import {hash} from '../../../../../packages/dashboard/src/adapters/local/imports/identity';
import {rpcCall,RpcError,RpcVerifier} from '../../../../../packages/dashboard/src/sync/rpc';
import {boundedJson,exactFields,response,DeviceRequestLimiter} from './http';
type Owner=(r:Request,mutating:boolean)=>Promise<{sessionId:string;ownerId:string}>;
type Job=Awaited<ReturnType<typeof createSyncJob>>;
type DeviceActivity='idle'|'collecting'|'uploading';
type GatewayTelemetry={online:Record<string,boolean>;reported:Record<string,{lastCollectedAt?:string;lastReportAt?:string;activity?:DeviceActivity}>};
type RemotePhase='requesting'|'collecting'|'uploading'|'committed'|'no_change'|'partial'|'review'|'failed'|'offline'|'expired'|'cancelled';
export class RemoteSync {
  readonly limiter=new DeviceRequestLimiter(120);
  readonly verifier:RpcVerifier;
  constructor(readonly options:{executor:SyncExecutor;owner:Owner;gatewayBase:string;secret:string;readMode:()=>string;pollMs?:number}){this.verifier=new RpcVerifier(options.secret);}
  private gateway<T>(op:string,value:unknown){return rpcCall<T>(this.options.gatewayBase,'/rpc/'+op,this.options.secret,value);}
  async invalidate(device:string){await this.gateway('kick',{devices:[device]}).catch(()=>{});}
  private async telemetry(ids:string[]):Promise<GatewayTelemetry>{try{return await this.gateway<GatewayTelemetry>('status',{devices:ids});}catch{return {online:Object.fromEntries(ids.map(id=>[id,false])),reported:{}};}}
  async online(ids:string[]){return (await this.telemetry(ids)).online;}
  private phase(job:Pick<Job,'status'>,online:boolean,activity:DeviceActivity='idle'):RemotePhase {
    const terminal:Partial<Record<string,RemotePhase>>={completed:'committed',completed_no_change:'no_change',partial:'partial',review_required:'review',failed:'failed',offline:'offline',expired:'expired',cancelled:'cancelled'};
    if(terminal[job.status])return terminal[job.status]!;
    if(!online)return 'offline';
    if(job.status==='running')return activity==='uploading'?'uploading':'collecting';
    return 'requesting';
  }
  private async decorate(job:Job){const snapshot=await this.telemetry([job.deviceId]),online=!!snapshot.online[job.deviceId],activity=snapshot.reported[job.deviceId]?.activity??'idle';
    return {...job,online,activity,phase:this.phase(job,online,activity)};}
  async dispatch(job:Job){
    if(!activeJobStates.includes(job.status))return job;
    try{const result=await this.gateway<{online:Record<string,boolean>}>('dispatch',{devices:[job.deviceId],job:{id:job.id,expiresAt:job.expiresAt}});
      if(!result.online[job.deviceId])throw Error('OFFLINE');await prisma.syncJob.updateMany({where:{id:job.id,status:'queued'},data:{status:'dispatched',dispatchedAt:new Date()}});
    }catch{await prisma.syncJob.updateMany({where:{id:job.id,status:{in:['queued','dispatched']}},data:{status:'offline',activeKey:null,finishedAt:new Date(),errorCode:'DEVICE_OFFLINE'}});}
    return getSyncJob(job.id,job.ownerAccountId);
  }
  async internal(request:Request){try{
    const value=await boundedJson(request,8192);this.verifier.verify(request,JSON.stringify(value));const path=new URL(request.url).pathname.split('/').at(-1);
    if(path==='auth'){exactFields(value,['token']);const identity=await authenticateAgent('Bearer '+value.token);await expireJobs(identity.deviceId);
      const pending=await prisma.syncJob.findUnique({where:{activeKey:identity.deviceId}});return response({...identity,policyHash:policyHash(identity.allowedSources),job:pending&&pending.credentialVersion===identity.version&&pending.policyHash===policyHash(identity.allowedSources)?{id:pending.id,expiresAt:pending.expiresAt}:undefined});}
    if(path==='check'){exactFields(value,['deviceId','version','policyHash']);requireCanaryDevice(String(value.deviceId));const row=await prisma.agentDevice.findUnique({where:{id:String(value.deviceId)}});if(!row||row.revokedAt||row.credentialVersion!==value.version||policyHash(row.allowedSources)!==value.policyHash)throw new JobError('UNAUTHENTICATED',401);return response({valid:true});}
    return response({error:'NOT_FOUND'},404);
  }catch(error){return response({error:error instanceof RpcError||error instanceof JobError?error.code:'RPC_FORBIDDEN'},error instanceof RpcError||error instanceof JobError?error.status:403);}}
  async handle(request:Request):Promise<Response|undefined>{
    const url=new URL(request.url),path=url.pathname.replace('/api/dashboard/sync/','').split('/');
    const ownerRoute=path[0]==='jobs'||path.join('/')==='devices/status'||path.join('/')==='reviews';const agentRoute=path[0]==='agent'&&path[1]==='jobs';if(!ownerRoute&&!agentRoute)return;
    try{if(url.search)throw new JobError('QUERY_NOT_ALLOWED',400);if(ownerRoute&&path[0]==='jobs'&&path.length>1&&!isSyncJobId(path[1])||agentRoute&&path.length>2&&!isSyncJobId(path[2]))throw new JobError('INVALID_JOB_ID',400);
      if(ownerRoute){if(request.headers.has('authorization'))throw new JobError('FORBIDDEN',403);const owner=await this.options.owner(request,request.method!=='GET');const ownerId=await requireSyncOwner(owner.sessionId);await expireJobs();
        if(path.join('/')==='reviews'&&request.method==='GET')return response(await this.options.executor.execute({op:'reviews',actor:{role:'owner',subject:ownerId,reason:'Read-only historical review status'}}));
        if(path.join('/')==='devices/status'&&request.method==='GET'){
          const devices=await prisma.agentDevice.findMany({where:{ownerAccountId:ownerId},select:{id:true,name:true,revokedAt:true,lastUsedAt:true},take:100,orderBy:{createdAt:'asc'}}),snapshot=await this.telemetry(devices.filter(d=>!d.revokedAt).map(d=>d.id));
          const commits=this.options.executor.readDeviceSummary(devices.map(d=>d.id));
          return response({remoteEnabled:true,readMode:this.options.readMode(),intervalMs:this.options.pollMs??300000,devices:await Promise.all(devices.map(async d=>{
            const latest=await prisma.syncJob.findFirst({where:{deviceId:d.id,ownerAccountId:ownerId},orderBy:{createdAt:'desc'}}),success=await prisma.syncJob.findFirst({where:{deviceId:d.id,ownerAccountId:ownerId,status:{in:['completed','completed_no_change']}},orderBy:{finishedAt:'desc'}});
            const online=!!snapshot.online[d.id],activity=snapshot.reported[d.id]?.activity??'idle';
            const result=latest?.result as {reviewTotal?:number;review?:number;reviewNew?:number;held?:number;warnings?:number;blockingIssues?:number;newTokens?:number;issues?:number}|null;
            return {...d,online,activity,lastCollectedAt:snapshot.reported[d.id]?.lastCollectedAt??(success?.result as {collectedAt?:string}|null)?.collectedAt,
              lastReportAt:snapshot.reported[d.id]?.lastReportAt??success?.finishedAt?.toISOString()??null,lastCommittedAt:commits[d.id]??null,
              lastJob:latest?{id:latest.id,status:latest.status,errorCode:latest.errorCode,dataRevision:latest.dataRevision===null?null:Number(latest.dataRevision),finishedAt:latest.finishedAt?.toISOString()??null,phase:this.phase(latest,online,activity),
                reviewTotal:Number(result?.reviewTotal??result?.review??0),reviewNew:Number(result?.reviewNew??0),held:Number(result?.held??0),warnings:Number(result?.warnings??0),
                blockingIssues:Number(result?.blockingIssues??result?.issues??0),newTokens:Number(result?.newTokens??0)}:null};
          }))});
        }
        if(path.length===1&&request.method==='POST'){const body=await boundedJson(request,4096);exactFields(body,['deviceId','idempotencyKey']);const device=await prisma.agentDevice.findFirst({where:{id:String(body.deviceId),ownerAccountId:ownerId,revokedAt:null},select:{id:true}});if(!device)throw new JobError('DEVICE_NOT_FOUND',404);
          const online=await this.online([device.id]);const job=await createSyncJob(owner.sessionId,device.id,String(body.idempotencyKey),online[device.id]);return response({job:await this.decorate(await this.dispatch(job))},202);}
        if(path.length===2&&request.method==='GET'){let job=await getSyncJob(path[1],ownerId);if(['queued','dispatched'].includes(job.status))job=await this.dispatch(job);return response({job:await this.decorate(job)});}
        throw new JobError('NOT_FOUND',404);
      }
      const identity=await authenticateAgent(request.headers.get('authorization'));this.limiter.check(identity.deviceId);await expireJobs(identity.deviceId);
      if(path.length===2&&request.method==='GET'){const job=await prisma.syncJob.findUnique({where:{activeKey:identity.deviceId}});return response({job:job&&job.credentialVersion===identity.version&&job.policyHash===policyHash(identity.allowedSources)?{id:job.id,expiresAt:job.expiresAt}:null});}
      if(path.length===3&&request.method==='GET'){const job=await deviceJob(path[2],identity);return response({job:{id:job.id,status:job.status,expiresAt:job.expiresAt}});}
      if(path.length===4&&request.method==='POST'){
        if(path[3]==='start'){const value=await boundedJson(request,4096,true);exactFields(value,[]);const checkpoint=await this.options.executor.execute<{dataRevision:number}>({op:'checkpoint',actor:{role:'device',deviceId:identity.deviceId}});return response({job:await beginSyncJob(path[2],identity,checkpoint.dataRevision)});}
        if(path[3]==='complete'){const body=await boundedJson(request,32768);exactFields(body,['scanId','collectedAt','issues','pending','review','batches','lineageHash','reviewTotal','reviewNew','held','warnings','blockingIssues','newTokens']);
          if(typeof body.scanId!=='string'||!/^[a-f\d-]{36}$/i.test(body.scanId)||typeof body.collectedAt!=='string'||!Number.isFinite(Date.parse(body.collectedAt))||['issues','pending','review'].some(k=>!Number.isSafeInteger(body[k])||Number(body[k])<0)||!Array.isArray(body.batches)||body.batches.length>256||new Set(body.batches).size!==body.batches.length||body.batches.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(id)))throw new JobError('INVALID_COMPLETION',400);
          for(const key of ['reviewTotal','reviewNew','held','warnings','blockingIssues','newTokens'])if(key in body&&(!Number.isSafeInteger(body[key])||Number(body[key])<0))throw new JobError('INVALID_COMPLETION',400);
          if(typeof body.lineageHash!=='string'||!/^[a-f\d]{64}$/.test(body.lineageHash))throw new JobError('INVALID_LINEAGE_HASH',400);
          const completion=body as JobCompletion,job=await deviceJob(path[2],identity);if(job.startRevision===null)throw new JobError('JOB_NOT_STARTED');
          const proof=await this.options.executor.execute<{dataRevision:number;changed:boolean;lineageHash:string}>({op:'verify-job',device:identity.deviceId,batches:completion.batches,since:Number(job.startRevision),actor:{role:'device',deviceId:identity.deviceId},allowedSources:identity.allowedSources});
          return response({job:await finishSyncJob(path[2],identity,completion,proof,hash(completion))});
        }
      }throw new JobError('NOT_FOUND',404);
    }catch(error){if(error instanceof JobError||error instanceof RpcError)return response({error:error.code},error.status,undefined,error.status===429?5:undefined);if(error&&typeof error==='object'&&'status'in error&&'code'in error)return response({error:String(error.code)},Number(error.status));return response({error:'REMOTE_SYNC_UNAVAILABLE'},503,undefined,2);}
  }
}
