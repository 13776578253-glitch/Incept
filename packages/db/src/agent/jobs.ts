import {createHash,randomUUID} from 'node:crypto';
import {prisma} from '../client';
import type {AgentIdentity} from './index';
import type {Prisma,SyncJob} from '../../generated/client/index.js';
export const activeJobStates=['queued','dispatched','running'];
export const isSyncJobId=(value:unknown):value is string=>typeof value==='string'&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
export const policyHash=(sources:string[])=>createHash('sha256').update(JSON.stringify([...sources].sort())).digest('hex');
export class JobError extends Error{constructor(readonly code:string,readonly status=409){super(code);}}
const ensure=(test:unknown,code:string,status=409)=>{if(!test)throw new JobError(code,status);};
export const publicJob=(job:SyncJob)=>({...job,startRevision:job.startRevision===null?null:Number(job.startRevision),dataRevision:job.dataRevision===null?null:Number(job.dataRevision)});
export async function requireSyncOwner(sessionId:string,tx:Prisma.TransactionClient=prisma){const s=await tx.accessSession.findUnique({where:{id:sessionId},include:{ownerAccount:true}});ensure(s?.role==='owner'&&!s.revokedAt&&s.expiresAt&&s.expiresAt>new Date()&&s.ownerAccount?.totpCiphertext&&s.credentialVersion===s.ownerAccount.credentialVersion,'FORBIDDEN',403);return s!.ownerAccountId!;}
export async function expireJobs(deviceId?:string){await prisma.syncJob.updateMany({where:{...(deviceId?{deviceId}:{}),status:{in:activeJobStates},expiresAt:{lte:new Date()}},data:{status:'expired',activeKey:null,finishedAt:new Date(),errorCode:'JOB_EXPIRED'}});}
export async function createSyncJob(sessionId:string,deviceId:string,idempotencyKey:string,online:boolean){
  ensure(isSyncJobId(deviceId)&&isSyncJobId(idempotencyKey),'INVALID_JOB_REQUEST',400);
  return prisma.$transaction(async tx=>{
    const owner=await requireSyncOwner(sessionId,tx);await tx.$queryRaw`SELECT id FROM agent_devices WHERE id=${deviceId} FOR UPDATE`;
    const device=await tx.agentDevice.findFirst({where:{id:deviceId,ownerAccountId:owner,revokedAt:null}});ensure(device,'DEVICE_NOT_FOUND',404);
    const previous=await tx.syncJob.findUnique({where:{ownerAccountId_idempotencyKey:{ownerAccountId:owner,idempotencyKey}}});if(previous){ensure(previous.deviceId===deviceId,'IDEMPOTENCY_CONFLICT');return publicJob(previous);}
    await tx.syncJob.updateMany({where:{deviceId,status:{in:activeJobStates},expiresAt:{lte:new Date()}},data:{status:'expired',activeKey:null,finishedAt:new Date(),errorCode:'JOB_EXPIRED'}});
    const pending=await tx.syncJob.findUnique({where:{activeKey:deviceId}});if(pending)return publicJob(pending);
    const recent=await tx.syncJob.count({where:{deviceId,createdAt:{gt:new Date(Date.now()-60000)}}});ensure(recent<12,'JOB_RATE_LIMIT',429);
    const job=await tx.syncJob.create({data:{id:randomUUID(),ownerAccountId:owner,deviceId,idempotencyKey,status:online?'queued':'offline',activeKey:online?deviceId:null,credentialVersion:device!.credentialVersion,policyHash:policyHash(device!.allowedSources),expiresAt:new Date(Date.now()+180000),...(online?{}:{finishedAt:new Date(),errorCode:'DEVICE_OFFLINE'})}});
    await tx.securityAudit.create({data:{actorId:owner,sessionId,action:'sync.job.create',targetId:job.id,result:job.status}});return publicJob(job);
  });
}
export async function getSyncJob(id:string,owner:string){await expireJobs();const job=await prisma.syncJob.findFirst({where:{id,ownerAccountId:owner}});ensure(job,'JOB_NOT_FOUND',404);return publicJob(job!);}
export async function deviceJob(id:string,identity:AgentIdentity,tx:Prisma.TransactionClient=prisma){
  const job=await tx.syncJob.findFirst({where:{id,deviceId:identity.deviceId,ownerAccountId:identity.ownerAccountId}});ensure(job,'JOB_NOT_FOUND',404);
  ensure(job!.credentialVersion===identity.version&&job!.policyHash===policyHash(identity.allowedSources),'JOB_AUTH_CHANGED',403);return job!;
}
export async function beginSyncJob(id:string,identity:AgentIdentity,revision:number){await expireJobs(identity.deviceId);return prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM sync_jobs WHERE id=${id}::uuid FOR UPDATE`;const job=await deviceJob(id,identity,tx);ensure(activeJobStates.includes(job.status)&&job.expiresAt>new Date(),'JOB_TERMINAL');if(job.status==='running')return publicJob(job);return publicJob(await tx.syncJob.update({where:{id},data:{status:'running',startedAt:new Date(),startRevision:BigInt(revision)}}));});}
export type JobCompletion={scanId:string;collectedAt:string;issues:number;pending:number;review:number;batches:string[];lineageHash:string;
  reviewTotal?:number;reviewNew?:number;held?:number;warnings?:number;blockingIssues?:number;newTokens?:number};
export type NormalizedJobStatus={status:'completed'|'completed_no_change'|'partial'|'review_required';reviewTotal:number;reviewNew:number;held:number;warnings:number;blockingIssues:number;newTokens:number};
export function jobStatus(completion:JobCompletion,verified:{changed:boolean;lineageHash:string},priorReviewTotal=0):NormalizedJobStatus{
  const reviewTotal=completion.reviewTotal??completion.review;
  const reviewNew=Math.min(reviewTotal,completion.reviewNew??Math.max(0,reviewTotal-priorReviewTotal));
  const held=completion.held??0,warnings=completion.warnings??0,newTokens=completion.newTokens??0;
  // Old Agents only sent total collector issues. Preserve their safety semantics
  // by treating those as blocking; new Agents send the split explicitly.
  const blockingIssues=completion.blockingIssues??completion.issues;
  const status=completion.lineageHash!==verified.lineageHash||reviewNew>0||held>0?'review_required':blockingIssues>0||completion.pending>0?'partial':verified.changed?'completed':'completed_no_change';
  return {status,reviewTotal,reviewNew,held,warnings,blockingIssues,newTokens};
}
export async function finishSyncJob(id:string,identity:AgentIdentity,completion:JobCompletion,verified:{dataRevision:number;changed:boolean;lineageHash:string},completionHash:string){
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM sync_jobs WHERE id=${id}::uuid FOR UPDATE`;const job=await deviceJob(id,identity,tx),device=await tx.agentDevice.findUnique({where:{id:identity.deviceId}});
    ensure(device&&!device.revokedAt&&device.credentialVersion===identity.version&&policyHash(device.allowedSources)===job.policyHash,'JOB_AUTH_CHANGED',403);
    if(job.completionHash){ensure(job.completionHash===completionHash,'COMPLETION_REPLAY_CONFLICT');return publicJob(job);}
    ensure(job.status==='running'&&job.expiresAt>new Date(),'JOB_TERMINAL');
    ensure(Date.parse(completion.collectedAt)>=job.startedAt!.getTime()-1000&&Date.parse(completion.collectedAt)<=Date.now()+30000,'INVALID_SCAN_TIME',400);
    const prior=await tx.syncJob.findFirst({where:{deviceId:identity.deviceId,ownerAccountId:identity.ownerAccountId,finishedAt:{lt:job.startedAt!},status:{notIn:activeJobStates}},orderBy:{finishedAt:'desc'},select:{result:true}});
    const priorResult=prior?.result as Partial<JobCompletion>|null|undefined;
    const normalized=jobStatus(completion,verified,Number(priorResult?.reviewTotal??priorResult?.review??0));
    const result={...completion,...normalized};
    const status=normalized.status;
    const updated=await tx.syncJob.update({where:{id},data:{status,activeKey:null,finishedAt:new Date(),dataRevision:BigInt(verified.dataRevision),completionHash,result:result as unknown as Prisma.InputJsonValue,errorCode:status==='partial'?'SOURCE_OR_UPLOAD_INCOMPLETE':status==='review_required'?'REVIEW_REQUIRED':null}});
    await tx.securityAudit.create({data:{actorId:identity.deviceId,action:'sync.job.complete',targetId:id,result:status}});return publicJob(updated);
  });
}
