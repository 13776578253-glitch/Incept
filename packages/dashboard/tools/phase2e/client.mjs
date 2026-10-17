// Full-site synthetic acceptance driver. Credentials/raw fixture payloads stay in
// an ignored mounted directory; benchmark output contains measurements only.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fixtures} from './fixtures.mjs';
import {DatabaseSync} from 'node:sqlite';
const [mode,label='case']=process.argv.slice(2),base=new URL(process.env.PHASE2E_BASE??'http://phase2e-proxy:8080');
if(!['phase2e-proxy','127.0.0.1'].includes(base.hostname)||base.protocol!=='http:')throw Error('ISOLATED_HTTP_REQUIRED');
const f=await fixtures(),privateFile='/test/private-fixture.json',secret=JSON.parse(readFileSync(privateFile,'utf8'));
const api='/api/dashboard/sync',jar=secret.cookies??{},hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const percentile=(rows,q)=>rows.length?[...rows].sort((a,b)=>a-b)[Math.min(rows.length-1,Math.floor(rows.length*q))]:null;
const summary=rows=>({samples:rows.length,failures:rows.filter(r=>r.status!==r.expected).length,p50Ms:percentile(rows.map(r=>r.ms),.5),p95Ms:percentile(rows.map(r=>r.ms),.95),maxMs:Math.max(0,...rows.map(r=>r.ms))});
async function raw(path,{method='GET',body,token,owner=false,headers={}}={}){
  const start=performance.now();
  const res=await fetch(new URL(path,base),{method,headers:{...(owner?{cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join('; '),origin:base.origin}:{}),...(token?{authorization:'Bearer '+token}:{}),...(body!==undefined?{'content-type':'application/json'}:{}),...headers},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body),signal:AbortSignal.timeout(40_000)});
  const text=await res.text();let json;try{json=JSON.parse(text);}catch{}
  if(owner)for(const cookie of res.headers.getSetCookie()){const [pair]=cookie.split(';'),i=pair.indexOf('=');jar[pair.slice(0,i)]=pair.slice(i+1);}
  return {status:res.status,json,text,ms:performance.now()-start,retryAfter:res.headers.get('retry-after')};
}
async function ok(path,opts){const r=await raw(path,opts);if(r.status<200||r.status>=300)throw Error('HTTP_'+r.status+'_'+path+'_'+(r.json?.error??'response'));return r.json;}
const owner=(path,method='GET',body)=>ok(api+path,{method,body,owner:true});
async function create(count,name){
  const d=await owner('/devices','POST',{name:'Synthetic '+name}),scope={deviceId:d.device.id,source:'claudeCode',sessionId:'synthetic-'+name,originId:'origin-'+d.device.id};
  await owner('/devices/'+d.device.id+'/scopes','POST',{source:scope.source,sessionId:scope.sessionId,originId:scope.originId});
  const events=Array.from({length:count},(_,i)=>({eventId:hash([name,i]),source:scope.source,sessionId:scope.sessionId,timestampMs:Date.UTC(2026,9,16)+i,modelName:'phase0-fixture-model',projectKey:'synthetic',projectName:'Synthetic',inputTokens:100,outputTokens:20,cacheReadTokens:10,cacheCreationTokens:0,reasoningTokens:0}));
  return {token:d.token,id:d.device.id,...f.fromEvents(events,scope,undefined,'batch-'+name)};
}
const batch=c=>api+'/batches/'+c.header.batchId;
const begin=c=>ok(api+'/batches',{method:'POST',body:{header:c.header},token:c.token});
const page=(c,offset)=>ok(batch(c)+'/pages/'+offset,{method:'PUT',body:{records:c.records.slice(offset,offset+500)},token:c.token});
const commit=c=>ok(batch(c)+'/commit',{method:'POST',token:c.token});
const state=c=>ok(batch(c),{token:c.token});
async function upload(c){
  const start=performance.now(),pages=[];await begin(c);
  for(let offset=0;offset<c.records.length;offset+=500){const t=performance.now();await page(c,offset);pages.push(performance.now()-t);}
  const t=performance.now(),r=await commit(c),commitMs=performance.now()-t;
  if(r.receipt?.status!=='committed')throw Error('COMMITTED_RECEIPT_REQUIRED');
  if((await state(c)).receipt?.dataRevision!==r.receipt.dataRevision)throw Error('RECEIPT_REVISION_MISMATCH');
  return {events:c.records.length,pageCount:pages.length,pageBodyBytes:Buffer.byteLength(JSON.stringify({records:c.records.slice(0,500)})),wallMs:performance.now()-start,commitMs,pageP50Ms:percentile(pages,.5),pageP95Ms:percentile(pages,.95),revision:r.receipt.dataRevision};
}
const routes=[['/en',false],['/zh',false],['/en/dashboard',false],['/zh/dashboard',true],['/en/settings',true],['/zh/settings',true],['/en/operations',true],['/zh/operations',false],['/en/docs',false],['/zh/docs/phase2e-guest',false],['/en/tools/playback',false],['/api/music/tracks',false],['/api/auth/owner/state',true],[api+'/devices',true],[api+'/status',true],['/api/dashboard/usage?range=30d',true]];
function metrics(){try{return JSON.parse(readFileSync('/fixture/phase2e-metrics/next.json','utf8'));}catch{return null;}}
async function pagesFor(duration,active){const rows=[],resources=[];const start=performance.now();
  const flows=process.env.PHASE2E_INDEPENDENT_PROBES==='1'?[routes.filter(([p])=>!p.startsWith('/api/')),routes.filter(([p])=>p.startsWith('/api/'))]:[routes];
  await Promise.all(flows.map(async(flow,flowIndex)=>{let i=0;while(performance.now()-start<duration||active?.()){
    const [path,owner]=flow[i++%flow.length];let r;
    try{r=await raw(path,{owner});}catch{r={status:0,ms:40_000};}
    rows.push({path,owner,status:r.status,expected:200,ms:r.ms,flow:flowIndex,uploadActive:!!active?.(),...(path===api+'/status'&&r.json?{workerHeapBytes:r.json.executor?.workerHeapBytes,queueLength:r.json.executor?.queueLength,running:r.json.executor?.running}:{})});
    const m=metrics();if(m)resources.push(m);
    await sleep(flows.length===1?100:flowIndex===0?100:350);
  }}));
  return {rows,resources};
}
function reportSamples(s){return {all:summary(s.rows),duringUpload:summary(s.rows.filter(r=>r.uploadActive)),byRoute:routes.map(([path,owner])=>({path,owner,...summary(s.rows.filter(r=>r.path===path&&r.owner===owner))})),rawSamples:s.rows,resources:s.resources};}
let result;
if(mode==='login'){
  const login=await ok('/api/auth/owner/login',{method:'POST',body:{username:secret.username,password:secret.password},owner:true,headers:{'user-agent':'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0.0.0 Safari/537.36'}});
  if(login.stage!=='totp')throw Error('TOTP_CHALLENGE_REQUIRED_'+login.stage);
  const verified=await ok('/api/auth/owner/verify',{method:'POST',body:{code:f.totpAt(secret.secret,Math.floor(Date.now()/30000)),trustDevice:true},owner:true});
  if(verified.stage==='approval'){
    secret.cookies=jar;secret.challengeId=verified.challengeId;writeFileSync(privateFile,JSON.stringify(secret));
    writeFileSync('/test/login-pending.json',JSON.stringify({approvalRequired:true}));
    console.log(JSON.stringify({approvalRequired:true}));process.exit(0);
  }
  if(verified.stage!=='complete'||!jar['incept-access-session'])throw Error('OWNER_COOKIE_REQUIRED');
  secret.cookies=jar;writeFileSync(privateFile,JSON.stringify(secret));
  result={passwordTotpLogin:true,realNextCookie:true,ownerRole:(await ok('/api/auth/owner/state',{owner:true})).role};
}else if(mode==='reauth'){
  const r=await ok('/api/auth/owner/reauthenticate',{method:'POST',body:{password:secret.password,code:f.totpAt(secret.secret,Math.floor(Date.now()/30000))},owner:true});
  if(!r.authenticated)throw Error('RECENT_OWNER_AUTH_REQUIRED');result={reauthenticated:true};
}else if(mode==='approve'){
  const approval=JSON.parse(readFileSync('/test/private-approval.json','utf8'));
  const verified=await ok('/api/auth/owner/verify',{method:'POST',body:{code:approval.code,trustDevice:true},owner:true});
  if(verified.stage!=='complete'||!jar['incept-access-session'])throw Error('OWNER_COOKIE_REQUIRED');
  secret.cookies=jar;writeFileSync(privateFile,JSON.stringify(secret));result={passwordTotpLogin:true,offlineApproval:true,realNextCookie:true,ownerRole:(await ok('/api/auth/owner/state',{owner:true})).role};
}else if(mode==='baseline'||mode==='post'){
  const idle=metrics(),samples=await pagesFor(30_000);result={idle,...reportSamples(samples),status:await owner('/status')};
}else if(mode==='round'||mode==='stress'){
  const sizes=mode==='round'?[15700,15700]:[70000],cs=[];
  for(let i=0;i<sizes.length;i++)cs.push(await create(sizes[i],label+'-'+i));
  const start=performance.now(),before=metrics();let active=true;
  const samples=pagesFor(30_000,()=>active);
  const uploads=await Promise.all(cs.map(upload)).finally(()=>{active=false;});
  result={sizes,uploads,wallMs:performance.now()-start,before,...reportSamples(await samples),status:await owner('/status')};
}else if(mode==='assets'){
  const paths=new Set(['/icon.svg','/api/music/media/'+'a'.repeat(64)+'.wav']);
  for(const path of ['/en','/zh/dashboard','/en/settings','/zh/operations','/en/docs/phase2e-guest']){
    const r=await raw(path,{owner:true});if(r.status!==200)throw Error('REAL_PAGE_REQUIRED_'+path);
    for(const match of r.text.matchAll(/(?:src|href)="([^"#]+)"/g))if(match[1].startsWith('/_next/static/'))paths.add(match[1].replaceAll('&amp;','&'));
  }
  const rows=[];for(const path of paths){const r=await raw(path);rows.push({path,status:r.status,expected:200,ms:r.ms,bytes:Buffer.byteLength(r.text)});}
  writeFileSync('/test/assets-preflight.json',JSON.stringify(rows,null,2));
  if(rows.some(r=>r.status!==200))throw Error('STATIC_ASSET_FAILED');result={...summary(rows),assets:rows};
}else if(mode==='security'){
  const c=await create(1,'security-'+label),rows=[];
  async function check(name,path,opts,expected){const r=await raw(path,opts);rows.push({name,status:r.status,expected,retryAfter:r.retryAfter});if(r.status!==expected)throw Error('SECURITY_'+name+'_'+r.status);return r;}
  await check('proxy-1MiB',api+'/batches',{method:'POST',body:'x'.repeat(1048577)},413);
  await check('no-token',api+'/batches',{method:'POST',body:{header:c.header}},401);
  await check('device-owner-management',api+'/devices',{token:c.token},403);
  await check('owner-cross-origin',api+'/devices',{method:'POST',body:{name:'Forbidden'},owner:true,headers:{origin:'https://other.invalid'}},403);
  await check('guest-imports','/api/dashboard/imports',{},404);
  await check('guest-refresh','/api/dashboard/usage?refresh=1',{},403);
  await check('guest-private-doc','/en/docs/phase2e-private',{},404);
  await check('owner-private-doc','/en/docs/phase2e-private',{owner:true},200);
  await begin(c);await page(c,0);const first=await commit(c);
  for(let i=0;i<100;i++)if(JSON.stringify((await commit(c)).receipt)!==JSON.stringify(first.receipt))throw Error('RETRY_RECEIPT_CHANGED');
  const other=await create(1,'other-'+label);
  await check('cross-device',api+'/batches',{method:'POST',body:{header:c.header},token:other.token},403);
  const changed=f.fromEvents(c.records.map(r=>({...r.event,inputTokens:101})),c.header.manifest.scope,undefined,c.header.batchId);
  await check('same-batch-different-payload',api+'/batches',{method:'POST',body:{header:changed.header},token:c.token},409);
  await check('actor-injection',api+'/batches',{method:'POST',body:{header:other.header,actor:{role:'owner'}},token:other.token},400);
  const wide=await create(500,'wide-'+label),size=Buffer.byteLength(JSON.stringify(wide.records)),length=9+Math.floor((512*1024-2000-size)/500);
  const replacement=f.fromEvents(wide.records.map(r=>({...r.event,projectName:'P'.repeat(length)})),wide.header.manifest.scope,undefined,wide.header.batchId);Object.assign(wide,replacement);
  await begin(wide);const legal=await check('near-512KiB',batch(wide)+'/pages/0',{method:'PUT',body:{records:wide.records},token:wide.token},200);
  const legalBytes=Buffer.byteLength(JSON.stringify({records:wide.records}));if(legalBytes<508*1024||legalBytes>512*1024)throw Error('LEGAL_PAGE_SIZE');
  await owner('/devices/'+other.id,'DELETE');await check('revoked',batch(other),{token:other.token},401);
  const rate=await create(1,'rate-'+label);let r;let attempts=0;do{r=await raw(api+'/batches/missing',{token:rate.token});attempts++;}while(r.status!==429&&attempts<190);
  if(r.status!==429||!r.retryAfter)throw Error('RATE_LIMIT_REQUIRED');rows.push({name:'device-rate',status:r.status,expected:429,attempts,retryAfter:r.retryAfter});
  result={checks:rows,retries:100,receiptStable:true,legalPageBytes:legalBytes,legalPageMs:legal.ms};
}else if(mode==='cleanup-verify'){
  const viewer=await ok('/api/auth/owner/state',{owner:true});
  const management=await raw(api+'/devices',{owner:true});
  const old=JSON.parse(readFileSync('/test/recovery-restart.json','utf8'));
  const device=await raw(batch(old),{token:old.token});
  if(viewer.role!=='guest'||management.status!==403||device.status!==401)throw Error('ISOLATED_CREDENTIAL_CLEANUP_FAILED');
  result={ownerRole:viewer.role,managementStatus:management.status,revokedDeviceStatus:device.status};
}else if(mode==='parity'){
  process.env.INCEPT_DASHBOARD_IMPORTS_FILE='/fixture/dashboard/imports.db';
  process.env.INCEPT_DASHBOARD_OVERRIDES_FILE='/fixture/dashboard/overrides.json';
  const windows=[];
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).filter(k=>k!=='checkedAt').sort().map(k=>[k,canonical(value[k])])):value;
  for(const range of ['7d','30d','all']){
    const expected=await f.loadTokenDashboardData({home:'/fixture/dashboard',range,force:true});
    const actual=await ok('/api/dashboard/usage?range='+range,{owner:true});
    if(JSON.stringify(canonical(expected))!==JSON.stringify(canonical(actual))){writeFileSync('/test/parity-difference-private.json',JSON.stringify({expected,actual}));throw Error('FULL_OBJECT_PARITY_'+range);}
    windows.push({range,fullObjectDifferences:0,totalTokens:actual.totals.totalTokens,cost:actual.totals.cost,sessions:actual.totals.sessionCount});await sleep(600);
  }
  result={windows,excludedVolatileFields:['checkedAt'],defaultRead:'v1',v2UploadNotCounted:true};
}else if(mode==='busy'){
  const c=await create(1,'busy-'+label);await begin(c);await page(c,0);const before=await state(c);
  const db=new DatabaseSync('/fixture/sync/sync.db');db.exec('PRAGMA busy_timeout=25; BEGIN IMMEDIATE');
  let rejected;try{rejected=await raw(batch(c)+'/commit',{method:'POST',token:c.token});}finally{db.exec('ROLLBACK');db.close();}
  if(rejected.status!==503||!rejected.retryAfter)throw Error('BUSY_RETRYABLE_REQUIRED');
  const retained=await state(c);if(retained.nextOffset!==1||retained.receipt||retained.dataRevision!==before.dataRevision)throw Error('BUSY_STATE_LOST');
  const recovered=await commit(c);if(recovered.receipt?.status!=='committed')throw Error('BUSY_RECOVERY_FAILED');
  result={rejectedStatus:503,error:rejected.json?.error,retryAfter:rejected.retryAfter,retainedOffset:retained.nextOffset,unchangedRevision:true,recoveredReceipt:true};
}else if(mode==='recovery-prepare'){
  const c=await create(700,'recovery-'+label);await begin(c);await page(c,0);writeFileSync('/test/recovery-'+label+'.json',JSON.stringify(c));result={staged:true,offset:(await state(c)).nextOffset,metrics:metrics()};
}else if(mode==='recovery-resume'||mode==='recovery-verify'){
  const c=JSON.parse(readFileSync('/test/recovery-'+label+'.json','utf8')),before=await state(c);
  if(mode==='recovery-resume'){if(before.receipt||before.nextOffset!==500)throw Error('STAGE_NOT_RECOVERED');await page(c,500);const r=await commit(c);writeFileSync('/test/receipt-'+label+'.json',JSON.stringify(r.receipt));result={before,receipt:r.receipt};}
  else {const expected=JSON.parse(readFileSync('/test/receipt-'+label+'.json','utf8')),r=await commit(c);if(JSON.stringify(r.receipt)!==JSON.stringify(expected))throw Error('LOST_ACK_NOT_IDEMPOTENT');result={receiptStable:true,receipt:r.receipt};}
}else throw Error('UNKNOWN_MODE');
writeFileSync('/test/'+mode+'-'+label+'.json',JSON.stringify({mode,label,at:new Date().toISOString(),...result},null,2)+'\n');
console.log(JSON.stringify({mode,label,completed:true,...(result.all?{requests:result.all.samples,failures:result.all.failures,p95Ms:result.all.p95Ms}:{} )}));
