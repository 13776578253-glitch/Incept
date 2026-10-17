// @vitest-environment node
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {createServer,type Server} from 'node:https';
import {Readable} from 'node:stream';
import {mkdtempSync,readFileSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn,type ChildProcess} from 'node:child_process';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
vi.mock('server-only',()=>({}));
import {prisma} from '@incept/db';
import {manageAgentDevices} from '@incept/db/agent';
import {requireRecentOwnerSession} from '@incept/db/owner';
import {SyncExecutor,SyncTransportError} from '@incept/dashboard/sync';
import {createSyncHandler} from '../controller';
import {DeviceRequestLimiter} from '../http';
import {AgentState,SyncEngine,AgentHttp,captureHome} from '../../../../../../apps/sync-agent/src/engine';
import {writePhase0Home,writePhase0Source,phase0Export,phase0Import} from '../../../../../../packages/dashboard/src/__tests__/fixtures/sync-agent-phase0';
import {CompatibleSyncService} from '../../../../../../packages/dashboard/src/adapters/local/imports/sync/legacy';
import {readSyncView} from '../../../../../../packages/dashboard/src/adapters/local/imports/sync/read';
import {TRANSFER_SOURCES} from '../../../../../../packages/dashboard/src/domain';
const url=process.env.INCEPT_AGENT_TEST_DATABASE_URL;
const real=url?it:it.skip;
const root=resolve(import.meta.dirname,'../../../../../..'),cli=join(root,'apps/sync-agent/dist/agent.mjs');
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
let directory:string,home:string,executor:SyncExecutor,server:Server,base:string,sessionId:string,cookie:string;
let device:{id:string;token:string},lostCommit=false,failPage=false;
const children=new Set<ChildProcess>();
async function issue(allowedSources=[...TRANSFER_SOURCES]){const result=await manageAgentDevices(sessionId,'create',{name:'Phase3 synthetic',allowedSources});return {id:result.device.id,token:result.token!};}
async function http(path:string,method='GET',body?:unknown,token=device.token){return fetch(base+'/api/dashboard/sync'+path,{method,headers:{authorization:'Bearer '+token,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});}
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until(fn:()=>boolean|Promise<boolean>,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await pause(150);}throw Error('ACCEPTANCE_TIMEOUT');}
function child(args:string[],input?:string){const p=spawn(process.execPath,[cli,...args],{windowsHide:true,stdio:['pipe','pipe','pipe']});children.add(p);p.once('exit',()=>children.delete(p));if(input)p.stdin!.end(input);else p.stdin!.end();return p;}
async function command(args:string[],input?:string){const p=child(args,input);let out='',err='';p.stdout!.on('data',b=>out+=String(b));p.stderr!.on('data',b=>err+=String(b));const code=await new Promise<number|null>(yes=>p.once('exit',yes));if(code)throw Error('CLI_FAILED_'+code+'_'+out.replace(/isync_[A-Za-z0-9_-]+/g,'REDACTED'));return {code,value:out.trim()?JSON.parse(out):null,err};}
async function windowsScript(name:'Start'|'Stop',state:string){const script=`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';& (Join-Path $env:INCEPT_AGENT_TEST_SCRIPTS '${name}.ps1') -StateDirectory $env:INCEPT_AGENT_TEST_STATE`;const p=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,INCEPT_AGENT_TEST_SCRIPTS:join(root,'apps/sync-agent/windows'),INCEPT_AGENT_TEST_STATE:state}});let out='';p.stdout!.on('data',b=>out+=String(b));const code=await new Promise<number|null>(yes=>p.once('exit',yes));expect(code).toBe(0);return out;}
function cloud(){const service=new CompatibleSyncService(join(directory,'cloud.db'));try{return readSyncView(service).events;}finally{service.close();}}
beforeAll(async()=>{
  if(!url)return;const target=new URL(url);if(target.hostname!=='127.0.0.1'||target.pathname!=='/incept_sync_phase3')throw Error('ISOLATED_DATABASE_REQUIRED');
  const actual=await prisma.$queryRaw<Array<{db:string}>>`SELECT current_database() db`;if(actual[0].db!=='incept_sync_phase3')throw Error('DATABASE_MISMATCH');
  await prisma.agentDevice.deleteMany();await prisma.securityAudit.deleteMany();await prisma.accessSession.deleteMany();
  const account=await prisma.ownerAccount.upsert({where:{id:'owner'},create:{id:'owner',username:'phase3-synthetic',passwordHash:digest(randomBytes(32).toString('hex')),totpCiphertext:'synthetic-enrolled'},update:{totpCiphertext:'synthetic-enrolled'}});
  cookie=randomBytes(32).toString('base64url');const session=await prisma.accessSession.create({data:{role:'owner',tokenHash:digest(cookie),ownerAccountId:'owner',credentialVersion:account.credentialVersion,expiresAt:new Date(Date.now()+3600000),authenticatedAt:new Date()}});sessionId=session.id;
  device=await issue();directory=mkdtempSync(join(tmpdir(),'incept-phase3-http-'));home=join(directory,'home');writePhase0Home(home);
  executor=new SyncExecutor(join(directory,'cloud.db'),{legacyPath:join(directory,'legacy.db')});
  const handler=createSyncHandler({get executor(){return executor;},enabled:()=>true,limiter:new DeviceRequestLimiter(10000),owner:async(req,mutating)=>{
    if(mutating&&req.headers.get('origin')!==base)throw new SyncTransportError('FORBIDDEN',403);
    const value=req.headers.get('cookie')?.match(/fixture-owner=([A-Za-z0-9_-]+)/)?.[1];const row=value?await prisma.accessSession.findUnique({where:{tokenHash:digest(value)}}):null;
    if(!row)throw new SyncTransportError('FORBIDDEN',403);await requireRecentOwnerSession(row.id);return {sessionId:row.id,ownerId:'owner'};
  }});
  server=createServer({key:readFileSync(join(root,'.scratch/sync-agent-phase3/tls/key.pem')),cert:readFileSync(join(root,'.scratch/sync-agent-phase3/tls/cert.pem'))},(req,res)=>{
    const init={method:req.method,headers:req.headers as HeadersInit,...(!['GET','HEAD'].includes(req.method??'GET')?{body:Readable.toWeb(req),duplex:'half'}:{})} as RequestInit;
    if(failPage&&req.url?.includes('/pages/')){failPage=false;req.resume();res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"BACKEND_UNAVAILABLE"}');return;}
    void handler(new Request(base+req.url,init)).then(async result=>{if(lostCommit&&req.url?.endsWith('/commit')&&result.status===200){lostCommit=false;res.destroy();return;}res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}).catch(()=>{res.writeHead(500);res.end();});
  });await new Promise<void>(yes=>server.listen(0,'127.0.0.1',yes));base='https://127.0.0.1:'+(server.address() as {port:number}).port;
},30000);
afterAll(async()=>{if(!url)return;for(const p of children)p.kill();await executor?.close();server?.closeAllConnections();if(server)await new Promise<void>(yes=>server.close(()=>yes()));await prisma.$disconnect();if(directory)rmSync(directory,{recursive:true,force:true});});

