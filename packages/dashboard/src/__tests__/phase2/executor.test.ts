import {afterEach,beforeEach,expect,it} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {SyncExecutor} from '../../sync/executor';
import {DEFAULT_CAPACITY} from '../../sync/protocol';
import {capacityState,guardCapacity} from '../../sync/capacity';
import {fromEvents} from '../phase1/fixtures';
import {hash} from '../../adapters/local/imports/identity';
let home:string;const executors:SyncExecutor[]=[];
const owner={role:'owner' as const,subject:'fixture-owner',reason:'isolated executor'},device={role:'device' as const,deviceId:'fixture-device'};
const scope={deviceId:device.deviceId,source:'claudeCode' as const,sessionId:'synthetic-session',originId:'synthetic-origin'};
const candidate=(batch:string)=>fromEvents([{eventId:hash('fixture'),source:scope.source,sessionId:scope.sessionId,timestampMs:Date.UTC(2026,9,16),modelName:'phase0-fixture-model',projectKey:'synthetic',projectName:'Synthetic',inputTokens:100,outputTokens:0,cacheReadTokens:0,cacheCreationTokens:0,reasoningTokens:0}],scope,undefined,batch);
const make=(options:ConstructorParameters<typeof SyncExecutor>[1]={})=>{const executor=new SyncExecutor(join(home,'sync.db'),options);executors.push(executor);return executor;};
beforeEach(()=>{home=mkdtempSync(join(tmpdir(),'sync-phase2-worker-'));});
afterEach(async()=>{for(const item of executors.splice(0))await item.close();rmSync(home,{recursive:true,force:true});});
it('bounded queue and per-device limits reject before accepting, and cancellation frees the slot',async()=>{
  const executor=make({maxQueue:2,perDevice:1});const controller=new AbortController();
  const waiting=executor.execute({op:'capacity',actor:owner},()=>new Promise<void>(()=>{}),controller.signal);
  const rejected=expect(executor.execute({op:'capacity',actor:owner})).rejects.toMatchObject({code:'QUEUE_FULL',status:429});await rejected;
  const cancelled=expect(waiting).rejects.toMatchObject({code:'REQUEST_CANCELLED'});controller.abort();await cancelled;
  expect((await executor.execute<{disk:string}>({op:'capacity',actor:owner})).disk).toBeTruthy();
});
it('queue deadline expires without a 202 or durable success claim, and later requests recover',async()=>{
  const executor=make({timeoutMs:100});
  await expect(executor.execute({op:'capacity',actor:owner},()=>new Promise<void>(()=>{}))).rejects.toMatchObject({code:'QUEUE_TIMEOUT',status:429});
  expect(executor.state().lastFailure).toBe('QUEUE_TIMEOUT');
});
it('persists pages and receipts across Worker termination and replay',async()=>{
  const executor=make(),c=candidate('restart');await executor.execute({op:'register',scope,label:'Synthetic',actor:owner});
  await executor.execute({op:'begin',header:c.header,actor:device});await executor.execute({op:'stage',device:device.deviceId,batch:c.header.batchId,offset:0,records:c.records,actor:device});await executor.close();
  const restarted=make();const before=await restarted.execute<{nextOffset:number;state:string}>({op:'status',device:device.deviceId,batch:c.header.batchId,actor:device});expect(before.nextOffset).toBe(1);expect(before.state).toBe('staging');
  const committed=await restarted.execute({op:'commit',device:device.deviceId,batch:c.header.batchId,actor:device});await restarted.close();
  expect(await make().execute({op:'commit',device:device.deviceId,batch:c.header.batchId,actor:device})).toEqual(committed);
});
it('an unexpected Worker exit releases the writer and retains durable staging',async()=>{
  const executor=make(),c=candidate('crash');await executor.execute({op:'register',scope,label:'Synthetic',actor:owner});await executor.execute({op:'begin',header:c.header,actor:device});
  const instance=(executor as unknown as {worker:{terminate:()=>Promise<number>}}).worker;await instance.terminate();
  const status=await executor.execute<{state:string;nextOffset:number}>({op:'status',device:device.deviceId,batch:c.header.batchId,actor:device});expect(status.state).toBe('staging');expect(status.nextOffset).toBe(0);
});
it('SQLite writer contention is bounded and reported without a stack or SQL',async()=>{
  const executor=make(),c=candidate('busy');await executor.execute({op:'register',scope,label:'Synthetic',actor:owner});await executor.execute({op:'begin',header:c.header,actor:device});
  const db=new DatabaseSync(join(home,'sync.db'));db.exec('BEGIN IMMEDIATE');
  try{await expect(executor.execute({op:'stage',device:device.deviceId,batch:c.header.batchId,offset:0,records:c.records,actor:device})).rejects.toMatchObject({code:'SQLITE_BUSY_EXHAUSTED',status:503});}finally{db.exec('ROLLBACK');db.close();}
  const metrics=await executor.execute<{busyRetries:number}>({op:'capacity',actor:owner});expect(metrics.busyRetries).toBe(3);
  await executor.execute({op:'stage',device:device.deviceId,batch:c.header.batchId,offset:0,records:c.records,actor:device});
});
it('low-space policy blocks new staging; warnings never erase committed history',async()=>{
  const executor=make({policy:{...DEFAULT_CAPACITY,warnFreeBytes:Number.MAX_SAFE_INTEGER,rejectFreeBytes:Number.MAX_SAFE_INTEGER}}),c=candidate('capacity');
  await executor.execute({op:'register',scope,label:'Synthetic',actor:owner});await expect(executor.execute({op:'begin',header:c.header,actor:device})).rejects.toMatchObject({code:'INSUFFICIENT_STORAGE',status:503,retryAfter:60});
  const db=new DatabaseSync(join(home,'sync.db'));const state=capacityState(join(home,'sync.db'),db,{...DEFAULT_CAPACITY,warnBytes:1,reviewBytes:2},10*1024**3);expect(state.usage).toBe('review-required');guardCapacity(state);expect(db.prepare('SELECT COUNT(*) n FROM sync_scopes').get()!.n).toBe(1);db.close();
});
it('four active batches per device, TTL cleanup and receipt retention remain independent',async()=>{
  const executor=make();await executor.execute({op:'register',scope,label:'Synthetic',actor:owner});
  for(let i=0;i<4;i++)await executor.execute({op:'begin',header:candidate('batch-'+i).header,actor:device});
  await expect(executor.execute({op:'begin',header:candidate('fifth').header,actor:device})).rejects.toMatchObject({code:'DEVICE_BATCH_LIMIT',status:429});
  const db=new DatabaseSync(join(home,'sync.db'));db.prepare('UPDATE sync_staging SET expires_at=?').run(Date.now()-1);db.close();
  expect((await executor.execute<{removed:number}>({op:'cleanup',actor:owner})).removed).toBe(4);await executor.execute({op:'begin',header:candidate('fifth').header,actor:device});
});
