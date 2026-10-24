import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {existsSync,mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {CompatibleSyncService} from '../adapters/local/imports/sync/legacy';
import {fromEvents} from './phase1/fixtures';
import {readSyncView} from '../adapters/local/imports/sync/read';
vi.mock('server-only',()=>({}));
import {backupSqlite,runMaintenance} from '../sync/maintenance';
import {PHASE0_NOW,phase0Export,phase0Import,writePhase0Home} from './fixtures/sync-agent-phase0';

let directory:string,home:string,legacy:string,sync:string;
beforeEach(()=>{
  directory=mkdtempSync(join(tmpdir(),'phase5-maintenance-'));home=join(directory,'home');mkdirSync(home);legacy=join(directory,'v1.db');sync=join(directory,'v2.db');
  writeFileSync(join(directory,'overrides.json'),'{}');vi.useFakeTimers();vi.setSystemTime(PHASE0_NOW);
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});});
const env=()=>{const values={INCEPT_SYNC_DATABASE_FILE:sync,INCEPT_DASHBOARD_IMPORTS_FILE:legacy,INCEPT_DASHBOARD_HOME:home,INCEPT_DASHBOARD_OVERRIDES_FILE:join(directory,'overrides.json')};for(const [key,value]of Object.entries(values))vi.stubEnv(key,value);return values;};

it('creates a consistent SQLite copy with a live WAL writer without mutating the source',async()=>{
  const source=join(directory,'source.db'),output=join(directory,'backup.db'),db=new DatabaseSync(source);
  db.exec('PRAGMA journal_mode=WAL;CREATE TABLE records(id INTEGER PRIMARY KEY,value TEXT);INSERT INTO records(value) VALUES(\'a\');');
  const result=await backupSqlite(source,output);db.close();
  expect(result.fingerprint.tables.records).toBe(1);expect(existsSync(output)).toBe(true);
  const copy=new DatabaseSync(output,{readOnly:true});expect(copy.prepare('SELECT value FROM records').get()!.value).toBe('a');copy.close();
});

it('migrates v1 to shadow, compares all three windows and checkpoints without changing revision',async()=>{
  writePhase0Home(home);phase0Import(phase0Export(home),legacy);
  const shadow=await runMaintenance(['shadow-check','--owner-confirm=I_AM_THE_OWNER','--reason=isolated Phase5 acceptance'],env()) as {ok:boolean;revision:number;ranges:Array<{equal:boolean}>};
  expect(shadow.ok).toBe(true);expect(shadow.ranges).toHaveLength(3);expect(shadow.ranges.every(row=>row.equal)).toBe(true);
  const before=shadow.revision,maintained=await runMaintenance(['maintain','--owner-confirm=I_AM_THE_OWNER','--reason=isolated Phase5 acceptance'],env()) as {ok:boolean;revision:number};
  expect(maintained.ok).toBe(true);expect(maintained.revision).toBe(before);
  const replay=await runMaintenance(['shadow-check','--owner-confirm=I_AM_THE_OWNER','--reason=isolated Phase5 replay'],env()) as {revision:number};
  expect(replay.revision).toBe(before);
});

it('shadow comparison ignores the intentional v2 receipt-clock updatedAt difference',async()=>{
  writePhase0Home(home);const bundle=phase0Export(home),receipt=phase0Import(bundle,legacy),ownerActor={role:'owner' as const,subject:'owner',reason:'clock fixture'};
  const service=new CompatibleSyncService(sync);service.migrateV1(legacy,ownerActor);
  const events=bundle.events.filter(e=>e.source==='claudeCode'),scope={deviceId:bundle.device.id,source:'claudeCode' as const,sessionId:events[0].sessionId,originId:'clock-origin'};
  service.register(scope,bundle.device.label,ownerActor);const candidate=fromEvents(events,scope,undefined,'clock-candidate');service.begin(candidate.header,ownerActor);service.stage(scope.deviceId,candidate.header.batchId,0,candidate.records,ownerActor);service.adopt(candidate.header,receipt.id,ownerActor);
  vi.setSystemTime(PHASE0_NOW+60_000);service.commit(scope.deviceId,candidate.header.batchId,ownerActor);service.close();
  const result=await runMaintenance(['shadow-check','--owner-confirm=I_AM_THE_OWNER','--reason=clock comparison'],env()) as {ok:boolean};
  expect(result.ok).toBe(true);
});
it('requires explicit Owner confirmation for writes',async()=>{
  writePhase0Home(home);phase0Import(phase0Export(home),legacy);
  await expect(runMaintenance(['migrate-v1'],env())).rejects.toMatchObject({code:'OWNER_CONFIRMATION_REQUIRED'});
});