real('real TLS + PG identity: seven sources auto-enroll once, append and committed receipts survive ACK loss/restart',async()=>{
  const statePath=join(directory,'engine-state');let state=new AgentState(statePath);const config={version:1 as const,deviceId:device.id,endpoint:base,home,allowedSources:[...TRANSFER_SOURCES]};
  const collect=async(h:string,a:typeof config.allowedSources,p:Parameters<typeof captureHome>[3])=>{const snap=join(directory,'snapshot');try{return await captureHome(h,snap,a,p);}finally{rmSync(snap,{recursive:true,force:true});}};
  const transport=new AgentHttp(base,device.token,{paceMs:0});
  try{lostCommit=true;await new SyncEngine(state,config,transport,collect).run();expect(state.status().confirmedScopes).toBe(0);expect(state.status().outbox).toEqual([{state:'pending',count:7}]);expect(cloud()).toHaveLength(1);
    state.close();state=new AgentState(statePath);state.db.exec('UPDATE outbox SET next_retry=0');await new SyncEngine(state,config,transport,collect).run();expect(state.status().confirmedScopes).toBe(7);expect(state.status().receiptCount).toBe(7);expect(cloud()).toHaveLength(7);
    writePhase0Home(home,2);failPage=true;await new SyncEngine(state,config,transport,collect).run();expect(state.status().receiptCount).toBe(7);expect(state.status().outbox[0].count).toBe(7);
    await executor.close();executor=new SyncExecutor(join(directory,'cloud.db'),{legacyPath:join(directory,'legacy.db')});state.close();state=new AgentState(statePath);state.db.exec('UPDATE outbox SET next_retry=0');await new SyncEngine(state,config,transport,collect).run();
    expect(state.status().receiptCount).toBe(14);expect(cloud()).toHaveLength(14);expect(state.status().outbox).toEqual([]);
    const receipts=state.db.prepare('SELECT json FROM receipts ORDER BY batch').all().map(row=>JSON.parse(String(row.json)));
    mkdirSync(join(root,'.scratch/sync-agent-phase3'),{recursive:true});writeFileSync(join(root,'.scratch/sync-agent-phase3/upload-evidence.json'),JSON.stringify({transport:'HTTPS with verified test CA',sources:TRANSFER_SOURCES,initialAndAppendReceipts:receipts,cloudVisibleRecords:cloud().length,confirmedScopes:state.status().confirmedScopes,pending:state.status().outbox,ackLostRecovered:true,stagingWorkerRestartRecovered:true},null,2));
    const db=new DatabaseSync(join(directory,'cloud.db'));expect(db.prepare('SELECT COUNT(*) n FROM sync_admissions').get()!.n).toBe(7);db.close();
    const serialized=JSON.stringify(state.status());expect(serialized.includes(device.token)).toBe(false);
  }finally{state.close();}
},120000);

