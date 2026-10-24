import {expect,it} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {capacityState,guardCapacity,memoryPressure,checkpointWal} from '../sync/capacity';
import {DEFAULT_CAPACITY} from '../sync/protocol';
import {SyncExecutor} from '../sync/executor';
import {CompatibleSyncService} from '../adapters/local/imports/sync/legacy';
import {fromEvents} from './phase1/fixtures';
import {hash} from '../adapters/local/imports/identity';
const owner={role:'owner' as const,subject:'owner',reason:'isolated Phase5 acceptance'};
it('cgroup pressure and DB/WAL/SHM admission return retryable protection without changing records',()=>{
  expect(memoryPressure(p=>p.endsWith('current')?'90':'100')).toEqual({currentBytes:90,maximumBytes:100,percent:90});
  expect(memoryPressure(()=> 'max')).toBeNull();
  const dir=mkdtempSync(join(tmpdir(),'phase5-pressure-')),path=join(dir,'store.db'),service=new CompatibleSyncService(path);
  try{
    const revision=service.revision(),memory={currentBytes:90,maximumBytes:100,percent:90};
    expect(()=>guardCapacity(capacityState(path,service.db,DEFAULT_CAPACITY,10*1024**3,memory))).toThrow('MEMORY_PRESSURE');
    expect(()=>guardCapacity(capacityState(path,service.db,{...DEFAULT_CAPACITY,maxStoreBytes:1},10*1024**3,null))).toThrow('STORE_CAPACITY');
    expect(service.revision()).toBe(revision);expect(service.db.prepare('SELECT count(*) n FROM sync_receipts').get()!.n).toBe(0);
  }finally{service.close();rmSync(dir,{recursive:true,force:true});}
});
it('bounded checkpoint respects a live reader then shrinks WAL without changing receipts or logical data',()=>{
  const dir=mkdtempSync(join(tmpdir(),'phase5-checkpoint-')),path=join(dir,'store.db'),service=new CompatibleSyncService(path),reader=new DatabaseSync(path);
  try{
    const scope={deviceId:'fixture',source:'claudeCode' as const,sessionId:'s',originId:'o'};
    service.register(scope,'fixture',owner);const c=fromEvents([{eventId:hash('event-1'),source:'claudeCode',sessionId:'s',timestampMs:Date.now(),modelName:'m',projectKey:'p',projectName:'p',inputTokens:100,outputTokens:0,cacheReadTokens:0,cacheCreationTokens:0,reasoningTokens:0}],scope,undefined,'b');
    service.ingest(c.header,c.records,owner);reader.exec('BEGIN');reader.prepare('SELECT * FROM sync_meta').all();
    service.db.exec("INSERT INTO sync_audit(operation,reference,actor_json,data_revision) VALUES('fixture','f','{}',0)");
    const fingerprint=()=>JSON.stringify({revision:service.revision(),receipts:service.db.prepare('SELECT * FROM sync_receipts').all(),clock:service.db.prepare('SELECT * FROM sync_receipt_clock').all(),current:service.db.prepare('SELECT * FROM sync_current').all(),adoptions:service.db.prepare('SELECT * FROM sync_adoptions').all()});
    const before=fingerprint();expect(checkpointWal(service.db).state).toBe('busy');expect(fingerprint()).toBe(before);
    reader.exec('ROLLBACK');expect(checkpointWal(service.db).state).toBe('checkpointed');expect(fingerprint()).toBe(before);
    expect(capacityState(path,service.db).walBytes).toBe(0);
  }finally{reader.close();service.close();rmSync(dir,{recursive:true,force:true});}
});
it('large new batches defer with 429 while an existing committed receipt is still readable after restart',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'phase5-batch-')),path=join(dir,'store.db'),scope={deviceId:'fixture',source:'claudeCode' as const,sessionId:'s',originId:'o'};
  let executor=new SyncExecutor(path,{policy:{...DEFAULT_CAPACITY,maxBatchRecords:1}});
  try{
    const events=[1,2].map(i=>({eventId:hash('event-'+i),source:'claudeCode' as const,sessionId:'s',timestampMs:Date.now(),modelName:'m',projectKey:'p',projectName:'p',inputTokens:100,outputTokens:0,cacheReadTokens:0,cacheCreationTokens:0,reasoningTokens:0}));
    await executor.execute({op:'register',scope,label:'fixture',actor:owner});const good=fromEvents(events.slice(0,1),scope,undefined,'good'),large=fromEvents(events,scope,undefined,'large');
    await executor.execute({op:'begin',header:good.header,actor:{role:'device',deviceId:'fixture'}});await executor.execute({op:'stage',device:'fixture',batch:'good',offset:0,records:good.records,actor:owner});const committed=await executor.execute({op:'commit',device:'fixture',batch:'good',actor:owner});
    await expect(executor.execute({op:'begin',header:large.header,actor:{role:'device',deviceId:'fixture'}})).rejects.toMatchObject({code:'LARGE_BATCH_DEFERRED',status:429,retryAfter:300});
    await executor.close();executor=new SyncExecutor(path);expect((await executor.execute<{receipt:unknown}>({op:'status',device:'fixture',batch:'good',actor:{role:'device',deviceId:'fixture'}})).receipt).toEqual((committed as {receipt:unknown}).receipt);
  }finally{await executor.close();rmSync(dir,{recursive:true,force:true});}
});