it('keeps equals signs in option values instead of truncating the reason',async()=>{
  writePhase0Home(home);phase0Import(phase0Export(home),legacy);
  const result=await runMaintenance(['maintain','--owner-confirm=I_AM_THE_OWNER','--reason=owner=approved=maintenance'],env()) as {ok:boolean};
  expect(result.ok).toBe(true);
});

it('an explicit Owner device+manifest+batch plan grants exact adoption without automatic v1 inference',async()=>{
  writePhase0Home(home);const bundle=phase0Export(home),old=phase0Import(bundle,legacy),owner={role:'owner' as const,subject:'owner',reason:'fixture'};
  let service=new CompatibleSyncService(sync);service.migrateV1(legacy,owner);service.close();
  const events=bundle.events.filter(e=>e.source==='claudeCode'),scope={deviceId:bundle.device.id,source:'claudeCode' as const,sessionId:events[0].sessionId,originId:'explicit-origin'},candidate=fromEvents(events,scope,undefined,'explicit-plan'),file=join(directory,'candidate.json');
  writeFileSync(file,JSON.stringify(candidate));
  const args=['adopt-exact','--candidate='+file,'--legacy-batches='+old.id,'--device='+scope.deviceId,'--manifest='+candidate.header.manifest.manifestHash,'--owner-confirm=I_AM_THE_OWNER','--reason=exact historical plan approval'];
  expect(await runMaintenance(args,env())).toMatchObject({ok:true,receipt:{status:'committed'}});
  const replay=await runMaintenance(args,env());expect(replay).toMatchObject({ok:true,receipt:{status:'committed'}});
  service=new CompatibleSyncService(sync);try{expect(readSyncView(service).events).toHaveLength(bundle.events.length);expect(service.db.prepare('SELECT COUNT(*) n FROM sync_adoptions').get()!.n).toBe(1);}finally{service.close();}
});

it('rolls back a committed generation through maintenance CLI with incremented revision and audit trail', async () => {
  writePhase0Home(home); const bundle = phase0Export(home), old = phase0Import(bundle, legacy), owner = { role: 'owner' as const, subject: 'owner', reason: 'fixture' };
  let service = new CompatibleSyncService(sync); service.migrateV1(legacy, owner); service.close();
  const events = bundle.events.filter(e => e.source === 'claudeCode'), scope = { deviceId: bundle.device.id, source: 'claudeCode' as const, sessionId: events[0].sessionId, originId: 'rollback-origin' }, candidate = fromEvents(events, scope, undefined, 'rollback-plan'), file = join(directory, 'candidate-rollback.json');
  writeFileSync(file, JSON.stringify(candidate));
  const adoptArgs = ['adopt-exact', '--candidate=' + file, '--legacy-batches=' + old.id, '--device=' + scope.deviceId, '--manifest=' + candidate.header.manifest.manifestHash, '--owner-confirm=I_AM_THE_OWNER', '--reason=plan for rollback'];
  const adopted = await runMaintenance(adoptArgs, env()) as { ok: boolean; receipt: { generationId: string } };
  expect(adopted.ok).toBe(true);
  const genId = adopted.receipt.generationId;

  // Test rollback without confirmation fails
  await expect(runMaintenance(['rollback', '--generation=' + genId], env())).rejects.toMatchObject({ code: 'OWNER_CONFIRMATION_REQUIRED' });

  // Test rollback with confirmation succeeds
  const res = await runMaintenance(['rollback', '--generation=' + genId, '--owner-confirm=I_AM_THE_OWNER', '--reason=Rollback test'], env()) as { ok: boolean; generation: string; revision: number };
  expect(res.ok).toBe(true);
  expect(res.generation).toBe(genId);

  // Check audit and rolled state
  service = new CompatibleSyncService(sync);
  try {
    expect(service.db.prepare('SELECT rolled FROM sync_generations WHERE id=?').get(genId)!.rolled).toBe(1);
    expect(service.db.prepare("SELECT COUNT(*) n FROM sync_audit WHERE operation='rollback'").get()!.n).toBe(1);
  } finally { service.close(); }
});
