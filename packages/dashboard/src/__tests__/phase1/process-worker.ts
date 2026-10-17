import { readFileSync } from 'node:fs';
import { CompatibleSyncService } from '../../adapters/local/imports/sync/legacy';
import type { SyncActor, SyncHeader, SyncRecord } from '../../domain/sync';
const [action,path,inputPath]=process.argv.slice(2),service=new CompatibleSyncService(path);
if(action==='hold') {
  service.db.exec('BEGIN IMMEDIATE');process.stdout.write('ready\n');setTimeout(()=>{service.db.exec('COMMIT');service.close();},60);
} else {
  try{const input=JSON.parse(readFileSync(inputPath,'utf8')) as {header:SyncHeader;records:SyncRecord[];actor:SyncActor};
    const result=service.ingest(input.header,input.records,input.actor,action==='crash'?{onStage:()=>process.exit(23)}:{});process.stdout.write(JSON.stringify(result));
  }catch{process.exitCode=1;}finally{service.close();}
}
