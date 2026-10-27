// Synthetic pending upload preserved across actual test-process and isolated-service restart.
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {AgentState,SyncEngine,AgentHttp,captureHome} from '../../apps/sync-agent/dist/library.mjs';
import {fixtures as f} from '../../apps/sync-agent/tests/helpers.mjs';
const directory='C:/Users/86139/AppData/Local/Incept/v4-acceptance-20261019';
assert.equal(resolve(process.env.INCEPT_V4_ACCEPTANCE_DIR??''),resolve(directory),'EXACT_PRIVATE_DIRECTORY_REQUIRED');
const phase=process.argv.at(-1);assert(['prepare','resume'].includes(phase),'PHASE_REQUIRED');
const target='http://127.0.0.1:3305',file=join(directory,'pending-restart-report.json');
const configured=JSON.parse(readFileSync(join(directory,'config.json'),'utf8'));
assert.equal(configured.endpoint,target);assert.equal(configured.remote,false);
const token=readFileSync(join(directory,'token.txt'),'utf8').trim();
let report;
if(phase==='prepare'){
 assert(!existsSync(file),'PENDING_RESTART_REPORT_ALREADY_EXISTS');
 report={status:'running',run:randomUUID(),fixtureKind:'synthetic-source-format-fixtures',startedAt:new Date().toISOString(),steps:[]};
}else{report=JSON.parse(readFileSync(file,'utf8'));assert.equal(report.status,'awaiting-process-and-service-restart');}
const root=join(directory,'pending-restart-'+report.run),home=join(root,'fixture-home');
const save=()=>writeFileSync(file,JSON.stringify(report,null,2));
const record=name=>{report.steps.push({name,passed:true});save();console.log(JSON.stringify({step:name,passed:true}));};
if(phase==='prepare')mkdirSync(root,{recursive:false});
let state,server;
try{
 const direct=new AgentHttp(target,token,{allowLoopbackHttp:true});const who=await direct.request('/agent');assert.equal(who.deviceId,configured.deviceId);
 state=new AgentState(join(root,'state'));
 const collect=(sourceHome,allowed,parents)=>captureHome(sourceHome,join(root,'capture-'+randomUUID()),allowed,parents);
 const count=()=>Number(state.db.prepare('SELECT COUNT(*) n FROM outbox').get().n);
 if(phase==='prepare'){
  let offline=false,hits=0;
  server=createServer((req,res)=>{
   if(offline){hits++;req.socket.destroy();return;}
   const upstream=request({hostname:'127.0.0.1',port:3305,path:req.url,method:req.method,headers:{...req.headers,host:'127.0.0.1:3305'}},incoming=>{res.writeHead(incoming.statusCode,incoming.headers);incoming.pipe(res);});
   upstream.on('error',()=>res.destroy());req.pipe(upstream);
  });
  await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',yes);});
  const endpoint='http://127.0.0.1:'+server.address().port;
  const engine=new SyncEngine(state,{...configured,home,allowedSources:['claudeCode'],endpoint},new AgentHttp(endpoint,token,{allowLoopbackHttp:true}),collect);
  f.writePhase0Pricing(home);
  const fixture=count=>f.writePhase0Source(home,'claudeCode',{count,session:'pending-restart-'+report.run,id:'pending-restart-'+report.run,at:f.PHASE0_AT});
  fixture(1);const first=await engine.run();assert.equal(first.sent,1);assert.equal(count(),0);record('independent-synthetic-restart-baseline');
  fixture(2);offline=true;const lost=await engine.run();assert.equal(lost.sent,0);assert(hits>0);assert.equal(count(),1);assert.equal(state.reviewCount(),0);
  const row=state.db.prepare('SELECT batch,next_retry FROM outbox').get();report.batch=row.batch;report.nextRetry=row.next_retry;
  report.receiptCountBefore=Number(state.db.prepare('SELECT COUNT(*) n FROM receipts').get().n);
  report.status='awaiting-process-and-service-restart';record('pending-batch-durable-before-process-exit');
 }else{
  assert.equal(count(),1,'PENDING_UPLOAD_NOT_PRESERVED');assert.equal(state.db.prepare('SELECT batch FROM outbox').get().batch,report.batch);
  const engine=new SyncEngine(state,{...configured,home,allowedSources:['claudeCode'],endpoint:target},direct,collect);
  for(let attempt=0;attempt<8&&count();attempt++){
   const row=state.db.prepare("SELECT MIN(next_retry) at FROM outbox WHERE state='pending'").get();assert(row.at!==null);
   await new Promise(yes=>setTimeout(yes,Math.max(0,Number(row.at)-Date.now())+30));await engine.flush();
  }
  assert.equal(count(),0);assert.equal(state.reviewCount(),0);
  const receipt=state.db.prepare('SELECT json FROM receipts WHERE batch=?').get(report.batch);assert(receipt);
  const remote=await direct.request('/batches/'+report.batch);assert.equal(remote.receipt?.status,'committed');assert.deepEqual(remote.receipt,JSON.parse(receipt.json));
  assert.equal(Number(state.db.prepare('SELECT COUNT(*) n FROM receipts').get().n),report.receiptCountBefore+1);
  const stable=await engine.run();assert.equal(stable.sent,0);assert.equal(stable.reviewNew,0);assert.equal(count(),0);
  report.status='passed';report.completedAt=new Date().toISOString();record('actual-process-and-app-pg-restart-pending-upload-resumed-once');
 }
 save();console.log(JSON.stringify({status:report.status,fixtureKind:report.fixtureKind}));
}catch(error){report.status='failed';report.failure={code:error.name==='AssertionError'?String(error.message).split('\n')[0]:'PENDING_RESTART_OPERATION_FAILED'};save();console.error(JSON.stringify(report.failure));process.exitCode=1;}
finally{state?.close();if(server)await new Promise(yes=>{server.close(yes);server.closeAllConnections();});}
