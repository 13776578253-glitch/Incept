import {join,resolve} from 'node:path';
import {homedir,tmpdir} from 'node:os';
import {existsSync,readdirSync,rmSync,appendFileSync,statSync,renameSync,readFileSync,mkdtempSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {AgentState,SyncEngine,AgentHttp,validateEndpoint,scopeKey,captureHome,buildCandidate,type Config} from './engine';
import {hash} from '../../../packages/dashboard/src/adapters/local/imports/identity';
import {readConfig,storeToken,loadToken,protectDirectory,atomicJson} from './credentials';
import {acquireInstance,isRunning} from './lifecycle';
import {RemoteLink} from './remote';
import {publishStatus} from './snapshot';
import {resumeReviewed} from './review';
import {reconcileHeads} from './review';
import {resumeHeld} from './resume';
import {verifyLineage} from './verify-lineage';
const argv=process.argv.slice(2),command=argv[0],option=(key:string)=>{const i=argv.indexOf('--'+key);return i<0?undefined:argv[i+1];};
const directory=resolve(option('state')??join(process.env.LOCALAPPDATA??homedir(),'Incept','sync-agent'));
const output=(v:unknown)=>console.log(JSON.stringify(v));
function log(code:string){const file=join(directory,'agent.log');try{if(existsSync(file)&&statSync(file).size>512*1024){for(let i=2;i>=0;i--){const from=i?file+'.'+i:file;if(existsSync(from))renameSync(from,file+'.'+(i+1));}}appendFileSync(file,JSON.stringify({at:new Date().toISOString(),code})+'\n',{mode:0o600});}catch{}}
async function stdinToken(){let value='';for await(const chunk of process.stdin){value+=chunk.toString();if(value.length>256)throw Error('TOKEN_INPUT_LIMIT');}return value.trim();}
async function main(){
  if(command==='version'){output({version:'0.1.0',node:process.version});return;}
  if(command==='status'){if(!existsSync(join(directory,'config.json'))){output({configured:false,running:false,paused:false});return;}const state=new AgentState(directory);try{const running=await isRunning(directory);output({configured:true,...state.status(),running,paused:state.get('paused')===true,remoteOnline:running&&state.get('remoteOnline')===true});}finally{state.close();}return;}
  if(command==='pause'||command==='resume'){
    if(!existsSync(join(directory,'config.json')))throw Error('AGENT_NOT_CONFIGURED');
    const state=new AgentState(directory);try{const paused=command==='pause';state.set('paused',paused);publishStatus(state,await isRunning(directory),true);output({paused});}finally{state.close();}return;
  }
  if(command==='quarantine-status'){
    if(await isRunning(directory))throw Error('STOP_AGENT_FOR_MAINTENANCE');
    const state=new AgentState(directory);try{output({isolations:state.sessionIsolations()});}finally{state.close();}return;
  }
  if(command==='recover-session'){
    if(await isRunning(directory))throw Error('STOP_AGENT_FOR_MAINTENANCE');
    const source=option('source'),sessionId=option('session'),afterTimestampMs=Date.parse(option('after')??'');
    if(source!=='codex'||!sessionId||!Number.isSafeInteger(afterTimestampMs)||afterTimestampMs<=0)throw Error('RECOVERY_SESSION_AND_ANCHOR_REQUIRED');
    const config=readConfig<Config>(directory);if(!config.allowedSources.includes(source))throw Error('SOURCE_NOT_AUTHORIZED');
    const state=new AgentState(directory);try{
      const problems=state.sessionIsolations().filter(item=>item.active&&item.source===source&&item.sessionId===sessionId);
      if(!problems.length||problems.some(item=>!['OPENING_PREFIX_MISSING','OPENING_USAGE_UNCERTAIN'].includes(item.reason)
        ||item.recoveryAfterTimestampMs===undefined||afterTimestampMs<item.recoveryAfterTimestampMs))throw Error('RECOVERY_ANCHOR_NOT_VERIFIED');
      const parent=state.tail(scopeKey(source,sessionId))?.parent;
      if(parent&&!parent.proofs.every(proof=>proof.recoveryAfterTimestampMs===afterTimestampMs))throw Error('EXISTING_LINEAGE_RECOVERY_REQUIRES_REVIEW');
      state.set('recoveryRanges',[...state.recoveryRanges().filter(item=>item.source!==source||item.sessionId!==sessionId),{source,sessionId,afterTimestampMs}]);
      output({recoveryConfigured:true,source,sessionId,afterTimestampMs,historicalGapRetained:true});
    }finally{state.close();}return;
  }
  if(command==='resume-reviewed'){
    if(!argv.includes('--confirm-reviewed'))throw Error('OWNER_REVIEW_CONFIRMATION_REQUIRED');
    if(await isRunning(directory))throw Error('STOP_AGENT_FOR_MAINTENANCE');
    const batch=option('batch');if(!batch||!/^[a-zA-Z0-9_-]{1,128}$/.test(batch))throw Error('BATCH_REQUIRED');
    const state=new AgentState(directory),config=readConfig<Config>(directory);
    try{output(await resumeReviewed(state,new AgentHttp(config.endpoint,loadToken(directory),{allowLoopbackHttp:config.allowLoopbackHttp}),batch));}finally{state.close();}return;
  }
  if(command==='resume-held'){
    if(!argv.includes('--confirm-reviewed'))throw Error('OWNER_REVIEW_CONFIRMATION_REQUIRED');
    if(await isRunning(directory))throw Error('STOP_AGENT_FOR_MAINTENANCE');
    const batch=option('batch');if(!batch||!/^[a-zA-Z0-9_-]{1,128}$/.test(batch))throw Error('BATCH_REQUIRED');
    const state=new AgentState(directory),config=readConfig<Config>(directory);
    try{output(await resumeHeld(state,new AgentHttp(config.endpoint,loadToken(directory),{allowLoopbackHttp:config.allowLoopbackHttp}),config,batch));}finally{state.close();}return;
  }
  if(command==='reconcile-heads'){
    if(!argv.includes('--confirm-reviewed'))throw Error('OWNER_REVIEW_CONFIRMATION_REQUIRED');
    if(await isRunning(directory))throw Error('STOP_AGENT_FOR_MAINTENANCE');
    const state=new AgentState(directory),config=readConfig<Config>(directory);
    try{output(await reconcileHeads(state,new AgentHttp(config.endpoint,loadToken(directory),{allowLoopbackHttp:config.allowLoopbackHttp}),{session:option('session')}));}finally{state.close();}return;
  }
  if(command==='export-review'){
    if(await isRunning(directory))throw Error('STOP_AGENT_FOR_MAINTENANCE');
    const batch=option('batch');if(!batch||!/^[a-zA-Z0-9_-]{1,128}$/.test(batch))throw Error('BATCH_REQUIRED');
    const state=new AgentState(directory);
    try{const row=state.db.prepare("SELECT header_json FROM outbox WHERE batch=? AND state='review'").get(batch);if(!row)throw Error('REVIEW_BATCH_REQUIRED');
      const header=JSON.parse(String(row.header_json)),records=[];if(header.manifest.recordCount>20000)throw Error('REVIEW_EXPORT_LIMIT');
      for(let offset=0;offset<header.manifest.recordCount;){const page=state.page(batch,offset);if(!page.length)throw Error('REVIEW_RECORDS_MISSING');records.push(...page);offset+=page.length;}
      atomicJson(join(directory,'review-'+batch+'.json'),{header,records});output({exported:true,manifest:header.manifest.manifestHash});
    }finally{state.close();}return;
  }
  if(command==='export-rebase'){
    if(await isRunning(directory))throw Error('STOP_AGENT_FOR_MAINTENANCE');
    const config=readConfig<Config>(directory),source=option('source') as Config['allowedSources'][number]|undefined;
    const sessions=(option('sessions')??option('session')??'').split(',').map(value=>value.trim()).filter(Boolean);
    if(!source||!sessions.length||!config.allowedSources.includes(source))throw Error('REBASE_SCOPE_REQUIRED');
    const singleOut=option('out')?resolve(option('out')!):undefined;
    if(singleOut&&sessions.length!==1)throw Error('SINGLE_REBASE_OUTPUT_ONLY');
    const snapshot=mkdtempSync(join(tmpdir(),'incept-rebase-'));
    try{
      const result=await captureHome(config.home,snapshot,[source],[],{sessionIds:sessions}),exported=[];
      for(const sessionId of sessions){
        const capture=result.captures.find(item=>item.source===source&&item.sessionId===sessionId);
        if(!capture)throw Error('REBASE_SOURCE_UNAVAILABLE:'+sessionId);
        const scope={deviceId:config.deviceId,source:capture.source,sessionId:capture.sessionId,originId:hash(['incept-origin/1',capture.source,capture.sessionId])};
        const candidate=buildCandidate(capture,scope,undefined,randomUUID());
        if(!candidate.records.length)throw Error('REBASE_SOURCE_EMPTY:'+sessionId);
        const outPath=singleOut??join(directory,'rebase-'+source+'-'+hash([source,sessionId]).slice(0,12)+'.json');
        atomicJson(outPath,{exportedAt:new Date().toISOString(),source:capture.source,sessionId:capture.sessionId,header:candidate.header,records:candidate.records,issues:result.issues});
        exported.push({sessionId,path:outPath,records:candidate.records.length,manifest:candidate.header.manifest.manifestHash,commitment:candidate.header.manifest.ranges.map(range=>range.commitment??null)});
      }
      output({exported:exported.length,files:exported});
    }finally{rmSync(snapshot,{recursive:true,force:true});}return;
  }
  if(command==='sync-now'||command==='stop'){if(!await isRunning(directory))throw Error('AGENT_NOT_RUNNING');const state=new AgentState(directory);try{const id=randomUUID();state.db.prepare("INSERT INTO commands VALUES(?,?,'pending',?)").run(id,command==='stop'?'stop':'sync',Date.now());output({requestId:id,queued:true});}finally{state.close();}return;}
  if(command==='bind'){
    if(!argv.includes('--token-stdin'))throw Error('USE_BIND_POWERSHELL_OR_TOKEN_STDIN');
    const endpoint=validateEndpoint(option('endpoint')??'',argv.includes('--allow-loopback-http')),home=resolve(option('home')??homedir()),token=await stdinToken();
    if(!/^isync_[A-Za-z0-9_-]{43}$/.test(token))throw Error('INVALID_DEVICE_TOKEN');
    const identity=await new AgentHttp(endpoint,token,{allowLoopbackHttp:argv.includes('--allow-loopback-http')}).request('/agent');
    if(typeof identity.deviceId!=='string'||!Array.isArray(identity.allowedSources))throw Error('INVALID_DEVICE_IDENTITY');
    if(existsSync(join(directory,'config.json'))){const old=readConfig<Config>(directory);if(old.deviceId!==identity.deviceId||old.endpoint!==endpoint||old.home!==home)throw Error('BINDING_CHANGE_REQUIRES_NEW_STATE');}
    protectDirectory(directory);storeToken(directory,token);const config:Config={version:1,endpoint,home,deviceId:identity.deviceId,allowedSources:identity.allowedSources,...(argv.includes('--allow-loopback-http')?{allowLoopbackHttp:true}:{}),...(argv.includes('--allow-incomplete')?{allowIncomplete:true}:{})};
    if(argv.includes('--remote'))config.remote=true;atomicJson(join(directory,'config.json'),config);const state=new AgentState(directory);state.close();output({bound:true,deviceId:config.deviceId,allowedSources:config.allowedSources,remote:!!config.remote});return;
  }
  if(command==='supervise'){
    let stopped=false,attempt=0;const stopSupervisor=()=>{stopped=true;try{const state=new AgentState(directory);try{state.db.prepare("INSERT INTO commands VALUES(?,?,'pending',?)").run(randomUUID(),'stop',Date.now());}finally{state.close();}}catch{}};process.once('SIGTERM',stopSupervisor);process.once('SIGINT',stopSupervisor);
    while(!stopped){const start=Date.now();const code=await new Promise<number>(yes=>{const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'daemon','--state',directory],{windowsHide:true,stdio:'ignore',env:{...process.env,INCEPT_AGENT_SUPERVISOR_PID:String(process.pid)}});child.once('exit',code=>yes(code??1));child.once('error',()=>yes(1));});
      if(code===0)break;attempt=Date.now()-start>300000?0:attempt+1;await new Promise(r=>setTimeout(r,Math.min(60000,1000*2**Math.min(attempt,6))));}return;
  }
  if(command==='verify-lineage'){
    const snapshot=option('snapshot');if(!snapshot)throw Error('REMOTE_SNAPSHOT_REQUIRED');
    if(argv.includes('--online')===argv.includes('--snapshot-only'))throw Error('VERIFICATION_MODE_REQUIRED');
    if(await isRunning(directory))throw Error('STOP_AGENT_FOR_MAINTENANCE');
    const config=readConfig<Config>(directory),lock=await acquireInstance(directory);lock.unref();
    try{const db=new DatabaseSync(join(directory,'state.db'),{readOnly:true});
      try{db.exec('BEGIN');const http=argv.includes('--snapshot-only')?undefined:new AgentHttp(config.endpoint,loadToken(directory),{allowLoopbackHttp:config.allowLoopbackHttp});
        const result=await verifyLineage(db,JSON.parse(readFileSync(resolve(snapshot),'utf8')),config,http?(path,method,body)=>http.request(path,method,body):undefined);
        output(result);if(!result.passed)process.exitCode=2;return;
      }finally{db.close();}
    }finally{await new Promise<void>(yes=>lock.close(()=>yes()));}
  }
  if(!['run-once','daemon','flush'].includes(command))throw Error('COMMAND_REQUIRED');
  const [major,minor]=process.versions.node.split('.').map(Number);if(major!==24||minor<15)throw Error('NODE_24_15_REQUIRED');
  protectDirectory(directory);const lock=await acquireInstance(directory);lock.unref();
  const state=new AgentState(directory);let config=readConfig<Config>(directory);const abort=new AbortController();
  // Only our own disposable local snapshots are removed. Source HOME is read-only.
  for(const item of readdirSync(directory))if(/^capture-[a-f0-9-]{36}$/.test(item))rmSync(join(directory,item),{recursive:true,force:true});
  const token=loadToken(directory),http=new AgentHttp(config.endpoint,token,{allowLoopbackHttp:config.allowLoopbackHttp,signal:abort.signal});
  // Owner may widen/narrow sources without rotating the device token. Refresh the
  // cached policy at startup; a running Agent picks it up on its next restart.
  try{const identity=await http.request<{deviceId:string;allowedSources:string[]}>('/agent');
    if(identity.deviceId===config.deviceId&&Array.isArray(identity.allowedSources)&&JSON.stringify([...identity.allowedSources].sort())!==JSON.stringify([...config.allowedSources].sort())){
      config={...config,allowedSources:identity.allowedSources as Config['allowedSources']};atomicJson(join(directory,'config.json'),config);
    }
  }catch{/* Keep the last verified local policy while offline. */}
  const engine=new SyncEngine(state,config,http);
  let remote:RemoteLink|undefined;
  let timer:NodeJS.Timeout|undefined,job:Promise<unknown>|undefined,stopping=false,next=0;
  const stop=()=>{stopping=true;remote?.stop();abort.abort();if(timer)clearInterval(timer);};process.once('SIGINT',stop);process.once('SIGTERM',stop);
  state.db.exec("UPDATE commands SET state='pending' WHERE state='running'");
  const tick=()=>{const parent=Number(process.env.INCEPT_AGENT_SUPERVISOR_PID);if(Number.isSafeInteger(parent)&&parent>0){try{process.kill(parent,0);}catch{stop();return;}}state.set('heartbeat',{pid:process.pid,at:Date.now(),rssBytes:process.memoryUsage().rss,cpu:process.cpuUsage()});publishStatus(state);const commands=state.db.prepare("SELECT id,kind FROM commands WHERE state='pending'").all();
    if(commands.some(c=>c.kind==='stop')){state.db.prepare("UPDATE commands SET state='done' WHERE kind='stop'").run();stop();return;}
    if(job||stopping)return;const paused=state.get<boolean>('paused')===true;if(paused&&!commands.some(c=>c.kind==='sync'))return;void remote?.discover();if(Date.now()<next&&!commands.length&&!remote?.hasPending())return;
    state.db.prepare("DELETE FROM commands WHERE state IN ('done','failed') AND at<?").run(Date.now()-86400000);state.db.prepare("UPDATE commands SET state='running' WHERE state='pending' AND kind='sync'").run();
    next=Date.now()+300000;log('COLLECTING');job=(remote?.hasPending()?remote.execute(()=>engine.run(abort.signal)):engine.run(abort.signal)).then(()=>{log('CYCLE_FINISHED');state.db.prepare("UPDATE commands SET state='done' WHERE state='running'").run();}).catch(()=>{state.set('lastErrorCode','CYCLE_FAILED');state.set('lastErrorAt',new Date().toISOString());log('CYCLE_FAILED');state.db.prepare("UPDATE commands SET state='failed' WHERE state='running'").run();}).finally(()=>{job=undefined;});};
  try{
    if(command==='flush'){const result=await engine.flush(abort.signal);output(result);if(state.pending().length||state.db.prepare('SELECT 1 FROM outbox LIMIT 1').get())process.exitCode=2;}
    else if(command==='run-once'){const result=await engine.run(abort.signal);output(result);if(result&&typeof result==='object'&&'outcome' in result&&result.outcome==='source_failed'||state.pending().length||state.db.prepare('SELECT 1 FROM outbox LIMIT 1').get())process.exitCode=2;}
    else {if(config.remote){remote=new RemoteLink(state,config,http,token,()=>{next=0;});remote.start();}timer=setInterval(tick,1000);tick();while(!stopping)await new Promise(r=>setTimeout(r,100));await job;}
  }finally{remote?.stop();if(timer)clearInterval(timer);await job;state.set('heartbeat',null);publishStatus(state,false,true);state.close();await new Promise<void>(yes=>lock.close(()=>yes()));}
}
main().catch(error=>{const code=typeof error?.message==='string'&&/^[A-Z][A-Z0-9_]{0,80}$/.test(error.message)?error.message:'AGENT_COMMAND_FAILED';if(process.env.INCEPT_CAPTURE_DEBUG)console.error(error);if(command==='daemon')log(code);output({error:code});process.exitCode=code==='ALREADY_RUNNING'&&command!=='verify-lineage'?0:1;});
