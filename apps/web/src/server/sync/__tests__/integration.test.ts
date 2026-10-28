// @vitest-environment node
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {createServer,type Server} from 'node:http';
import {Readable} from 'node:stream';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {PrismaClient} from '../../../../../../packages/db/generated/client/index.js';
vi.mock('server-only',()=>({}));
import {SyncExecutor,SyncTransportError} from '@incept/dashboard/sync';
import {prisma} from '@incept/db';
import {authenticateAgent,manageAgentDevices,hashAgentToken,requireAgentCredentialVersion} from '@incept/db/agent';
import {requireRecentOwnerSession} from '@incept/db/owner';
import {createSyncHandler} from '../controller';
import {DeviceRequestLimiter,HTTP_LIMITS} from '../http';
import {fromEvents} from '../../../../../../packages/dashboard/src/__tests__/phase1/fixtures';
import {hash} from '../../../../../../packages/dashboard/src/adapters/local/imports/identity';
import {stableJson} from '../../../../../../packages/dashboard/src/adapters/local/imports/identity';
import {CompatibleSyncService} from '../../../../../../packages/dashboard/src/adapters/local/imports/sync/legacy';
import {readSyncView} from '../../../../../../packages/dashboard/src/adapters/local/imports/sync/read';
import {ImportStore} from '../../../../../../packages/dashboard/src/adapters/local/imports/store';
import {loadImportedEvents} from '../../../../../../packages/dashboard/src/adapters/local/imports/layer';
import {rollbackImport} from '../../../../../../packages/dashboard/src/adapters/local/imports/service';
import {dateWindow,TRANSFER_SOURCES} from '../../../../../../packages/dashboard/src/domain';
import {summarizeUsageEvents} from '../../../../../../packages/dashboard/src/adapters/local/aggregation/summarize';
import {applyCommandCodeQuota} from '../../../../../../packages/dashboard/src/adapters/local/pricing-schedule';
import {PHASE0_NOW,PHASE0_AT,writePhase0Home,writePhase0Pricing,phase0Export,phase0Rehash,phase0Import} from '../../../../../../packages/dashboard/src/__tests__/fixtures/sync-agent-phase0';
const url=process.env.INCEPT_SYNC_TEST_DATABASE_URL;
let home:string,executor:SyncExecutor,server:Server,base:string,sessionId:string,otherSessionId:string,browserToken:string;
let credential:{id:string;token:string},second:{id:string;token:string};
const ownerActor={role:'owner' as const,subject:'owner',reason:'isolated HTTP acceptance'};
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const sessions:string[]=[];
function candidate(id=credential.id,batch='baseline',count=2,parent?:ReturnType<typeof fromEvents>['header']) {
  const scope={deviceId:id,source:'claudeCode' as const,sessionId:'synthetic-session',originId:'origin-'+id};
  return fromEvents(Array.from({length:count},(_,i)=>({eventId:hash([id,i]),source:scope.source,sessionId:scope.sessionId,timestampMs:Date.UTC(2026,9,16)+i,
    modelName:'phase0-fixture-model',projectKey:'synthetic',projectName:'Synthetic',inputTokens:100,outputTokens:20,cacheReadTokens:0,cacheCreationTokens:0,reasoningTokens:0})),scope,parent,batch);
}
async function http(path:string,method='GET',body?:unknown,token=credential?.token,headers:Record<string,string>={}) {
  return fetch(base+path,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body!==undefined?{'content-type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
}
const ownerHeaders=()=>({cookie:'fixture-owner='+browserToken,origin:new URL(base).origin});
async function bind(id:string) {const c=candidate(id);await executor.execute({op:'register',scope:c.header.manifest.scope,label:'Synthetic',actor:ownerActor});}

describeReal();
function describeReal(){const suite=url?it:it.skip;
beforeAll(async()=>{
  if(!url)return;
  const target=new URL(url);if(target.hostname!=='127.0.0.1'||target.pathname!=='/incept_sync_phase2')throw new Error('ISOLATED_DATABASE_REQUIRED');
  const current=await prisma.$queryRaw<Array<{db:string}>>`SELECT current_database() db`;if(current[0].db!=='incept_sync_phase2')throw new Error('DATABASE_MISMATCH');
  await prisma.agentDevice.deleteMany();await prisma.securityAudit.deleteMany();await prisma.accessSession.deleteMany();
  await prisma.ownerAccount.upsert({where:{id:'owner'},create:{id:'owner',username:'phase2-fixture',passwordHash:digest(randomBytes(32).toString('hex')),totpCiphertext:'synthetic-enrolled'},update:{totpCiphertext:'synthetic-enrolled'}});
  const account=await prisma.ownerAccount.findUniqueOrThrow({where:{id:'owner'}});
  for(let i=0;i<2;i++){const token=randomBytes(32).toString('base64url');if(i===0)browserToken=token;
    const session=await prisma.accessSession.create({data:{role:'owner',tokenHash:digest(token),ownerAccountId:'owner',credentialVersion:account.credentialVersion,expiresAt:new Date(Date.now()+3600_000),authenticatedAt:new Date()}});sessions.push(session.id);}
  [sessionId,otherSessionId]=sessions;
  const created=await manageAgentDevices(sessionId,'create',{name:'Synthetic A'}),other=await manageAgentDevices(otherSessionId,'create',{name:'Synthetic B'});
  credential={id:created.device!.id,token:created.token!};second={id:other.device!.id,token:other.token!};
  home=mkdtempSync(join(tmpdir(),'sync-phase2-http-'));executor=new SyncExecutor(join(home,'sync.db'));await bind(credential.id);await bind(second.id);
  const handler=createSyncHandler({get executor(){return executor;},enabled:()=>true,owner:async(req,mutating)=>{
    if(mutating&&req.headers.get('origin')!==new URL(base).origin)throw new SyncTransportError('FORBIDDEN',403);
    const cookie=req.headers.get('cookie')??'';const token=cookie.match(/fixture-owner=([A-Za-z0-9_-]+)/)?.[1];
    const row=token?await prisma.accessSession.findUnique({where:{tokenHash:digest(token)}}):null;
    if(!row||row.role!=='owner')throw new SyncTransportError('FORBIDDEN',403);
    await requireRecentOwnerSession(row.id);return {sessionId:row.id,ownerId:'owner'};
  }});
  server=createServer((req,res)=>{const controller=new AbortController();req.on('aborted',()=>controller.abort());res.on('close',()=>{if(!res.writableEnded)controller.abort();});
    const init={method:req.method,headers:req.headers as HeadersInit,signal:controller.signal,...(!['GET','HEAD'].includes(req.method??'GET')?{body:Readable.toWeb(req),duplex:'half'}:{})} as RequestInit;
    void handler(new Request(new URL(base).origin+req.url,init)).then(async result=>{res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));});
  });await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port+'/api/dashboard/sync';
},30_000);
afterAll(async()=>{if(!url)return;await executor?.close();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await prisma.$disconnect();if(home)rmSync(home,{recursive:true,force:true});});

suite('real PG schema, hash-only credentials, multi-browser management and concurrent creates',async()=>{
  const rows=await Promise.all(Array.from({length:3},(_,i)=>manageAgentDevices(i%2?otherSessionId:sessionId,'create',{name:'Concurrent '+i})));
  expect(new Set(rows.map(row=>row.device!.id)).size).toBe(3);
  const stored=await prisma.agentDevice.findUniqueOrThrow({where:{id:credential.id}});expect(stored.tokenHash).toBe(hashAgentToken(credential.token));expect(stored.tokenHash===credential.token).toBe(false);
  const listed=await manageAgentDevices(sessionId,'list');expect(JSON.stringify(listed).includes(credential.token)).toBe(false);expect(JSON.stringify(listed).includes(stored.tokenHash)).toBe(false);
  const indexes=await prisma.$queryRaw<Array<{indexname:string}>>`SELECT indexname FROM pg_indexes WHERE tablename='agent_devices'`;
  expect(indexes.map(row=>row.indexname)).toContain('agent_devices_tokenHash_key');
  await expect(prisma.agentDevice.create({data:{ownerAccountId:'owner',name:'duplicate',tokenHash:stored.tokenHash,tokenHint:'hint',allowedSources:['codex']}})).rejects.toThrow();
});
suite('401 without credentials, 403 across devices/scopes and Owner endpoint protection',async()=>{
  expect((await http('/batches','POST',{header:candidate().header},'')).status).toBe(401);
  expect((await http('/batches','POST',{header:candidate().header},second.token)).status).toBe(403);
  expect((await http('/batches','POST',{header:candidate().header},credential.token,{'x-sync-device-id':second.id})).status).toBe(403);
  const limited=await manageAgentDevices(sessionId,'create',{name:'Source limited',allowedSources:['codex']});
  expect((await http('/batches','POST',{header:candidate(limited.device.id).header},limited.token)).status).toBe(403);
  expect((await http('/devices')).status).toBe(403);
  expect((await http('/devices','POST',{name:'Forbidden'},'',{cookie:'fixture-owner='+browserToken,origin:'https://other.invalid'})).status).toBe(403);
  expect((await http('/devices','GET',undefined,'',ownerHeaders())).status).toBe(200);
});
suite('real HTTP staged commit, 100 receipt retries, persistent revision and independent device',async()=>{
  const c=candidate();expect((await http('/batches','POST',{header:c.header})).status).toBe(200);
  expect((await http('/batches/baseline/pages/0','PUT',{records:c.records})).status).toBe(200);
  expect((await http('/batches/baseline/pages/0','PUT',{records:c.records})).status).toBe(200);
  const first=await (await http('/batches/baseline/commit','POST')).json();expect(first.receipt.status).toBe('committed');
  for(let i=0;i<100;i++){const response=await http('/batches/baseline/commit','POST');expect(response.status).toBe(200);expect((await response.json()).receipt).toEqual(first.receipt);}
  const status=await (await http('/batches/baseline')).json();expect(status.dataRevision).toBe(first.receipt.dataRevision);
  expect((await http('/batches/baseline','GET',undefined,second.token)).status).toBe(404);
  const own=candidate(second.id,'other');expect((await http('/batches','POST',{header:own.header},second.token)).status).toBe(200);
});
suite('payload conflict, wrong/oversized pages, missing pages and client actor injection',async()=>{
  const c=candidate(credential.id,'ordered',3);expect((await http('/batches','POST',{header:c.header})).status).toBe(200);
  expect((await http('/batches/ordered/pages/1','PUT',{records:c.records.slice(0,1)})).status).toBe(409);
  expect((await http('/batches/ordered/commit','POST')).status).toBe(409);
  expect((await http('/batches/ordered/pages/0','PUT',{records:Array(501).fill(c.records[0])})).status).toBe(413);
  const invalid=structuredClone(c.records);invalid[0].event.inputTokens=-1;
  expect((await http('/batches/ordered/pages/0','PUT',{records:invalid})).status).toBe(400);
  expect((await http('/batches','POST',{header:c.header,actor:{role:'owner'}})).status).toBe(400);
  const modified=structuredClone(c);modified.header.batchId='baseline';expect((await http('/batches','POST',{header:modified.header})).status).toBe(409);
});
suite('actual chunked body byte guard with no Content-Length, and max legal page HTTP reachability',async()=>{
  const big=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(' '.repeat(HTTP_LIMITS.headerBytes+1)));controller.close();}});
  const rejected=await fetch(base+'/batches',{method:'POST',headers:{authorization:'Bearer '+credential.token,'content-type':'application/json'},body:big,duplex:'half'} as RequestInit);
  expect(rejected.status).toBe(413);expect((await rejected.json()).error).toBe('REQUEST_BODY_LIMIT');
  const initial=candidate(second.id,'byte-page',500),size=Buffer.byteLength(JSON.stringify(initial.records));
  const nameLength=9+Math.floor((512*1024-2000-size)/500);
  const c=fromEvents(initial.records.map(row=>({...row.event,projectName:'P'.repeat(nameLength)})),initial.header.manifest.scope,undefined,'byte-page');
  const legalBytes=Buffer.byteLength(JSON.stringify(c.records));expect(legalBytes).toBeGreaterThan(508*1024);expect(legalBytes).toBeLessThanOrEqual(512*1024);
  expect((await http('/batches','POST',{header:c.header},second.token)).status).toBe(200);
  expect((await http('/batches/byte-page/pages/0','PUT',{records:c.records},second.token)).status).toBe(200);
});
suite('rotation invalidates old credentials, revoke is idempotent and blocks every device operation',async()=>{
  const rotated=await manageAgentDevices(otherSessionId,'rotate',{id:second.id});const old=second.token;second.token=rotated.token!;
  await expect(authenticateAgent('Bearer '+old)).rejects.toMatchObject({status:401});
  await expect(requireAgentCredentialVersion(second.id,1)).rejects.toMatchObject({status:401});
  expect((await http('/batches/other','GET',undefined,second.token)).status).toBe(200);
  await Promise.all([manageAgentDevices(sessionId,'revoke',{id:second.id}),manageAgentDevices(otherSessionId,'revoke',{id:second.id})]);
  for(const[path,method,body]of [['/batches/other','GET',undefined],['/batches','POST',{header:candidate(second.id).header}],['/batches/other/pages/0','PUT',{records:[]}],['/batches/other/commit','POST',undefined]] as const)
    expect((await http(path,method,body,second.token)).status).toBe(401);
  await expect(manageAgentDevices(sessionId,'rotate',{id:second.id})).rejects.toMatchObject({code:'DEVICE_REVOKED'});
  const audits=await prisma.securityAudit.findMany();expect(JSON.stringify(audits).includes(old)).toBe(false);expect(JSON.stringify(audits).includes(second.token)).toBe(false);
});
suite('rate limiter and queue limits return structured 429 and Retry-After',async()=>{
  const limited=createSyncHandler({executor,enabled:()=>true,owner:async()=>{throw new Error();},limiter:new DeviceRequestLimiter(1)});
  const request=()=>new Request(base+'/batches/baseline',{headers:{authorization:'Bearer '+credential.token}});
  expect((await limited(request())).status).toBe(200);const rejected=await limited(request());expect(rejected.status).toBe(429);expect(rejected.headers.get('retry-after')).toBeTruthy();
  const small=new SyncExecutor(join(home,'queue.db'),{maxQueue:1});let release!:()=>void;
  const waiting=small.execute({op:'capacity',actor:ownerActor},()=>new Promise<void>(resolve=>{release=resolve;}));
  await expect(small.execute({op:'capacity',actor:ownerActor})).rejects.toMatchObject({code:'QUEUE_FULL',status:429});release();await waiting;await small.close();
});
suite('queued request revalidates a revoked credential before Worker dispatch',async()=>{
  const created=await manageAgentDevices(sessionId,'create',{name:'Queue revocation'});const id=created.device!.id,token=created.token!;await bind(id);
  let release!:()=>void;const hold=executor.execute({op:'capacity',actor:ownerActor},()=>new Promise<void>(resolve=>{release=resolve;}));
  const request=http('/batches','POST',{header:candidate(id,'queued').header},token);await new Promise(resolve=>setTimeout(resolve,80));
  await manageAgentDevices(sessionId,'revoke',{id});release();await hold;expect((await request).status).toBe(401);
});
suite('capacity simulation, staging TTL and restart recover from SQLite without losing receipts',async()=>{
  const {capacityState,guardCapacity}=await import('../../../../../../packages/dashboard/src/sync/capacity');
  const db=new DatabaseSync(join(home,'sync.db'));
  const state=capacityState(join(home,'sync.db'),db,undefined,1024);expect(state.disk).toBe('reject-new-staging');expect(()=>guardCapacity(state)).toThrow('INSUFFICIENT_STORAGE');
  db.prepare('UPDATE sync_staging SET expires_at=? WHERE batch_id=?').run(Date.now()-1,'ordered');db.close();
  expect((await (await http('/batches/ordered')).json()).state).toBe('expired');expect((await http('/batches/ordered/commit','POST')).status).toBe(409);
  await executor.close();executor=new SyncExecutor(join(home,'sync.db'));
  const status=await executor.execute<{receipt:{status:string}}>({op:'status',device:credential.id,batch:'baseline',actor:{role:'device',deviceId:credential.id}});expect(status.receipt.status).toBe('committed');
});
suite('unexpected backend errors are redacted and default-disabled handler does no auth or IO',async()=>{
  const disabled=createSyncHandler({executor,enabled:()=>false,owner:async()=>{throw new Error();},authenticate:async()=>{throw new Error('must not call');}});
  expect((await disabled(new Request(base+'/batches'))).status).toBe(404);
  const broken=createSyncHandler({executor,enabled:()=>true,owner:async()=>{throw new Error();},authenticate:async()=>{throw new Error('secret-token SQL SELECT private/path');}});
  const result=await broken(new Request(base+'/batches'));expect(result.status).toBe(503);expect(/secret|SELECT|private|stack/.test(await result.text())).toBe(false);
});
suite('runtime PG role can use migrated device tables but cannot perform DDL',async()=>{
  const role='phase2_runtime_'+randomBytes(5).toString('hex'),password=randomBytes(32).toString('base64url');
  await prisma.$executeRawUnsafe(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);
  await prisma.$executeRawUnsafe(`GRANT CONNECT ON DATABASE incept_sync_phase2 TO ${role}`);
  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await prisma.$executeRawUnsafe(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
  const target=new URL(url!);target.username=role;target.password=password;
  const client=new PrismaClient({datasources:{db:{url:target.href}},log:[]});
  try{expect(await client.agentDevice.count()).toBeGreaterThan(0);await expect(client.$executeRawUnsafe('CREATE TABLE phase2_forbidden (id int)')).rejects.toThrow();await expect(client.$executeRawUnsafe('DROP TABLE agent_devices')).rejects.toThrow();}
  finally{await client.$disconnect();await prisma.$executeRawUnsafe(`DROP OWNED BY ${role}`);await prisma.$executeRawUnsafe(`DROP ROLE ${role}`);}
});
suite('raw credential never appears in console output for creation, failed auth and revoke',async()=>{
  const calls:unknown[][]=[],spies=['error','warn','log'].map(key=>vi.spyOn(console,key as 'error').mockImplementation((...args:unknown[])=>{calls.push(args);}));
  let issued:string|undefined;
  try{const result=await manageAgentDevices(sessionId,'create',{name:'Leak check'});issued=result.token!;await authenticateAgent('Bearer '+issued);await manageAgentDevices(sessionId,'revoke',{id:result.device.id});await expect(authenticateAgent('Bearer '+issued)).rejects.toMatchObject({status:401});expect(JSON.stringify(calls).includes(issued)).toBe(false);}
  finally{spies.forEach(spy=>spy.mockRestore());}
});
suite('seven-source HTTP adoption, resumable Worker migration and v1 rollback have zero full-object differences in three windows',async()=>{
  await executor.close();const path=join(home,'parity.db'),legacyPath=join(home,'legacy-copy.db');executor=new SyncExecutor(path);
  const created=await manageAgentDevices(sessionId,'create',{name:'Parity device'});credential={id:created.device.id,token:created.token!};
  writePhase0Home(home);writePhase0Pricing(home);const original=phase0Export(home);
  const bundle=phase0Rehash({...original,device:{...original.device,id:credential.id,label:'Parity device'},events:[PHASE0_NOW-45*86400000,PHASE0_NOW-15*86400000,PHASE0_AT].flatMap((at,i)=>original.events.map(event=>({...event,eventId:hash([i,event.eventId]),timestampMs:at})))});
  const first=phase0Import(bundle,legacyPath);phase0Import(phase0Rehash({...bundle,exportId:randomUUID()}),legacyPath);
  expect((await executor.execute<{processed:number}>({op:'migrate',sourcePath:legacyPath,maxBatches:1,actor:ownerActor})).processed).toBe(1);
  expect((await executor.execute<{processed:number}>({op:'migrate',sourcePath:legacyPath,maxBatches:1,actor:ownerActor})).processed).toBe(1);
  expect((await executor.execute<{processed:number}>({op:'migrate',sourcePath:legacyPath,maxBatches:1,actor:ownerActor})).processed).toBe(0);
  const verifier=new CompatibleSyncService(path),store=new ImportStore(legacyPath),batches=store.batches();store.close();
  const normalize=(value:unknown):unknown=>Array.isArray(value)?value.map(normalize).sort((a,b)=>stableJson(a).localeCompare(stableJson(b),'en')):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,row])=>[key,key==='source'&&typeof row==='string'&&row.includes(' / ')?row.split(' / ').sort().join(' / '):normalize(row)])):value;
  const old=loadImportedEvents([],new Map(),{},legacyPath).events.map(applyCommandCodeQuota);
  const summary=(rows:typeof old,range:'7d'|'30d'|'all')=>{const window=dateWindow(range,PHASE0_NOW,rows.map(row=>row.dateKey).sort()[0]);return summarizeUsageEvents(rows.filter(row=>row.dateKey>=window.from&&row.dateKey<=window.to),home,new Map(),PHASE0_AT,window);};
  const parity=()=>{for(const range of ['7d','30d','all'] as const)expect(normalize(summary(readSyncView(verifier).events,range))).toEqual(normalize(summary(old,range)));};
  try {
    parity();for(const source of TRANSFER_SOURCES){const events=bundle.events.filter(row=>row.source===source),scope={deviceId:credential.id,source,sessionId:events[0].sessionId,originId:'parity-'+source};
      expect((await http('/devices/'+credential.id+'/scopes','POST',{source,sessionId:scope.sessionId,originId:scope.originId},'',ownerHeaders())).status).toBe(200);
      const c=fromEvents(events,scope,undefined,'adopt-'+source);expect((await http('/batches','POST',{header:c.header})).status).toBe(200);expect((await http('/batches/'+c.header.batchId+'/pages/0','PUT',{records:c.records})).status).toBe(200);
      for(const batch of batches)await executor.execute({op:'adopt',header:c.header,batch:batch.receipt.id,actor:ownerActor});
      expect((await http('/batches/'+c.header.batchId+'/commit','POST')).status).toBe(200);parity();
    }
    rollbackImport(first.id,legacyPath);await executor.execute({op:'migrate',sourcePath:legacyPath,maxBatches:1,actor:ownerActor});parity();
    expect(readSyncView(verifier).events.length).toBe(bundle.events.length);
  }finally{verifier.close();}
},30_000);
suite('Owner explicitly binds an existing v1 UUID, with no heuristic adoption or duplicate takeover',async()=>{
  const legacyDeviceId='00000000-0000-0000-0000-'+randomBytes(6).toString('hex'),created=await manageAgentDevices(sessionId,'create',{name:'Explicit legacy binding',legacyDeviceId});expect(created.device.id).toBe(legacyDeviceId);
  await expect(manageAgentDevices(otherSessionId,'create',{name:'Duplicate binding',legacyDeviceId})).rejects.toMatchObject({status:409,code:'DEVICE_IDENTITY_CONFLICT'});
  await expect(manageAgentDevices(sessionId,'create',{name:'Bad identity',legacyDeviceId:'path-or-name'})).rejects.toMatchObject({status:400});
});
suite('HTTP Codex cumulative correction, review retention and rollback fence preserve totals and fees',async()=>{
  const scope={deviceId:credential.id,source:'codex' as const,sessionId:'http-cumulative',originId:'http-cumulative-origin'};
  await executor.execute({op:'register',scope,label:'Synthetic',actor:ownerActor});
  const verifier=new CompatibleSyncService(join(home,'parity.db'));let previous:ReturnType<typeof fromEvents>['header']|undefined;
  const totals=()=>{const rows=readSyncView(verifier).events.filter(row=>row.sessionId===scope.sessionId);return {tokens:rows.reduce((n,row)=>n+row.inputTokens,0),cost:rows.reduce((n,row)=>n+(row.cost??0),0)};};
  const send=async(values:number[],batch:string)=>{let prior=0;const events=values.map((total,i)=>{const delta=total-prior;prior=total;return {eventId:hash([scope.sessionId,i]),source:scope.source,sessionId:scope.sessionId,timestampMs:PHASE0_AT+i,modelName:'phase0-fixture-model',projectKey:'synthetic',projectName:'Synthetic',inputTokens:delta,outputTokens:0,cacheReadTokens:0,cacheCreationTokens:0,reasoningTokens:0};});
    const candidate=fromEvents(events,scope,previous,batch);expect((await http('/batches','POST',{header:candidate.header})).status).toBe(200);expect((await http('/batches/'+batch+'/pages/0','PUT',{records:candidate.records})).status).toBe(200);
    const result=await http('/batches/'+batch+'/commit','POST');if(result.status===200)previous=candidate.header;return result;};
  try{for(const[values,total]of [[[50,100,200],200],[[50,120,200],200],[[50,120,220],220]] as const){expect((await send([...values],'cum-'+values.join('-'))).status).toBe(200);expect(totals().tokens).toBe(total);expect(totals().cost).toBeCloseTo(total/1e6,12);}
    expect((await send([50],'truncated')).status).toBe(409);expect(totals().tokens).toBe(220);
    verifier.rollback(previous!.manifest.generationId,ownerActor);expect(totals().tokens).toBe(200);
    expect((await send([50,120,240],'after-rollback')).status).toBe(409);expect(totals().tokens).toBe(200);
    expect((await http('/batches','POST',{header:{...previous,manifest:{...previous!.manifest,collectorVersion:'unknown'}}})).status).toBe(400);
  }finally{verifier.close();}
});
}
