// Explicit, quiescent isolated-volume experiment; not automatic production maintenance.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,statSync} from 'node:fs';
if(process.env.PHASE2E_MAINTENANCE!=='1')throw Error('EXPLICIT_TEST_MAINTENANCE_REQUIRED');
const path='/fixture/sync/sync.db',db=new DatabaseSync(path);
const counts=()=>Object.fromEntries(['sync_meta','sync_receipts','sync_current','sync_staging','sync_stage_records'].map(table=>[table,Number(db.prepare('SELECT COUNT(*) n FROM '+table).get().n)]));
const revision=()=>Number(db.prepare('SELECT data_revision FROM sync_meta WHERE id=1').get().data_revision);
const wal=()=>{try{return statSync(path+'-wal').size;}catch{return 0;}};
const metrics=()=>JSON.parse(readFileSync('/fixture/phase2e-metrics/next.json','utf8'));
const before={counts:counts(),revision:revision(),walBytes:wal(),metrics:metrics()};
const checkpoint=db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();db.close();
await new Promise(r=>setTimeout(r,1000));
const verify=new DatabaseSync(path,{readOnly:true}),after={counts:Object.fromEntries(Object.keys(before.counts).map(table=>[table,Number(verify.prepare('SELECT COUNT(*) n FROM '+table).get().n)])),revision:Number(verify.prepare('SELECT data_revision FROM sync_meta WHERE id=1').get().data_revision),walBytes:wal(),metrics:metrics()};verify.close();
if(before.revision!==after.revision||JSON.stringify(before.counts)!==JSON.stringify(after.counts)||Number(checkpoint.busy)!==0)throw Error('CHECKPOINT_INVARIANT_FAILED');
writeFileSync('/test/checkpoint-probe.json',JSON.stringify({before,after,checkpoint},null,2));console.log(JSON.stringify({checkpointCompleted:true,beforeWalBytes:before.walBytes,afterWalBytes:after.walBytes,beforeCgroupBytes:before.metrics.current,afterCgroupBytes:after.metrics.current}));
