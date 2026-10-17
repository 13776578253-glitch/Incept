// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
vi.mock('server-only',()=>({}));
import {writePhase0Source,writePhase0Pricing} from '../../../../../../packages/dashboard/src/__tests__/fixtures/sync-agent-phase0';
const base=process.env.INCEPT_FULLSITE_PHASE4_URL,app=process.env.INCEPT_FULLSITE_PHASE4_APP_CONTAINER;
const real=base&&app?it:it.skip,root=resolve(import.meta.dirname,'../../../../../..'),cli=join(root,'apps/sync-agent/dist/agent.mjs');
async function subprocess(bin:string,args:string[],input?:string){const p=spawn(bin,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='';p.stdout.on('data',b=>stdout+=String(b));p.stderr.resume();p.stdin.end(input??'');const code=await new Promise<number|null>(yes=>p.once('exit',yes));if(code)throw Error('SUBPROCESS_FAILED');return stdout;}
const wait=async(fn:()=>Promise<boolean>,ms=60000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,250));}throw Error('FULLSITE_TIMEOUT');};
real('production Next + Nginx TLS + standalone Gateway + real Windows Agent update v2 Dashboard from Owner HTTP',async()=>{
  const url=new URL(base!);if(url.hostname!=='127.0.0.1'||!/^incept-phase4-/.test(app!))throw Error('ISOLATED_FULLSITE_REQUIRED');
  const cookie=randomBytes(32).toString('base64url'),directory=mkdtempSync(join(tmpdir(),'incept-phase4-fullsite-')),home=join(directory,'home'),state=join(directory,'state');let daemon:ChildProcess|undefined;
  const http=(path:string,method='GET',body?:unknown,authorized=true)=>fetch(base+path,{method,headers:{...(authorized?{cookie:'incept-access-session='+cookie}:{}),origin:base!,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
  try{
    await wait(async()=>{try{return (await fetch(base+'/en')).status===200;}catch{return false;}},30000);
    await subprocess('docker',['exec','-i','-e','INCEPT_PHASE4_FIXTURE=1',app!,'node','packages/dashboard/tools/phase4/seed.mjs'],JSON.stringify({cookie}));
    const registered=await http('/api/dashboard/sync/devices','POST',{name:'Full site Windows',allowedSources:['claudeCode']});expect(registered.status).toBe(201);const {token,device}=await registered.json();
    const baselineResponse=await http('/api/dashboard/usage?range=all');expect(baselineResponse.status).toBe(200);const baseline=(await baselineResponse.json()).totals.totalTokens,session='fullsite-'+device.id;
    writePhase0Pricing(home);writePhase0Source(home,'claudeCode',{count:1,session});await subprocess(process.execPath,[cli,'bind','--endpoint',base!,'--home',home,'--state',state,'--remote','--token-stdin'],token);
    daemon=spawn(process.execPath,[cli,'daemon','--state',state],{windowsHide:true,stdio:'ignore'});
    await wait(async()=>{const r=await http('/api/dashboard/sync/devices/status');if(!r.ok)return false;return (await r.json()).devices.some((d:{id:string;online:boolean})=>d.id===device.id&&d.online);});
    await wait(async()=>{const r=await http('/api/dashboard/usage?range=all');return r.ok&&(await r.json()).totals.totalTokens===baseline+130;});
    writePhase0Source(home,'claudeCode',{count:2,session});const trigger=await http('/api/dashboard/sync/jobs','POST',{deviceId:device.id,idempotencyKey:randomUUID()});expect(trigger.status).toBe(202);const created=await trigger.json();let completed:{status:string;dataRevision:number}|undefined;
    await wait(async()=>{const r=await http('/api/dashboard/sync/jobs/'+created.job.id);completed=(await r.json()).job;return !!completed&&!['queued','dispatched','running'].includes(completed.status);});expect(completed!.status).toBe('completed');
    const windows=[];for(const range of ['7d','30d','all']){const r=await http('/api/dashboard/usage?range='+range+'&minRevision='+completed!.dataRevision);expect(r.status).toBe(200);const dto=await r.json();expect(dto.sync.readMode).toBe('v2');expect(dto.sync.dataRevision).toBeGreaterThanOrEqual(completed!.dataRevision);expect(dto.totals.totalTokens).toBe(baseline+260);windows.push({range,baseline,tokens:dto.totals.totalTokens,revision:dto.sync.dataRevision});}
    expect((await http('/api/internal/sync/check','POST',{})).status).toBe(404);expect((await http('/rpc/status','POST',{})).status).toBe(404);expect((await http('/api/dashboard/sync/jobs/'+created.job.id,'GET',undefined,false)).status).toBe(403);
    const pages=[];for(const path of ['/en/dashboard','/zh/dashboard','/en/settings','/en/docs','/en/tools/playback']){const response=await http(path);const body=await response.text();expect(response.status).toBe(200);pages.push({path,status:response.status,bytes:Buffer.byteLength(body)});}
    writePhase0Source(home,'claudeCode',{count:3,session});const again=await http('/api/dashboard/sync/jobs','POST',{deviceId:device.id,idempotencyKey:randomUUID()});expect(again.status).toBe(202);const restartId=(await again.json()).job.id;
    await subprocess('docker',['restart',app!]);let recovered:{status:string;dataRevision:number}|undefined;
    await wait(async()=>{try{const r=await http('/api/dashboard/sync/jobs/'+restartId);if(!r.ok)return false;recovered=(await r.json()).job;return !!recovered&&!['queued','dispatched','running'].includes(recovered.status);}catch{return false;}},90000);expect(recovered!.status).toBe('completed');
    const afterRestart=await (await http('/api/dashboard/usage?range=all&minRevision='+recovered!.dataRevision)).json();expect(afterRestart.totals.totalTokens).toBe(baseline+390);expect(afterRestart.sync.dataRevision).toBeGreaterThanOrEqual(recovered!.dataRevision);
    mkdirSync(join(root,'.scratch/sync-agent-phase4'),{recursive:true});writeFileSync(join(root,'.scratch/sync-agent-phase4/fullsite-evidence.json'),JSON.stringify({jobId:created.job.id,status:completed!.status,dataRevision:completed!.dataRevision,windows,pages,restart:{jobId:restartId,status:recovered!.status,dataRevision:recovered!.dataRevision,tokens:afterRestart.totals.totalTokens,baseline},privateRpcBlocked:true,unauthorizedOwnerRejected:true,transport:'Windows → Nginx TLS/WSS → standalone Gateway/Next production build'},null,2));
  }finally{if(daemon?.exitCode===null){try{await subprocess(process.execPath,[cli,'stop','--state',state]);await wait(async()=>daemon!.exitCode!==null,15000);}catch{daemon.kill();}}rmSync(directory,{recursive:true,force:true});}
},150000);
