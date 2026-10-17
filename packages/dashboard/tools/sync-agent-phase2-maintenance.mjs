// Offline, explicit operator invocation. No production defaults or credential IO.
import {SyncExecutor} from '../dist/sync-executor.mjs';
import {isAbsolute} from 'node:path';
const [database,sourceCopy,maxArg='1']=process.argv.slice(2),maxBatches=Number(maxArg);
if(process.env.INCEPT_SYNC_MAINTENANCE!=='1'||process.env.INCEPT_SYNC_ENABLED==='1'||!database||!sourceCopy||!isAbsolute(database)||!isAbsolute(sourceCopy)||database===sourceCopy)throw new Error('OFFLINE_EXPLICIT_COPY_REQUIRED');
const executor=new SyncExecutor(database,{timeoutMs:120000});
try {const result=await executor.execute({op:'migrate',sourcePath:sourceCopy,maxBatches,actor:{role:'owner',subject:'offline-operator',reason:'explicit isolated copy migration'}});console.log(JSON.stringify(result));}
finally {await executor.close();}
