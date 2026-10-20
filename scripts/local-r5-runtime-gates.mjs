// Authorized local acceptance gates. No historical lineage enumeration or identity changes.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import net from 'node:net';
import {checkV4Isolation} from './check-v4-isolation.mjs';
import {verifyR5ImageIdentity,classifyR5Digest} from '../apps/sync-agent/dist/library.mjs';
const project='incept-v4-acceptance';
const directory='C:/Users/86139/AppData/Local/Incept/v4-acceptance-20261019';
const report={startedAt:new Date().toISOString(),project,status:'running',historical359:'reused; not repeated',steps:[]};
const save=()=>writeFileSync('output/r5-entry-runtime.json',JSON.stringify(report,null,2)+'\n');
function record(name,details={}){report.steps.push({name,passed:true,...details});save();console.log(JSON.stringify({name,passed:true,...details}));}
function docker(args,input){const r=spawnSync('docker',args,{encoding:'utf8',input,windowsHide:true,maxBuffer:8*1024*1024});assert.equal(r.status,0,'LOCAL_DOCKER_CHECK_FAILED');return r.stdout;}
const inspect=name=>JSON.parse(docker(['inspect',`${project}-${name}-1`]))[0];
const probeCode=String.raw`
const fs=require('node:fs'),net=require('node:net'),{Resolver}=require('node:dns').promises;
(async()=>{
 const ipv4=fs.readFileSync('/proc/net/route','utf8').trim().split('\n').slice(1).map(x=>x.trim().split(/\s+/)).filter(x=>x[0]!=='lo'&&x[1]==='00000000'&&x[7]==='00000000');
 const ipv6=fs.readFileSync('/proc/net/ipv6_route','utf8').trim().split('\n').map(x=>x.trim().split(/\s+/)).filter(x=>x.at(-1)!=='lo'&&x[0]==='0'.repeat(32)&&x[1]==='00'&&(parseInt(x[8],16)&1));
 const tcp=await Promise.all(['1.1.1.1','8.8.8.8'].map(host=>new Promise(yes=>{const s=net.connect({host,port:443});let done=false;const end=connected=>{if(done)return;done=true;s.destroy();yes({host,connected});};s.setTimeout(2000,()=>end(false));s.on('connect',()=>end(true));s.on('error',()=>end(false));})));
 const resolver=new Resolver({timeout:1500,tries:1});let externalDns=false;try{externalDns=(await resolver.resolve4('example.com')).length>0;}catch{}
 console.log(JSON.stringify({ipv4DefaultRoutes:ipv4.length,ipv6DefaultRoutes:ipv6.length,tcp,externalDns}));
})().catch(()=>process.exit(1));`;
function rawRequest(raw){return new Promise((yes,no)=>{let reply='';const s=net.connect(3305,'127.0.0.1');s.setTimeout(4000,()=>s.destroy(Error('PROXY_CHECK_TIMEOUT')));s.on('connect',()=>s.write(raw));s.on('data',b=>reply+=b);s.on('error',no);s.on('end',()=>yes(reply));});}
try{
 assert.equal(resolve(process.env.INCEPT_V4_ACCEPTANCE_DIR??''),resolve(directory),'EXACT_PRIVATE_DIRECTORY_REQUIRED');
 const rendered=JSON.parse(docker(['compose','--project-name',project,'--env-file',join(directory,'acceptance.env'),'-f','deployment/compose.v4-acceptance.json','config','--format','json']));
 checkV4Isolation(rendered);
 const containers=Object.fromEntries(['entry','app','postgres'].map(name=>[name,inspect(name)]));
 for(const [name,c]of Object.entries(containers)){
  assert.equal(c.Config.Labels['com.docker.compose.project'],project);assert.equal(c.State.Health.Status,'healthy',`${name}_NOT_HEALTHY`);
  const expected=name==='app'?['acceptance','app_entry']:name==='postgres'?['acceptance']:['app_entry','ingress'];
  assert.deepEqual(Object.keys(c.NetworkSettings.Networks).sort(),expected.map(x=>`${project}_${x}`).sort());
  const bindings=Object.entries(c.NetworkSettings.Ports??{}).filter(([,v])=>v?.length);
  assert.deepEqual(bindings,name==='entry'?[['8080/tcp',[{HostIp:'127.0.0.1',HostPort:'3305'}]]]:[],'RUNTIME_PORT_MISMATCH');
 }
 for(const name of ['acceptance','app_entry','ingress']){
  const [n]=JSON.parse(docker(['network','inspect',`${project}_${name}`]));assert.equal(n.Internal,name!=='ingress');
  const expected=name==='acceptance'?['app','postgres']:name==='app_entry'?['app','entry']:['entry'];
  assert.deepEqual(Object.keys(n.Containers).sort(),expected.map(x=>containers[x].Id).sort());
 }
 const entry=containers.entry;
 assert.equal(entry.HostConfig.ReadonlyRootfs,true);assert.deepEqual(entry.HostConfig.CapDrop,['ALL']);assert(!entry.HostConfig.CapAdd?.length);
 assert(entry.HostConfig.SecurityOpt.includes('no-new-privileges:true'));assert.equal(entry.Config.User,'1000:1000');
 assert.equal(entry.Mounts.length,1);assert.equal(entry.Mounts[0].RW,false);assert.equal(entry.Mounts[0].Destination,'/entry/v4-http-entry.mjs');
 const forwarding=JSON.parse(docker(['exec',entry.Id,'node','-e',"const f=require('node:fs');console.log(JSON.stringify(['/proc/sys/net/ipv4/ip_forward','/proc/sys/net/ipv6/conf/all/forwarding'].map(p=>f.readFileSync(p,'utf8').trim())))"]));
 assert.deepEqual(forwarding,['0','0']);record('actual-loopback-port-network-membership-and-entry-forwarding');
 const response=await fetch('http://127.0.0.1:3305/api/health/ready',{signal:AbortSignal.timeout(10000)});assert(response.ok,'HTTP_READY_FAILED');
 const token=readFileSync(join(directory,'token.txt'),'utf8').trim();const local=JSON.parse(readFileSync(join(directory,'config.json'),'utf8'));
 const identity=await fetch('http://127.0.0.1:3305/api/dashboard/sync/agent',{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
 assert(identity.ok,'HTTP_IDENTITY_FAILED');const who=await identity.json();assert.equal(who.deviceId,local.deviceId);assert.deepEqual([...who.allowedSources].sort(),[...local.allowedSources].sort());
 const query="SELECT current_database() AS database, current_user AS role, rolsuper, rolcreatedb, rolcreaterole, rolreplication FROM pg_roles WHERE rolname=current_user";
 const dbCode="const{PrismaClient}=require('/app/packages/db/generated/client/index.js');const p=new PrismaClient();p.$queryRawUnsafe("+JSON.stringify(query)+").then(x=>console.log(JSON.stringify(x))).finally(()=>p.$disconnect())";
 const [db]=JSON.parse(docker(['exec',containers.app.Id,'node','-e',dbCode]));assert.equal(db.database,'incept_v4_acceptance');assert.equal(db.role,'incept_v4_acceptance');
 for(const key of ['rolsuper','rolcreatedb','rolcreaterole','rolreplication'])assert.equal(db[key],false);
 const [image]=JSON.parse(docker(['image','inspect','--platform','linux/amd64',containers.app.Config.Image]));
 const graph=JSON.parse(readFileSync('output/r5-image-evidence.json','utf8'));graph.observed={id:image.Id,os:image.Os,architecture:image.Architecture,rootfsDiffIds:image.RootFS.Layers};
 assert(verifyR5ImageIdentity(graph).passed,'R5_RUNNING_IMAGE_GRAPH_FAILED');assert(classifyR5Digest(containers.app.Image),'CONTAINER_IMAGE_MISMATCH');
 record('http-ready-device-seven-sources-actual-app-database-and-r5-image-identity',{deviceId:who.deviceId,database:db.database,role:db.role});
 for(const name of ['app','postgres']){
  const args=name==='app'?['exec',containers.app.Id,'node','-e',probeCode]:['run','--rm','--pull','never','--network',`container:${containers.postgres.Id}`,'--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','64m','--memory-swap','64m','--cpus','0.25','--pids-limit','32','--entrypoint','node',rendered.services.entry.image,'-e',probeCode];
  const isolation=JSON.parse(docker(args));record(`${name}-egress-observation`,isolation);
  assert.equal(isolation.ipv4DefaultRoutes,0,'EXTERNAL_IPV4_DEFAULT_ROUTE');assert.equal(isolation.ipv6DefaultRoutes,0,'EXTERNAL_IPV6_DEFAULT_ROUTE');
  assert(isolation.tcp.every(x=>!x.connected),'EXTERNAL_TCP_REACHABLE');assert.equal(isolation.externalDns,false,'EXTERNAL_DNS_REACHABLE');
 }
 assert.match(await rawRequest('CONNECT 1.1.1.1:443 HTTP/1.1\r\nHost: 1.1.1.1:443\r\n\r\n'),/^HTTP\/1\.1 405/);
 assert.match(await rawRequest('GET http://1.1.1.1/ HTTP/1.1\r\nHost: 1.1.1.1\r\nConnection: close\r\n\r\n'),/^HTTP\/1\.1 400/);
 record('app-pg-egress-blocked-and-proxy-tunnels-rejected');report.status='passed';report.completedAt=new Date().toISOString();save();
}catch(error){report.status='failed';report.failure={code:error.name==='AssertionError'?String(error.message).split('\n')[0]:'RUNTIME_GATE_OPERATION_FAILED'};save();console.error(JSON.stringify(report.failure));process.exitCode=1;}