real('device namespace cannot forge Owner, steal origins, bypass v1 history, or retain removed source permission',async()=>{
  const limited=await issue(['codex']);expect((await http('/scopes/resolve','POST',{source:'claudeCode',sessionId:'fresh'},limited.token)).status).toBe(403);
  const parallel=await Promise.all([http('/scopes/resolve','POST',{source:'codex',sessionId:'concurrent-new'},limited.token),http('/scopes/resolve','POST',{source:'codex',sessionId:'concurrent-new'},limited.token)]);expect(parallel.map(r=>r.status)).toEqual([200,200]);const replies=await Promise.all(parallel.map(r=>r.json()));expect(replies[0].admissionId).toBe(replies[1].admissionId);
  expect((await http('/scopes/resolve','POST',{source:'codex',sessionId:'fresh',actor:{role:'owner'}})).status).toBe(400);
  const other=await issue();expect((await http('/scopes/resolve','POST',{source:'codex',sessionId:'phase0-codex'},other.token)).status).toBe(409);
  const bundle=phase0Export(home);phase0Import(bundle,join(directory,'legacy.db'));
  const conflict=await http('/scopes/resolve','POST',{source:'claudeCode',sessionId:'phase0-claudeCode'},other.token);expect(conflict.status).toBe(409);
  // A source/session absent from the origin registry still meets immutable v1 history.
  const freshBundle={...bundle,exportId:randomUUID(),events:bundle.events.map(e=>({...e,eventId:digest(['old-v1-session',e.eventId].join(':')),sessionId:'old-v1-session'}))};
  const {phase0Rehash}=await import('../../../../../../packages/dashboard/src/__tests__/fixtures/sync-agent-phase0');phase0Import(phase0Rehash(freshBundle),join(directory,'legacy.db'));
  const review=await http('/scopes/resolve','POST',{source:'codex',sessionId:'old-v1-session'},other.token);expect(review.status).toBe(409);expect((await review.json()).code).toBe('V1_ADOPTION_REVIEW_REQUIRED');
  const db=new DatabaseSync(join(directory,'cloud.db'));expect(db.prepare('SELECT COUNT(*) n FROM sync_admission_reviews').get()!.n).toBeGreaterThan(0);db.close();
  const receiptState=new AgentState(join(directory,'engine-state'));const saved=receiptState.db.prepare("SELECT receipt_json FROM lineage WHERE json_extract(parent_json,'$.header.manifest.scope.source')!='codex' LIMIT 1").get()!;const batch=JSON.parse(String(saved.receipt_json)).batchId;receiptState.close();
  await prisma.agentDevice.update({where:{id:device.id},data:{allowedSources:['codex']}});expect((await http('/batches/'+batch)).status).toBe(403);
  await prisma.agentDevice.update({where:{id:device.id},data:{allowedSources:[...TRANSFER_SOURCES]}});
  expect((await http('/devices')).status).toBe(403);expect((await http('/agent','GET',undefined,'isync_'+'x'.repeat(43))).status).toBe(401);
  expect((await fetch(base+'/api/dashboard/sync/devices',{headers:{cookie:'fixture-owner='+cookie}})).status).toBe(200);
  expect(cloud()).toHaveLength(14);rmSync(join(directory,'legacy.db'),{force:true});
},60000);

