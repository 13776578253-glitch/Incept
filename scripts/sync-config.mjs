import {isAbsolute,resolve} from 'node:path';
import {lstatSync,readFileSync} from 'node:fs';

export function validateSyncConfiguration(env=process.env) {
  for(const name of ['INCEPT_SYNC_ENABLED','INCEPT_SYNC_REMOTE_ENABLED'])if(env[name]!==undefined&&!['0','1'].includes(env[name]))throw Error('SYNC_FLAG_INVALID');
  if(!['v1','shadow','v2'].includes(env.INCEPT_SYNC_READ_MODE??'v1'))throw Error('SYNC_READ_MODE_INVALID');
  const enabled=env.INCEPT_SYNC_ENABLED==='1',remote=env.INCEPT_SYNC_REMOTE_ENABLED==='1';
  if(!enabled){if(remote||(env.INCEPT_SYNC_READ_MODE??'v1')!=='v1')throw Error('SYNC_DISABLED_CONFIG_CONFLICT');return;}
  if(!env.INCEPT_SYNC_DATABASE_FILE||!isAbsolute(env.INCEPT_SYNC_DATABASE_FILE)||resolve(env.INCEPT_SYNC_DATABASE_FILE)===resolve(env.INCEPT_DASHBOARD_IMPORTS_FILE??''))throw Error('SYNC_DISTINCT_DATABASE_REQUIRED');
  if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(env.INCEPT_SYNC_DEVICE_ALLOWLIST??''))throw Error('SYNC_SINGLE_CANARY_REQUIRED');
  const poll=Number(env.INCEPT_SYNC_POLL_MS??300000),queue=Number(env.INCEPT_SYNC_MAX_QUEUE??4),batch=Number(env.INCEPT_SYNC_MAX_BATCH_RECORDS??20000),memory=Number(env.INCEPT_SYNC_MEMORY_PERCENT??85);
  if(!Number.isInteger(poll)||poll<300000||poll>600000)throw Error('SYNC_POLL_INVALID');
  if(!Number.isInteger(queue)||queue<1||queue>64)throw Error('SYNC_QUEUE_INVALID');
  if(!Number.isInteger(batch)||batch<1||batch>20000)throw Error('SYNC_BATCH_INVALID');
  if(!Number.isInteger(memory)||memory<50||memory>95)throw Error('SYNC_MEMORY_PERCENT_INVALID');
  const size=(name,fallback)=>{const value=Number(env[name]??fallback);if(!Number.isSafeInteger(value)||value<0)throw Error('SYNC_DISK_LIMIT_INVALID');return value;};
  const warn=size('INCEPT_SYNC_WARN_BYTES',1024**3),review=size('INCEPT_SYNC_REVIEW_BYTES',2*1024**3);
  const freeWarn=size('INCEPT_SYNC_WARN_FREE_BYTES',5*1024**3),freeReject=size('INCEPT_SYNC_REJECT_FREE_BYTES',2*1024**3);
  if(size('INCEPT_SYNC_MAX_STORE_BYTES',4*1024**3)<1||warn>review||freeReject>freeWarn)throw Error('SYNC_DISK_LIMIT_INVALID');
  if(remote){
    const file=env.INCEPT_SYNC_RPC_KEY_FILE;
    if(!file||!isAbsolute(file))throw Error('SYNC_SECRET_FILE_REQUIRED');
    const entry=lstatSync(file);if(!entry.isFile()||entry.isSymbolicLink())throw Error('SYNC_SECRET_FILE_INVALID');
    const key=readFileSync(file,'utf8').trim();
    if(!/^[a-f\d]{64,128}$/i.test(key)||/^(.)\1+$/.test(key))throw Error('SYNC_SECRET_INVALID');
    const gateway=new URL(env.INCEPT_SYNC_GATEWAY_INTERNAL_URL??'');if(gateway.protocol!=='http:'||gateway.hostname!=='sync-gateway'||gateway.port!=='3101'||gateway.username||gateway.password||gateway.search)throw Error('SYNC_INTERNAL_GATEWAY_REQUIRED');
  }
}
