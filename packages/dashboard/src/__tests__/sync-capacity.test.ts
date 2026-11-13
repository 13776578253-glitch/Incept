import {expect,it} from 'vitest';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {capacityState,guardCapacity,memoryPressure,checkpointWal} from '../sync/capacity';
import {DEFAULT_CAPACITY} from '../sync/protocol';
import {findSyncWorker,SyncExecutor} from '../sync/executor';
import {CompatibleSyncService} from '../adapters/local/imports/sync/legacy';
import {fromEvents} from './phase1/fixtures';
import {hash} from '../adapters/local/imports/identity';
const owner={role:'owner' as const,subject:'owner',reason:'isolated Phase5 acceptance'};
const cgroup = '/sys/fs/cgroup/';
function readCgroup(files: Record<string, string>) {
  return (path: string) => {
    const value = files[path.slice(cgroup.length)];
    if (value === undefined) throw new Error('cgroup file unavailable');
    return value;
  };
}

it('preserves raw usage and subtracts only inactive file pages from the working set', () => {
  expect(memoryPressure(readCgroup({
    'memory.current': '90\n',
    'memory.max': '100\n',
    'memory.stat': 'file 60\nactive_file 20\ninactive_file 40\nanon 25\n',
  }))).toEqual({
    currentBytes: 90, maximumBytes: 100, percent: 90,
    inactiveFileBytes: 40, workingSetBytes: 50, workingSetPercent: 50,
  });
  expect(memoryPressure(readCgroup({
    'memory.current': '90',
    'memory.max': '100',
    'memory.stat': 'inactive_file 90',
  }))).toMatchObject({ workingSetBytes: 0, workingSetPercent: 0 });
});

it.each([
  ['unlimited limit', '90', 'max'],
  ['zero limit', '90', '0'],
  ['unreadable limit', '90', undefined],
  ['unreadable current', undefined, '100'],
  ['empty current', '', '100'],
  ['negative current', '-1', '100'],
  ['unsafe integer', '9007199254740992', '100'],
])('reports unavailable memory for %s', (_case, current, maximum) => {
  const read = readCgroup({
    ...(current === undefined ? {} : { 'memory.current': current }),
    ...(maximum === undefined ? {} : { 'memory.max': maximum }),
  });
  expect(memoryPressure(read)).toBeNull();
});

it.each([
  ['unreadable memory.stat', undefined],
  ['missing inactive_file', 'total_inactive_file 80\nfile 80'],
  ['negative inactive_file', 'inactive_file -1'],
  ['malformed inactive_file', 'inactive_file 8.5'],
  ['unsafe inactive_file', 'inactive_file 9007199254740992'],
  ['inactive_file greater than current', 'inactive_file 91'],
])('falls back to raw usage for %s', (_case, stat) => {
  const files: Record<string, string> = { 'memory.current': '90', 'memory.max': '100' };
  if (stat !== undefined) files['memory.stat'] = stat;
  const memory = memoryPressure(readCgroup(files));
  expect(memory).toEqual({
    currentBytes: 90, maximumBytes: 100, percent: 90,
    inactiveFileBytes: null, workingSetBytes: null, workingSetPercent: null,
  });
});

it('falls back to raw pressure and retains the DB/WAL/SHM limit without changing records',()=>{
  const dir=mkdtempSync(join(tmpdir(),'phase5-pressure-')),path=join(dir,'store.db'),service=new CompatibleSyncService(path);
  try{
    const revision=service.revision();
    const read=readCgroup({'memory.current':'90','memory.max':'100'});
    expect(()=>guardCapacity(capacityState(path,service.db,DEFAULT_CAPACITY,10*1024**3,memoryPressure(read)))).toThrow('MEMORY_PRESSURE');
    expect(()=>guardCapacity(capacityState(path,service.db,{...DEFAULT_CAPACITY,maxStoreBytes:1},10*1024**3,null))).toThrow('STORE_CAPACITY');
    expect(service.revision()).toBe(revision);expect(service.db.prepare('SELECT count(*) n FROM sync_receipts').get()!.n).toBe(0);
  }finally{service.close();rmSync(dir,{recursive:true,force:true});}
});

it('retries begin and resumes staging in the same worker as working-set pressure drops', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sync-working-set-'));
  const stat = join(dir, 'memory.stat');
  const workerFile = join(dir, 'worker.mjs');
  const device = { role: 'device' as const, deviceId: 'fixture' };
  const scope = { deviceId: device.deviceId, source: 'claudeCode' as const, sessionId: 's', originId: 'o' };
  const batch = fromEvents([{
    eventId: hash('working-set-event'), source: scope.source, sessionId: scope.sessionId,
    timestampMs: Date.now(), modelName: 'm', projectKey: 'p', projectName: 'p',
    inputTokens: 100, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0,
  }], scope, undefined, 'working-set-retry');
  const setPressure = (high: boolean) => {
    writeFileSync(stat, high ? 'anon 692060160\ninactive_file 4194304\n'
      : 'anon 485646336\ninactive_file 171864064\n');
  };
  // Stub only cgroup reads inside the real bundled worker.
  writeFileSync(workerFile, `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const readFileSync = fs.readFileSync;
    fs.readFileSync = (path, ...args) => {
      if (path === '${cgroup}memory.current') return '730509312\\n';
      if (path === '${cgroup}memory.max') return '805306368\\n';
      if (path === '${cgroup}memory.stat') return readFileSync(${JSON.stringify(stat)}, ...args);
      return readFileSync(path, ...args);
    };
    syncBuiltinESMExports();
    await import(${JSON.stringify(pathToFileURL(findSyncWorker()).href)});
  `);
  const executor = new SyncExecutor(join(dir, 'store.db'), { workerFile });
  try {
    const begin = () => executor.execute({ op: 'begin', header: batch.header, actor: device });
    const stage = () => executor.execute({
      op: 'stage', device: device.deviceId, batch: batch.header.batchId, offset: 0, records: batch.records, actor: device,
    });
    const status = () => executor.execute({
      op: 'status', device: device.deviceId, batch: batch.header.batchId, actor: device,
    });
    const retryablePressure = { code: 'MEMORY_PRESSURE', status: 503, retryAfter: 30 };
    setPressure(true);
    await executor.execute({ op: 'register', scope, label: 'fixture', actor: owner });
    await expect(begin()).rejects.toMatchObject(retryablePressure);
    await expect(status()).rejects.toMatchObject({ code: 'BATCH_NOT_FOUND' });

    setPressure(false);
    await begin();
    await expect(executor.execute({ op: 'capacity', actor: owner })).resolves.toMatchObject({
      pressure: 'ok',
      memory: { currentBytes: 730509312, inactiveFileBytes: 171864064, workingSetBytes: 558645248 },
    });
    setPressure(true);
    await expect(stage()).rejects.toMatchObject(retryablePressure);
    await expect(status()).resolves.toMatchObject({ state: 'staging', nextOffset: 0 });

    setPressure(false);
    await expect(stage()).resolves.toEqual({ nextOffset: 1 });
    const commit = await executor.execute<{receipt: unknown}>({
      op: 'commit', device: device.deviceId, batch: batch.header.batchId, actor: device,
    });
    await expect(status()).resolves.toMatchObject({ state: 'committed', receipt: commit.receipt });
  } finally {
    await executor.close();
    rmSync(dir, { recursive: true, force: true });
  }
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
