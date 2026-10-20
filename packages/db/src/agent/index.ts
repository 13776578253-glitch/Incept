import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { prisma } from '../client';
import { requireRecentOwnerSession, OwnerAuthError } from '../owner';
import { RECENT_AUTH_MS } from '../owner/security';

export const AGENT_SOURCES = ['codex','commandcode','claudeCode','geminiCli','antigravity','opencode','zcode','deepseekHarness'] as const;
export class AgentAuthError extends Error {
  constructor(readonly status:number, readonly code:string) { super(code); }
}
export const hashAgentToken = (token:string) => createHash('sha256').update(token).digest('hex');
const credential = () => { const token=`isync_${randomBytes(32).toString('base64url')}`; return { token, tokenHash:hashAgentToken(token),tokenHint:token.slice(-6) }; };
const publicFields = {id:true,name:true,allowedSources:true,credentialVersion:true,tokenHint:true,createdAt:true,lastUsedAt:true,revokedAt:true,rotatedAt:true} as const;
type PublicDevice=import('../../generated/client/index.js').Prisma.AgentDeviceGetPayload<{select:typeof publicFields}>;
type DeviceResult={device:PublicDevice;token?:string;devices?:never};
type DeviceList={devices:PublicDevice[];device?:never;token?:never};
function name(value:unknown):string {
  if(typeof value!=='string'||value.trim().length===0||value.length>80||/[\x00-\x1f]/.test(value))throw new AgentAuthError(400,'INVALID_DEVICE_NAME');
  return value.trim();
}
function sources(value:unknown):string[] {
  if(!Array.isArray(value)||!value.length||value.length>AGENT_SOURCES.length||new Set(value).size!==value.length||value.some(s=>!AGENT_SOURCES.includes(s)))throw new AgentAuthError(400,'INVALID_SOURCES');
  return value;
}
// Session gate rechecks current credential version, TOTP enrollment and recent auth.
// This also makes direct service callers obey the same Owner gate as HTTP.
export function manageAgentDevices(sessionId:string,action:'list',input?:Record<string,unknown>):Promise<DeviceList>;
export function manageAgentDevices(sessionId:string,action:'create'|'rename'|'revoke'|'rotate'|'sources',input?:Record<string,unknown>):Promise<DeviceResult>;
export async function manageAgentDevices(sessionId:string, action:'list'|'create'|'rename'|'revoke'|'rotate'|'sources', input:Record<string,unknown>={}):Promise<DeviceList|DeviceResult> {
  await requireRecentOwnerSession(sessionId);
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM owner_accounts WHERE id='owner' FOR UPDATE`;
    const session=await tx.accessSession.findUnique({where:{id:sessionId},include:{ownerAccount:true}});
    const now=new Date();
    if(!session||session.role!=='owner'||session.revokedAt||!session.expiresAt||session.expiresAt<=now||!session.ownerAccount?.totpCiphertext||session.credentialVersion!==session.ownerAccount.credentialVersion
      ||!session.authenticatedAt||now.getTime()-session.authenticatedAt.getTime()>=RECENT_AUTH_MS)throw new OwnerAuthError(428,'reauthentication_required');
    const ownerAccountId=session.ownerAccountId!;
    if(action==='list')return {devices:await tx.agentDevice.findMany({where:{ownerAccountId},select:publicFields,orderBy:[{createdAt:'asc'},{id:'asc'}]})};
    if(action==='create') {
      const secret=credential();
      // Match the existing v1 identifier grammar exactly, including historical
      // UUID-shaped values; this is explicit Owner binding, not a new identity.
      if(input.legacyDeviceId!==undefined&&(typeof input.legacyDeviceId!=='string'||!(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).test(input.legacyDeviceId)))throw new AgentAuthError(400,'INVALID_LEGACY_DEVICE_ID');
      const device=await tx.agentDevice.create({data:{id:input.legacyDeviceId as string|undefined??randomUUID(),ownerAccountId,name:name(input.name),allowedSources:sources(input.allowedSources??[...AGENT_SOURCES]),tokenHash:secret.tokenHash,tokenHint:secret.tokenHint},select:publicFields});
      await tx.securityAudit.create({data:{actorId:ownerAccountId,sessionId,action:'sync.device.create',targetId:device.id,result:'success'}});
      return {device,token:secret.token};
    }
    if(typeof input.id!=='string'||input.id.length>128)throw new AgentAuthError(400,'INVALID_DEVICE_ID');
    const previous=await tx.agentDevice.findFirst({where:{id:input.id,ownerAccountId}});
    if(!previous)throw new AgentAuthError(404,'DEVICE_NOT_FOUND');
    if(action==='sources'){
      if(previous.revokedAt)throw new AgentAuthError(409,'DEVICE_REVOKED');
      const next=sources(input.allowedSources);
      const device=await tx.agentDevice.update({where:{id:previous.id},data:{allowedSources:next},select:publicFields});
      if(JSON.stringify([...previous.allowedSources].sort())!==JSON.stringify([...next].sort()))await tx.syncJob.updateMany({where:{deviceId:previous.id,status:{in:['queued','dispatched','running']}},data:{status:'cancelled',activeKey:null,finishedAt:now,errorCode:'SOURCES_CHANGED'}});
      await tx.securityAudit.create({data:{actorId:ownerAccountId,sessionId,action:'sync.device.sources',targetId:device.id,result:'success'}});
      return {device};
    }
    if(action==='rotate'&&previous.revokedAt)throw new AgentAuthError(409,'DEVICE_REVOKED');
    const secret=action==='rotate'?credential():undefined;
    const data=action==='rename'?{name:name(input.name)}:action==='revoke'?{revokedAt:previous.revokedAt??now}
      :{tokenHash:secret!.tokenHash,tokenHint:secret!.tokenHint,credentialVersion:{increment:1},rotatedAt:now};
    const device=await tx.agentDevice.update({where:{id:previous.id},data,select:publicFields});
    if(action==='revoke'||action==='rotate')await tx.syncJob.updateMany({where:{deviceId:previous.id,status:{in:['queued','dispatched','running']}},data:{status:'cancelled',activeKey:null,finishedAt:now,errorCode:'CREDENTIAL_INVALIDATED'}});
    await tx.securityAudit.create({data:{actorId:ownerAccountId,sessionId,action:`sync.device.${action}`,targetId:device.id,result:'success'}});
    return {device,...(secret?{token:secret.token}:{})};
  }).catch(error=>{if(error&&typeof error==='object'&&'code' in error&&error.code==='P2002')throw new AgentAuthError(409,'DEVICE_IDENTITY_CONFLICT');throw error;});
}
export type AgentIdentity={deviceId:string;ownerAccountId:string;version:number;allowedSources:string[]};
// Future long-lived transports can recheck this version and close a revoked
// connection. HTTP still authenticates the actual token on every request.
export async function requireAgentCredentialVersion(deviceId:string,version:number):Promise<void> {
  const row=await prisma.agentDevice.findUnique({where:{id:deviceId},select:{revokedAt:true,credentialVersion:true}});
  if(!row||row.revokedAt||row.credentialVersion!==version)throw new AgentAuthError(401,'UNAUTHENTICATED');
}
// No cookies, Owner-session lookup, URL credentials or client-provided actor here.
export async function authenticateAgent(authorization:string|null):Promise<AgentIdentity> {
  if(!authorization||!/^Bearer isync_[A-Za-z0-9_-]{43}$/.test(authorization))throw new AgentAuthError(401,'UNAUTHENTICATED');
  const tokenHash=hashAgentToken(authorization.slice(7));
  return prisma.$transaction(async tx=>{
    const device=await tx.agentDevice.findUnique({where:{tokenHash}});
    if(!device||device.revokedAt)throw new AgentAuthError(401,'UNAUTHENTICATED');
    requireCanaryDevice(device.id);
    const used=await tx.agentDevice.updateMany({where:{id:device.id,tokenHash,revokedAt:null},data:{lastUsedAt:new Date()}});
    if(used.count!==1)throw new AgentAuthError(401,'UNAUTHENTICATED');
    return {deviceId:device.id,ownerAccountId:device.ownerAccountId,version:device.credentialVersion,allowedSources:device.allowedSources};
  });
}
export function requireCanaryDevice(deviceId:string) {
  const allowed=(process.env.INCEPT_SYNC_DEVICE_ALLOWLIST??'').split(',').map(value=>value.trim()).filter(Boolean);
  if(allowed.length&&!allowed.includes(deviceId))throw new AgentAuthError(403,'DEVICE_NOT_IN_CANARY');
}
export * from './jobs';