real('portable Windows CLI: DPAPI binding, actual worker, single instance, sync-now, graceful stop and supervisor crash recovery',async()=>{
  const own=await issue(),agentHome=join(directory,'lifecycle-home'),statePath=join(directory,'lifecycle-state');writePhase0Source(agentHome,'claudeCode',{count:1});
  // Rename the native session identity rather than sharing another device's origin.
  const file=join(agentHome,'.claude/projects/phase0-project/phase0-claudeCode.jsonl');writeFileSync(file,readFileSync(file,'utf8').replaceAll('phase0-claudeCode','lifecycle-native-session'));
  await command(['bind','--state',statePath,'--home',agentHome,'--endpoint',base,'--token-stdin'],own.token);
  expect(readFileSync(join(statePath,'credential.dpapi'),'utf8').includes(own.token)).toBe(false);
  const supervisor=child(['supervise','--state',statePath]);let firstPid=0;
  const status=()=>{const state=new AgentState(statePath);try{return state.status();}finally{state.close();}};
  try{
    await until(()=>status().receiptCount===1);firstPid=Number((status().heartbeat as {pid:number}).pid);expect(firstPid).toBeGreaterThan(0);
    const second=await command(['daemon','--state',statePath]);expect(second.value.error).toBe('ALREADY_RUNNING');
    writePhase0Source(agentHome,'claudeCode',{count:2});writeFileSync(file,readFileSync(file,'utf8').replaceAll('phase0-claudeCode','lifecycle-native-session'));
    await command(['sync-now','--state',statePath]);await until(()=>status().receiptCount===2);
    process.kill(firstPid);await until(()=>{const heartbeat=status().heartbeat as {pid:number}|undefined;return !!heartbeat&&heartbeat.pid!==firstPid;});
    await until(()=>status().receiptCount===2&&status().lastErrorCode===null);expect(status().outbox).toEqual([]);
    await command(['stop','--state',statePath]);await until(()=>supervisor.exitCode!==null);expect(supervisor.exitCode).toBe(0);
    expect((await command(['status','--state',statePath])).value.running).toBe(false);
    expect((await command(['run-once','--state',statePath])).value.receiptCount).toBe(2);
    expect((await windowsScript('Start',statePath)).includes('Agent supervisor started:')).toBe(true);await until(()=>!!status().heartbeat);expect((await windowsScript('Stop',statePath)).includes('Agent stopped')).toBe(true);await until(()=>!status().heartbeat);
    expect(cloud().filter(e=>e.sessionId==='lifecycle-native-session')).toHaveLength(2);
  }finally{if(supervisor.exitCode===null){try{await command(['stop','--state',statePath]);await until(()=>supervisor.exitCode!==null,15000);}catch{const h=status().heartbeat as {pid:number}|undefined;if(h)try{process.kill(h.pid);}catch{}supervisor.kill();}}}
},120000);

(url&&process.env.INCEPT_AGENT_FIVE_MINUTE_TEST==='1'?it:it.skip)('real five-minute daemon timer collects a later append without local commands',async()=>{
  const own=await issue(['claudeCode']),agentHome=join(directory,'timer-home'),statePath=join(directory,'timer-state');writePhase0Source(agentHome,'claudeCode',{count:1});
  const file=join(agentHome,'.claude/projects/phase0-project/phase0-claudeCode.jsonl'),rename=()=>writeFileSync(file,readFileSync(file,'utf8').replaceAll('phase0-claudeCode','five-minute-session'));rename();
  await command(['bind','--state',statePath,'--home',agentHome,'--endpoint',base,'--token-stdin'],own.token);const daemon=child(['daemon','--state',statePath]);
  const status=()=>{const s=new AgentState(statePath);try{return s.status();}finally{s.close();}};
  try{await until(()=>status().receiptCount===1);const before=Date.now();writePhase0Source(agentHome,'claudeCode',{count:2});rename();await until(()=>status().receiptCount===2,330000);
    expect(Date.now()-before).toBeGreaterThan(285000);const h=status().heartbeat as {rssBytes:number};expect(h.rssBytes).toBeGreaterThan(0);
    const evidence={automaticIntervalMs:Date.now()-before,receiptCount:status().receiptCount,confirmedScopes:status().confirmedScopes,idleRssBytes:h.rssBytes,tls:true,deviceAuth:'real PostgreSQL token hash',startupTaskInstalled:false};mkdirSync(join(root,'.scratch/sync-agent-phase3'),{recursive:true});writeFileSync(join(root,'.scratch/sync-agent-phase3/lifecycle-evidence.json'),JSON.stringify(evidence,null,2));
  }finally{if(daemon.exitCode===null){await command(['stop','--state',statePath]);await until(()=>daemon.exitCode!==null,15000);}}
},390000);
