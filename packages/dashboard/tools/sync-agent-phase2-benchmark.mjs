// Synthetic client only. Never accepts a production DB URL or prints credentials.
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {PrismaClient} from '../../db/generated/client/index.js';
const [baseArg,urlFile,output,container]=process.argv.slice(2),base=new URL(baseArg);
if(!['127.0.0.1','localhost'].includes(base.hostname)||base.protocol!=='http:'||!/^incept-sync-phase2-/.test(container??''))throw new Error('ISOLATED_HTTP_REQUIRED');
const database=(readFileSync(urlFile,'utf8')).trim(),target=new URL(database);
if(target.hostname!=='127.0.0.1'||target.pathname!=='/incept_sync_phase2')throw new Error('ISOLATED_DATABASE_REQUIRED');
const root=fileURLToPath(new URL('../',import.meta.url)),fixtureFile=join(root,'dist/phase2-fixtures.mjs');
await build({entryPoints:[join(root,'src/__tests__/phase1/fixtures.ts')],outfile:fixtureFile,bundle:true,platform:'node',format:'esm',target:'node24',
  plugins:[{name:'fixture-server-marker',setup(builder){builder.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'empty'}));builder.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:'',loader:'js'}));}}]});
const {fromEvents}=await import(new URL('../dist/phase2-fixtures.mjs',import.meta.url));
const prisma=new PrismaClient({datasources:{db:{url:database}},log:[]}),token=randomBytes(32).toString('base64url');
const tokenHash=createHash('sha256').update(token).digest('hex'),api=new URL('/api/dashboard/sync',base).href;
const ownerHeaders={'cookie':'incept-access-session='+token,'origin':base.origin};let session;const devices=[];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function request(path,method='GET',body,authorization,owner=false) {
  const result=await fetch(api+path,{method,headers:{...(owner?ownerHeaders:{}),...(authorization?{Authorization:'Bearer '+authorization}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const json=await result.json();if(!result.ok)throw new Error('HTTP_'+result.status+'_'+String(json.error??'UNEXPECTED'));
  return json;
}
const percentile=(rows,q)=>rows.length?[...rows].sort((a,b)=>a-b)[Math.min(rows.length-1,Math.floor(rows.length*q))]:0;
async function create(size,label) {
  const {device,token}=await request('/devices','POST',{name:'Synthetic '+label},undefined,true);devices.push(device.id);
  const scope={deviceId:device.id,source:'claudeCode',sessionId:'synthetic-'+label,originId:'origin-'+device.id};
  await request('/devices/'+device.id+'/scopes','POST',{source:scope.source,sessionId:scope.sessionId,originId:scope.originId},undefined,true);
  const events=Array.from({length:size},(_,i)=>({eventId:hash([label,i]),source:scope.source,sessionId:scope.sessionId,timestampMs:Date.UTC(2026,9,16)+i,
    modelName:'phase0-fixture-model',projectKey:'synthetic',projectName:'Synthetic',inputTokens:100,outputTokens:20,cacheReadTokens:10,cacheCreationTokens:0,reasoningTokens:0}));
  return {token,...fromEvents(events,scope,undefined,'batch-'+label)};
}
async function upload(candidate) {
  const latencies=[],start=performance.now(),batch=candidate.header.batchId;let bytes=0;
  await request('/batches','POST',{header:candidate.header},candidate.token);
  for(let offset=0;offset<candidate.records.length;offset+=500){const records=candidate.records.slice(offset,offset+500),page={records};bytes+=Buffer.byteLength(JSON.stringify(page));const now=performance.now();
    await request('/batches/'+batch+'/pages/'+offset,'PUT',page,candidate.token);latencies.push(performance.now()-now);}
  const commitStart=performance.now(),committed=await request('/batches/'+batch+'/commit','POST',undefined,candidate.token),commitWallMs=performance.now()-commitStart;
  if(committed.receipt?.status!=='committed')throw new Error('RECEIPT_REQUIRED');
  const observed=await request('/batches/'+batch,'GET',undefined,candidate.token);
  if(observed.receipt.dataRevision!==committed.receipt.dataRevision)throw new Error('REVISION_MISMATCH');
  return {size:candidate.records.length,wallMs:performance.now()-start,commitWallMs,pageCount:latencies.length,pageBodyBytes:bytes,pageP50Ms:percentile(latencies,.5),pageP95Ms:percentile(latencies,.95),revision:committed.receipt.dataRevision};
}
const snapshot=()=>JSON.parse(execFileSync('docker',['exec',container,'cat','/tmp/sync-phase2/loop-metrics.json'],{encoding:'utf8'}));
try {
  await prisma.ownerAccount.upsert({where:{id:'owner'},create:{id:'owner',username:'phase2-fixture',passwordHash:hash('synthetic-no-login'),totpCiphertext:'synthetic-enrolled'},update:{totpCiphertext:'synthetic-enrolled'}});
  const owner=await prisma.ownerAccount.findUniqueOrThrow({where:{id:'owner'}});
  session=await prisma.accessSession.create({data:{role:'owner',ownerAccountId:'owner',credentialVersion:owner.credentialVersion,tokenHash,authenticatedAt:new Date(),expiresAt:new Date(Date.now()+3600_000)}});
  await request('/devices','GET',undefined,undefined,true);
  const proxyProbe=await fetch(api+'/batches',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(1024*1024+1)});
  if(proxyProbe.status!==413)throw new Error('PROXY_BODY_LIMIT_MISMATCH');await proxyProbe.arrayBuffer();
  const measuredAt=new Date().toISOString(),cases=[];
  for(const size of [700,7000,15700,70000]) {
    const candidate=await create(size,'size-'+size),before=snapshot(),cpuBefore=before.cpu;
    const row=await upload(candidate);await new Promise(resolve=>setTimeout(resolve,300));const after=snapshot(),state=await request('/status','GET',undefined,undefined,true);
    cases.push({...row,processCpuMs:((after.cpu.user-cpuBefore.user)+(after.cpu.system-cpuBefore.system))/1000,mainLoopMaxMs:after.maxDelayMs,mainLoopP99Ms:after.p99DelayMs,cgroupPeakBytes:after.cgroupPeakBytes,processRssBytes:after.processRssBytes,workerHeapBytes:state.executor.workerHeapBytes,
      dbBytes:state.capacity.dbBytes,walBytes:state.capacity.walBytes,shmBytes:state.capacity.shmBytes,stagingBytes:state.capacity.stagingLogicalBytes});
    console.log(JSON.stringify({case:'upload',size,wallMs:row.wallMs,commitWallMs:row.commitWallMs,cgroupPeakMiB:after.cgroupPeakBytes/1024**2}));
  }
  const a=await create(15700,'concurrent-a'),b=await create(15700,'concurrent-b'),pages=[];let sampling=true;
  const sample=(async()=>{while(sampling){const now=performance.now();const res=await fetch(new URL('/',base));await res.arrayBuffer();pages.push({status:res.status,wallMs:performance.now()-now});await new Promise(resolve=>setTimeout(resolve,100));}})();
  const start=performance.now(),uploads=await Promise.all([upload(a),upload(b)]);sampling=false;await sample;
  const concurrent={sizes:[15700,15700],wallMs:performance.now()-start,uploads,pageSamples:pages.length,pageFailures:pages.filter(r=>r.status!==200).length,pageP50Ms:percentile(pages.map(r=>r.wallMs),.5),pageP95Ms:percentile(pages.map(r=>r.wallMs),.95),metrics:snapshot()};
  const capacity=await request('/status','GET',undefined,undefined,true);
  const result={measuredAt,node:process.version,server:'Next 16.4.0 API harness; real Owner Cookie, PG and Worker; ordinary page is a harness fixture',containerBudgetMiB:768,proxyBodyLimit:{bytes:1024*1024,probeBytes:1024*1024+1,status:proxyProbe.status},notes:['Client fixture construction excluded from upload wall.','Thread RSS is shared process RSS; workerHeapBytes measures the Worker isolate.','cgroupPeakBytes sampled at 250ms across runtime; includes file cache.','Entire Incept Web build blocked by absent cached build dependencies; not a full-site container acceptance.'],cases,concurrent,capacity};
  writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({written:true,cases:cases.length,concurrentPageFailures:concurrent.pageFailures}));
}finally {
  if(session){await prisma.agentDevice.updateMany({where:{id:{in:devices}},data:{revokedAt:new Date()}});await prisma.accessSession.update({where:{id:session.id},data:{revokedAt:new Date()}});}
  await prisma.$disconnect();
}
