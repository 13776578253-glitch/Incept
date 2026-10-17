import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,statSync,lstatSync,existsSync} from 'node:fs';
import {isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function v1State(path){if(!existsSync(path))return digest([]);const db=new DatabaseSync(path,{readOnly:true});try{return digest(db.prepare('SELECT id,checksum,receipt FROM batches ORDER BY id').all().map(row=>[row.id,row.checksum,JSON.parse(String(row.receipt)).status]));}finally{db.close();}}
function envValue(text,key){
  const matches=[...text.matchAll(new RegExp('^'+key+'=(.*)$','gm'))].map(match=>match[1].replace(/\r$/,'').trim());
  if(matches.length>1)throw Error('DUPLICATE_CONFIG_KEY');
  return matches[0];
}
export function syncStage(options){
  const stages={disabled:['0','0','v1'],upload:['1','1','v1'],shadow:['1','1','shadow'],v2:['1','1','v2']};
  const values=stages[options.stage];if(!values)throw Error('STAGE_INVALID');
  if(!isAbsolute(options.envFile)||lstatSync(options.envFile).isSymbolicLink())throw Error('EXPLICIT_ENV_FILE_REQUIRED');
  const envText=readFileSync(options.envFile,'utf8');
  if(options.stage!=='disabled'&&!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(options.device??''))throw Error('SINGLE_DEVICE_REQUIRED');
  if(options.stage==='v2'){
    if(![options.report,options.v1,options.v2].every(p=>typeof p==='string'&&isAbsolute(p)))throw Error('COMPARISON_PATHS_REQUIRED');
    const v1=resolve(options.v1),v2=resolve(options.v2);if(v1===v2)throw Error('DISTINCT_COMPARISON_DATABASES_REQUIRED');
    const configuredV1=envValue(envText,'INCEPT_DASHBOARD_IMPORTS_FILE'),configuredV2=envValue(envText,'INCEPT_SYNC_DATABASE_FILE');
    if(!configuredV1||!configuredV2||!isAbsolute(configuredV1)||!isAbsolute(configuredV2)||resolve(configuredV1)!==v1||resolve(configuredV2)!==v2)throw Error('ENV_COMPARISON_PATH_MISMATCH');
    const report=JSON.parse(readFileSync(options.report,'utf8')),age=Date.now()-Date.parse(report.generatedAt);
    if(!report.ok||!Number.isFinite(age)||age<0||age>300000||!Array.isArray(report.ranges)||report.ranges.length!==3||!['7d','30d','all'].every(range=>report.ranges.some(r=>r.range===range&&r.equal&&r.difference===null)))throw Error('ZERO_DIFFERENCE_REPORT_REQUIRED');
    const db=new DatabaseSync(options.v2,{readOnly:true});let revision;try{revision=Number(db.prepare('SELECT data_revision FROM sync_meta').get().data_revision);}finally{db.close();}
    if(revision!==report.revision||v1State(options.v1)!==report.v1StateHash)throw Error('COMPARISON_STALE');
  }
  const changes={INCEPT_SYNC_ENABLED:values[0],INCEPT_SYNC_REMOTE_ENABLED:values[1],INCEPT_SYNC_READ_MODE:values[2],...(options.device?{INCEPT_SYNC_DEVICE_ALLOWLIST:options.device}:{})};
  if(options.apply){
    if(!options.ownerConfirmed)throw Error('OWNER_CONFIRMATION_REQUIRED');
    let text=envText;for(const [key,value] of Object.entries(changes)){
      const pattern=new RegExp('^'+key+'=.*$','gm'),matches=text.match(pattern);if(matches?.length>1)throw Error('DUPLICATE_CONFIG_KEY');
      text=matches?text.replace(pattern,key+'='+value):text.replace(/\s*$/,'')+'\n'+key+'='+value+'\n';
    }
    const temporary=options.envFile+'.phase5-'+process.pid;
    writeFileSync(temporary,text,{flag:'wx',mode:statSync(options.envFile).mode&0o777});renameSync(temporary,options.envFile);
  }
  return {stage:options.stage,applied:!!options.apply,syncEnabled:values[0],remoteEnabled:values[1],readMode:values[2]};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const options={};for(const arg of process.argv.slice(2)){if(arg==='--apply')options.apply=true;else if(arg==='--owner-confirm')options.ownerConfirmed=true;else{const at=arg.indexOf('=');if(!arg.startsWith('--')||at<0)throw Error('ARGUMENT_INVALID');const names={'env-file':'envFile',stage:'stage',device:'device',report:'report',v1:'v1',v2:'v2'},name=names[arg.slice(2,at)];if(!name)throw Error('ARGUMENT_INVALID');options[name]=arg.slice(at+1);}}
  try{console.log(JSON.stringify(syncStage(options)));}catch{console.error('{"error":"SYNC_STAGE_REJECTED"}');process.exitCode=1;}
}
