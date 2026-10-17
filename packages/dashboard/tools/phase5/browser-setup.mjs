// Local synthetic acceptance helper. Never accepts a production hostname.
import {createRequire} from 'node:module';
import {randomBytes,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
const root=resolve(fileURLToPath(new URL('../../../../',import.meta.url))),out=join(root,'.scratch/sync-agent-phase5'),file=join(out,'browser-control.json'),cli=join(root,'apps/sync-agent/dist/agent.mjs');
const op=process.argv[2],base=process.env.INCEPT_PHASE5_URL??'https://localhost:18555',app='incept-phase5-01a1447b-app-1';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname)||new URL(base).port!=='18555')throw Error('ISOLATED_PHASE5_ONLY');
mkdirSync(out,{recursive:true});
const {build}=createRequire(new URL('../../package.json',import.meta.url))('esbuild');
await build({stdin:{contents:"export {writePhase0Source,writePhase0Pricing} from './packages/dashboard/src/__tests__/fixtures/sync-agent-phase0';",resolveDir:root,loader:'ts'},outfile:join(out,'browser-fixtures.mjs'),bundle:true,platform:'node',format:'esm',plugins:[{name:'node',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'stub',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:''}));}}]});
const f=await import(pathToFileURL(join(out,'browser-fixtures.mjs')).href);
const run=(args,input)=>execFileSync(process.execPath,[cli,...args],{input,windowsHide:true,encoding:'utf8',stdio:['pipe','pipe','pipe']});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
if(op==='prepare'){
  if(existsSync(file))throw Error('ACCEPTANCE_ALREADY_PREPARED');
  const directory=mkdtempSync(join(tmpdir(),'incept-phase5-browser-')),home=join(directory,'home'),state=join(directory,'state'),cookie=randomBytes(32).toString('base64url'),session='phase5-browser-synthetic';
  execFileSync('docker',['exec','-i','-e','INCEPT_PHASE5_FIXTURE=1',app,'node','packages/dashboard/tools/phase5/seed.mjs'],{input:JSON.stringify({cookie}),windowsHide:true,stdio:['pipe','pipe','pipe']});
  const registered=await fetch(base+'/api/dashboard/sync/devices',{method:'POST',headers:{cookie:'incept-access-session='+cookie,origin:base,'content-type':'application/json'},body:JSON.stringify({name:'Phase5 Windows canary',legacyDeviceId:'00000000-0000-4000-8000-000000000005',allowedSources:['claudeCode','geminiCli']})});
  if(registered.status!==201)throw Error('DEVICE_SETUP_FAILED_'+registered.status);const {token}=await registered.json();
  f.writePhase0Pricing(home);f.writePhase0Source(home,'claudeCode',{count:15700,session});f.writePhase0Source(home,'geminiCli',{count:2,session});
  run(['bind','--endpoint',base,'--home',home,'--state',state,'--remote','--token-stdin'],token);
  const child=spawn(process.execPath,[cli,'daemon','--state',state],{windowsHide:true,stdio:'ignore'});child.unref();
  const original=JSON.parse(readFileSync(process.env.INCEPT_PHASE5_BROWSER_CONFIG,'utf8'));original.browser.contextOptions.storageState={cookies:[{name:'incept-access-session',value:cookie,domain:'localhost',path:'/',httpOnly:true,secure:true,sameSite:'Lax',expires:Math.floor(Date.now()/1000)+3600}],origins:[]};
  writeFileSync(join(out,'browser-owner.config.json'),JSON.stringify(original),{mode:0o600});writeFileSync(file,JSON.stringify({home,state,session,pid:child.pid,count:15700,cookie,base}),{mode:0o600});
  const deadline=Date.now()+180000;let status;
  while(Date.now()<deadline){status=JSON.parse(run(['status','--state',state]));if(status.remoteOnline&&status.confirmedScopes===2&&!status.outbox.length)break;await pause(500);}
  if(!status?.remoteOnline||status.confirmedScopes!==2||status.outbox.length)throw Error('INITIAL_UPLOAD_NOT_CONFIRMED');
  console.log(JSON.stringify({prepared:true,confirmedScopes:status.confirmedScopes,receipts:status.receiptCount,dataRevision:status.dataRevision,records:15702}));
}else{
  const c=JSON.parse(readFileSync(file,'utf8'));
  if(op==='renew-session'){
    const old=c.cookie;c.cookie=randomBytes(32).toString('base64url');execFileSync('docker',['exec','-i','-e','INCEPT_PHASE5_FIXTURE=1',app,'node','packages/dashboard/tools/phase5/seed.mjs'],{input:JSON.stringify({cookie:c.cookie,revokeHash:createHash('sha256').update(old).digest('hex')}),windowsHide:true,stdio:['pipe','pipe','pipe']});
    const config=JSON.parse(readFileSync(join(out,'browser-owner.config.json'),'utf8'));config.browser.contextOptions.storageState.cookies[0].value=c.cookie;writeFileSync(join(out,'browser-owner.config.json'),JSON.stringify(config),{mode:0o600});writeFileSync(file,JSON.stringify(c),{mode:0o600});console.log('{"oldSyntheticSessionRevoked":true}');
  }
  else if(op==='serve'){
    const child=spawn(process.execPath,[cli,'daemon','--state',c.state],{windowsHide:true,stdio:'ignore'});console.log('{"syntheticAgentStarted":true}');await new Promise(resolve=>child.once('exit',resolve));
  }
  else if(op==='append'){const n=Number(process.argv[3]??1);if(!Number.isInteger(n)||n<1||n>100)throw Error('APPEND_LIMIT');c.count+=n;f.writePhase0Source(c.home,'claudeCode',{count:c.count,session:c.session});writeFileSync(file,JSON.stringify(c),{mode:0o600});console.log(JSON.stringify({syntheticAppend:true,records:c.count}));}
  else if(op==='conflict'){f.writePhase0Source(c.home,'geminiCli',{count:1,session:c.session});console.log('{"syntheticPrefixLoss":true}');}
  else if(op==='stop'){run(['stop','--state',c.state]);console.log('{"stopRequested":true}');}
  else if(op==='status'){const status=JSON.parse(run(['status','--state',c.state]));console.log(JSON.stringify({running:status.running,remoteOnline:status.remoteOnline,confirmedScopes:status.confirmedScopes,receiptCount:status.receiptCount,dataRevision:status.dataRevision,outbox:status.outbox}));}
  else if(op==='probe'){
    const startedAt=new Date().toISOString();
    const rows=[];for(let i=0;i<15;i++){for(const path of ['/en/docs','/en/tools/playback','/en/operations']){const at=performance.now();try{const response=await fetch(base+path,{headers:{cookie:'incept-access-session='+c.cookie}});await response.arrayBuffer();rows.push({path,status:response.status,ms:performance.now()-at});}catch{rows.push({path,status:0,ms:performance.now()-at});}}await pause(500);}
    const ordered=[...rows].sort((a,b)=>a.ms-b.ms);const report={startedAt,endedAt:new Date().toISOString(),samples:rows.length,errors:rows.filter(r=>r.status!==200).length,p50Ms:ordered[Math.floor(rows.length*.5)].ms,p95Ms:ordered[Math.floor(rows.length*.95)].ms,rows};writeFileSync(join(out,'page-probe.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({samples:report.samples,errors:report.errors,p50Ms:report.p50Ms,p95Ms:report.p95Ms}));
  }else throw Error('UNKNOWN_ACCEPTANCE_ACTION');
}
