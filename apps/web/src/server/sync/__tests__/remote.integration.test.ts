// @vitest-environment node
import {beforeAll,afterAll,expect,it,vi} from 'vitest';
import {createServer,type Server} from 'node:https';
import {Readable,type Duplex} from 'node:stream';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,appendFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn,type ChildProcess} from 'node:child_process';
import {createConnection} from 'node:net';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
vi.mock('server-only',()=>({}));
import {prisma} from '@incept/db';
import {manageAgentDevices,requireSyncOwner,createSyncJob,getSyncJob,policyHash} from '@incept/db/agent';
import {SyncExecutor,SyncTransportError} from '@incept/dashboard/sync';
import {createSyncHandler} from '../controller';
import {RemoteSync} from '../remote';
import {syncUsageGet} from '../usage';
import {AgentState} from '../../../../../../apps/sync-agent/src/state';
import {rpcHeaders} from '../../../../../../packages/dashboard/src/sync/rpc';
import {TRANSFER_SOURCES,type TransferSource} from '../../../../../../packages/dashboard/src/domain';
import {writePhase0Source,writePhase0Pricing} from '../../../../../../packages/dashboard/src/__tests__/fixtures/sync-agent-phase0';
const target=process.env.INCEPT_REMOTE_TEST_DATABASE_URL,test=target?it:it.skip;
const sourceCount=TRANSFER_SOURCES.length,recentAt=Date.now()-60000;
const root=resolve(import.meta.dirname,'../../../../../..'),cli=join(root,'apps/sync-agent/dist/agent.mjs');
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
let directory:string,publicServer:Server,base:string,sessionId:string,cookie:string,executor:SyncExecutor,remote:RemoteSync,gatewayProcess:ChildProcess,gatewayBase:string,gatewayPort:number;
let device:{id:string;token:string},home:string,statePath:string,daemon:ChildProcess|undefined,dropCompletion=false;
const readMode='v2',secret=randomBytes(32).toString('hex'),children=new Set<ChildProcess>();
const tunnels=new Set<Duplex>();
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until(fn:()=>boolean|Promise<boolean>,timeout=45000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await pause(150);}throw Error('REMOTE_ACCEPTANCE_TIMEOUT');}
function launch(args:string[],input?:string){const p=spawn(process.execPath,[cli,...args],{stdio:['pipe','pipe','pipe'],windowsHide:true});children.add(p);p.once('exit',()=>children.delete(p));p.stdin!.end(input??'');return p;}
async function command(args:string[],input?:string){const p=launch(args,input);let text='',err='';p.stdout!.on('data',b=>text+=String(b));p.stderr!.on('data',b=>err+=String(b));const code=await new Promise<number|null>(yes=>p.once('exit',yes));if(code)throw Error('AGENT_COMMAND_FAILED '+JSON.stringify({args,code,text,err}));return text.trim()?JSON.parse(text):null;}
function localStatus(path=statePath){const state=new AgentState(path);try{return state.status();}finally{state.close();}}
function populate(count:number,sources:TransferSource[]=[...TRANSFER_SOURCES],location=home,suffix='primary'){writePhase0Pricing(location);for(const source of sources)writePhase0Source(location,source,{count,session:'p4-'+source+'-'+suffix,at:recentAt});}
async function owner(path:string,method='GET',body?:unknown,authorized=true){return fetch(base+'/api/dashboard/sync'+path,{method,headers:{...(authorized?{cookie:'fixture-owner='+cookie}:{}),origin:base,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});}
async function agent(path:string,body:unknown,token=device.token){return fetch(base+'/api/dashboard/sync'+path,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});}
async function job(idempotencyKey=randomUUID(),id=device.id){const response=await owner('/jobs','POST',{deviceId:id,idempotencyKey});expect(response.status).toBe(202);return (await response.json()).job as {id:string;status:string;dataRevision:number};}
async function finish(id:string){let value:{id:string;status:string;dataRevision:number;result:unknown};await until(async()=>{const r=await owner('/jobs/'+id);expect(r.status).toBe(200);value=(await r.json()).job;return !['queued','dispatched','running'].includes(value.status);});return value!;}
async function devices(){return (await (await owner('/devices/status')).json()).devices as Array<{id:string;online:boolean}>;}
async function startGateway(port=0){gatewayProcess=spawn(process.execPath,[join(root,'apps/sync-gateway/dist/gateway.mjs')],{windowsHide:true,stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,INCEPT_GATEWAY_PORT:String(port),INCEPT_SYNC_WEB_INTERNAL_URL:base,INCEPT_SYNC_RPC_KEY:secret}});gatewayProcess.stdout!.resume();gatewayProcess.stderr!.resume();gatewayPort=await new Promise<number>((yes,no)=>{const t=setTimeout(()=>no(Error('GATEWAY_START_TIMEOUT')),10000);gatewayProcess.once('message',m=>{clearTimeout(t);yes((m as {port:number}).port);});gatewayProcess.once('exit',()=>{clearTimeout(t);no(Error('GATEWAY_START_FAILED'));});});gatewayBase='http://127.0.0.1:'+gatewayPort;}
async function stopGateway(){if(gatewayProcess&&gatewayProcess.exitCode===null){gatewayProcess.kill();await new Promise<void>(yes=>gatewayProcess.once('exit',()=>yes()));}}
async function gatewayStats(){return new Promise<object>(yes=>{gatewayProcess.once('message',m=>yes((m as {stats:object}).stats));gatewayProcess.send({op:'stats'});});}
const evidence:Record<string,unknown>={transport:'real TLS WSS and HTTPS, PostgreSQL authentication',startupTaskInstalled:false,productionTouched:false};
beforeAll(async()=>{
  if(!target)return;const parsed=new URL(target);if(parsed.hostname!=='127.0.0.1'||parsed.pathname!=='/incept_sync_phase4')throw Error('ISOLATED_DATABASE_REQUIRED');
  const actual=await prisma.$queryRaw<Array<{db:string}>>`SELECT current_database() db`;if(actual[0].db!=='incept_sync_phase4')throw Error('DATABASE_MISMATCH');
  await prisma.syncJob.deleteMany();await prisma.agentDevice.deleteMany();await prisma.securityAudit.deleteMany();await prisma.accessSession.deleteMany();
  const account=await prisma.ownerAccount.upsert({where:{id:'owner'},create:{id:'owner',username:'phase4-synthetic',passwordHash:digest(randomBytes(32).toString('hex')),totpCiphertext:'synthetic-enrolled'},update:{totpCiphertext:'synthetic-enrolled'}});
  cookie=randomBytes(32).toString('base64url');const session=await prisma.accessSession.create({data:{role:'owner',ownerAccountId:'owner',credentialVersion:account.credentialVersion,tokenHash:digest(cookie),expiresAt:new Date(Date.now()+3600000),authenticatedAt:new Date(Date.now()-3600000)}});sessionId=session.id;
  // Device provisioning requires recent Owner auth; ordinary refresh below uses
  // the same valid session after its recent-auth window has elapsed.
  await prisma.accessSession.update({where:{id:sessionId},data:{authenticatedAt:new Date()}});const issued=await manageAgentDevices(sessionId,'create',{name:'Windows synthetic',allowedSources:[...TRANSFER_SOURCES]});device={id:issued.device.id,token:issued.token!};await prisma.accessSession.update({where:{id:sessionId},data:{authenticatedAt:new Date(Date.now()-3600000)}});
  directory=mkdtempSync(join(tmpdir(),'incept-phase4-http-'));home=join(directory,'agent-home');statePath=join(directory,'agent-state');populate(1);mkdirSync(join(directory,'cloud-home'));writeFileSync(join(directory,'overrides.json'),'{}');
  process.env.INCEPT_DASHBOARD_HOME=join(directory,'cloud-home');process.env.INCEPT_DASHBOARD_OVERRIDES_FILE=join(directory,'overrides.json');process.env.INCEPT_SYNC_REMOTE_ENABLED='1';
  executor=new SyncExecutor(join(directory,'cloud.db'),{legacyPath:join(directory,'legacy.db')});
  const ownerContext=async(req:Request,mutating:boolean)=>{if(mutating&&req.headers.get('origin')!==base)throw new SyncTransportError('FORBIDDEN',403);const token=req.headers.get('cookie')?.match(/fixture-owner=([A-Za-z0-9_-]+)/)?.[1],s=token?await prisma.accessSession.findUnique({where:{tokenHash:digest(token)}}):null;if(!s)throw new SyncTransportError('FORBIDDEN',403);await requireSyncOwner(s.id);return {sessionId:s.id,ownerId:'owner'};};
  const handler=()=>createSyncHandler({executor,enabled:()=>true,owner:ownerContext,remote});
  publicServer=createServer({key:readFileSync(join(root,'.scratch/sync-agent-phase3/tls/key.pem')),cert:readFileSync(join(root,'.scratch/sync-agent-phase3/tls/cert.pem'))},(req,res)=>{
    const init={method:req.method,headers:req.headers as HeadersInit,...(!['GET','HEAD'].includes(req.method??'GET')?{body:Readable.toWeb(req),duplex:'half'}:{})} as RequestInit;
    const request=new Request(base+req.url,init);const action=req.url?.startsWith('/api/internal/sync/')?remote.internal(request):req.url?.startsWith('/api/dashboard/usage')?(async()=>{try{const o=await ownerContext(request,false);return syncUsageGet(request,o.sessionId,executor,readMode);}catch{return Response.json({error:'FORBIDDEN'},{status:403});}})():handler()(request);
    void action.then(async r=>{if(dropCompletion&&req.url?.endsWith('/complete')&&r.ok){dropCompletion=false;res.destroy();return;}res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));}).catch(()=>{res.writeHead(503);res.end();});
  });publicServer.on('upgrade',(req,socket,head)=>{tunnels.add(socket);const upstream=createConnection(gatewayPort,'127.0.0.1');upstream.once('connect',()=>{upstream.write('GET '+req.url+' HTTP/1.1\r\n'+req.rawHeaders.reduce((s,h,i)=>s+h+(i%2?'\r\n':': '),'')+'\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});upstream.on('error',()=>socket.destroy());upstream.on('close',()=>socket.destroy());socket.on('error',()=>upstream.destroy());socket.on('close',()=>{upstream.destroy();tunnels.delete(socket);});});await new Promise<void>(yes=>publicServer.listen(0,'127.0.0.1',yes));base='https://127.0.0.1:'+(publicServer.address() as {port:number}).port;
  await startGateway();remote=new RemoteSync({executor,owner:ownerContext,gatewayBase,secret,readMode:()=>readMode});
  await command(['bind','--state',statePath,'--home',home,'--endpoint',base,'--remote','--token-stdin'],device.token);daemon=launch(['daemon','--state',statePath]);daemon.stdout!.resume();daemon.stderr!.resume();try{await until(()=>localStatus().receiptCount===sourceCount);await until(async()=>(await devices()).some(d=>d.id===device.id&&d.online));}catch(error){evidence.setup={windows:localStatus(),exitCode:daemon.exitCode,gateway:await gatewayStats()};throw error;}
},90000);
afterAll(async()=>{if(!target)return;
  if(daemon?.exitCode===null)try{await command(['stop','--state',statePath]);await until(()=>daemon!.exitCode!==null,15000);}catch{daemon.kill();}
  for(const c of children)c.kill();await stopGateway();for(const socket of tunnels)socket.destroy();await executor?.close();publicServer?.closeAllConnections();if(publicServer)await new Promise<void>(yes=>publicServer.close(()=>yes()));await prisma.$disconnect();
  mkdirSync(join(root,'.scratch/sync-agent-phase4'),{recursive:true});writeFileSync(join(root,'.scratch/sync-agent-phase4/remote-evidence.json'),JSON.stringify(evidence,null,2));if(directory)rmSync(directory,{recursive:true,force:true});
},30000);

test('Owner HTTP → genuine WSS → Windows collector → HTTPS receipt → v2 Dashboard, duplicate clicks merge',async()=>{
  populate(2);const sameKey=randomUUID(),created=await Promise.all(Array.from({length:5},(_,i)=>job(i<2?sameKey:randomUUID())));expect(new Set(created.map(j=>j.id)).size).toBe(1);const completed=await finish(created[0].id);expect(completed.status).toBe('completed');expect(completed.dataRevision).toBe(sourceCount*2);
  const summaries=[];for(const range of ['7d','30d','all']){const r=await fetch(base+'/api/dashboard/usage?range='+range+'&minRevision='+completed.dataRevision,{headers:{cookie:'fixture-owner='+cookie}});expect(r.status).toBe(200);const dto=await r.json();expect(dto.sync.readMode).toBe('v2');expect(dto.sync.dataRevision).toBeGreaterThanOrEqual(sourceCount*2);expect(dto.totals.sessionCount).toBe(sourceCount);expect(dto.totals.totalTokens).toBe(sourceCount*260);summaries.push({range,tokens:dto.totals.totalTokens,revision:dto.sync.dataRevision});}
  expect(localStatus().receiptCount).toBe(sourceCount*2);evidence.closedLoop={job:completed,windows:localStatus(),summaries,gateway:await gatewayStats()};
},90000);
test('no-change is explicit, replayed completion is idempotent and different result is rejected',async()=>{
  const j=await job();const done=await finish(j.id);expect(done.status).toBe('completed_no_change');const row=await prisma.syncJob.findUniqueOrThrow({where:{id:j.id}});expect(row.startRevision).toBe(BigInt(sourceCount*2));const completion={...(row.result as Record<string,unknown>)};delete completion.status;
  expect((await agent('/agent/jobs/'+j.id+'/complete',completion)).status).toBe(200);const replay=await agent('/agent/jobs/'+j.id+'/complete',{...completion,scanId:randomUUID()});expect(replay.status).toBe(409);
  evidence.noChange={id:j.id,status:done.status};
},45000);
test('lost completion ACK and Agent restart recover a durable job without duplicate data',async()=>{
  populate(3);dropCompletion=true;const j=await job(),done=await finish(j.id);expect(done.status).toBe('completed');await until(()=>!dropCompletion);
  await command(['stop','--state',statePath]);await until(()=>daemon!.exitCode!==null);daemon=launch(['daemon','--state',statePath]);daemon.stdout!.resume();daemon.stderr!.resume();await until(()=>localStatus().lastRemoteJob!==undefined);await until(()=>localStatus().receiptCount===sourceCount*3);expect((await finish(j.id)).dataRevision).toBe(sourceCount*3);evidence.ackRecovery={job:j.id,revision:sourceCount*3};
},90000);
test('Gateway and Web/Worker restart recover sockets and queued jobs; current online facts disappear on Gateway loss',async()=>{
  const port=gatewayPort;await stopGateway();expect((await devices()).find(d=>d.id===device.id)?.online).toBe(false);const offline=await job();expect(offline.status).toBe('offline');
  await startGateway(port);await until(async()=>(await devices()).some(d=>d.id===device.id&&d.online));
  const own=(remote.options.owner),webPort=(publicServer.address() as {port:number}).port;for(const socket of tunnels)socket.destroy();publicServer.closeAllConnections();await new Promise<void>(yes=>publicServer.close(()=>yes()));await executor.close();executor=new SyncExecutor(join(directory,'cloud.db'),{legacyPath:join(directory,'legacy.db')});remote=new RemoteSync({executor,owner:own,gatewayBase,secret,readMode:()=>readMode});await new Promise<void>(yes=>publicServer.listen(webPort,'127.0.0.1',yes));await until(async()=>(await devices()).some(d=>d.id===device.id&&d.online));
  const done=await finish((await job()).id);expect(done.status).toBe('completed_no_change');evidence.restartRecovery=true;
},90000);
test('partial read and historical deletion cannot masquerade as successful jobs; old v2 generation remains',async()=>{
  const claude=join(home,'.claude/projects/phase0-project/p4-claudeCode-primary.jsonl');appendFileSync(claude,'{"half":');const partial=await finish((await job()).id);expect(partial.status).toBe('partial');populate(3);
  writePhase0Source(home,'geminiCli',{count:1,session:'p4-geminiCli-primary',at:recentAt});const review=await finish((await job()).id);expect(review.status).toBe('partial');
  const r=await fetch(base+'/api/dashboard/usage?range=all',{headers:{cookie:'fixture-owner='+cookie}});const dto=await r.json();expect(dto.totals.totalTokens).toBe(sourceCount*390);evidence.conflicts={partial:partial.status,review:review.status,retainedTokens:dto.totals.totalTokens};
},90000);
test('unauthorized/cross-device calls, CSRF, internal replay, WSS token/query misuse and expired jobs fail closed',async()=>{
  expect((await owner('/jobs','POST',{deviceId:device.id,idempotencyKey:randomUUID()},false)).status).toBe(403);
  expect((await fetch(base+'/api/dashboard/sync/jobs',{method:'POST',headers:{cookie:'fixture-owner='+cookie,origin:'https://evil.invalid','content-type':'application/json'},body:JSON.stringify({deviceId:device.id,idempotencyKey:randomUUID()})})).status).toBe(403);
  expect((await owner('/jobs','POST',{deviceId:device.id,idempotencyKey:randomUUID(),actor:{role:'owner'}})).status).toBe(400);
  const nonexistent=randomUUID();expect((await owner('/jobs','POST',{deviceId:nonexistent,idempotencyKey:randomUUID()})).status).toBe(404);
  const path='/api/internal/sync/check',body=JSON.stringify({deviceId:device.id,version:1,policyHash:policyHash([...TRANSFER_SOURCES])}),headers=rpcHeaders(secret,path,body);
  expect((await fetch(base+path,{method:'POST',headers,body})).status).toBe(200);expect((await fetch(base+path,{method:'POST',headers,body})).status).toBe(409);expect((await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body})).status).toBe(403);
  const attack=new WebSocket(base.replace('https:','wss:')+'/api/sync/ws?token=redacted');const attackClosed=await new Promise<boolean>(yes=>{attack.addEventListener('error',()=>yes(true));attack.addEventListener('open',()=>{attack.close();yes(false);});});expect(attackClosed).toBe(true);
  const forged=new WebSocket(base.replace('https:','wss:')+'/api/sync/ws');const rejected=await new Promise<number>(yes=>{forged.addEventListener('open',()=>forged.send(JSON.stringify({type:'auth',token:device.token,actor:'owner'})));forged.addEventListener('close',e=>yes(e.code));});expect(rejected).toBe(4003);
  const uncertain=await createSyncJob(sessionId,device.id,randomUUID(),true);expect((await agent('/agent/jobs/'+uncertain.id+'/start',{})).status).toBe(200);const badClaim=await agent('/agent/jobs/'+uncertain.id+'/complete',{scanId:randomUUID(),collectedAt:new Date().toISOString(),issues:0,pending:0,review:0,batches:[],lineageHash:'0'.repeat(64)});expect(badClaim.status).toBe(200);expect((await badClaim.json()).job.status).toBe('review_required');
  await command(['stop','--state',statePath]);await until(()=>daemon!.exitCode!==null);
  const pending=await createSyncJob(sessionId,device.id,randomUUID(),true);await prisma.syncJob.update({where:{id:pending.id},data:{expiresAt:new Date(Date.now()-1)}});expect((await getSyncJob(pending.id,'owner')).status).toBe('expired');expect((await agent('/agent/jobs/'+pending.id+'/start',{})).status).toBe(409);
  evidence.security={ownerGate:true,csrf:true,internalReplayRejected:true,expired:true};
},45000);
test('revocation cancels waiting jobs and rotation invalidates the established device WSS credential',async()=>{
  await prisma.accessSession.update({where:{id:sessionId},data:{authenticatedAt:new Date()}});const next=await manageAgentDevices(sessionId,'create',{name:'Rotation test',allowedSources:['codex']});const token=next.token!;
  const foreign=await prisma.syncJob.findFirstOrThrow({where:{deviceId:device.id,status:'completed'}});const completion={...(foreign.result as Record<string,unknown>)};delete completion.status;const foreignResponse=await agent('/agent/jobs/'+foreign.id+'/complete',completion,token);expect(foreignResponse.status).toBe(404);
  const socket=new WebSocket(base.replace('https:','wss:')+'/api/sync/ws');await new Promise<void>((yes,no)=>{socket.addEventListener('open',()=>socket.send(JSON.stringify({type:'auth',token})));socket.addEventListener('message',e=>{if(JSON.parse(String(e.data)).type==='ready')yes();});socket.addEventListener('error',()=>no(Error('WSS_FAILED')));});
  const pending=await createSyncJob(sessionId,next.device.id,randomUUID(),true);await manageAgentDevices(sessionId,'rotate',{id:next.device.id});await until(()=>socket.readyState===WebSocket.CLOSED);expect((await getSyncJob(pending.id,'owner')).status).toBe('cancelled');
  expect((await agent('/agent/jobs/'+pending.id+'/start',{},token)).status).toBe(401);await manageAgentDevices(sessionId,'revoke',{id:next.device.id});evidence.security={...evidence.security as object,revocation:true,rotation:true};
},45000);
