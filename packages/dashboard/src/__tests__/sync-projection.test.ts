import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
vi.mock('server-only',()=>({}));
import {projection} from '../sync/projection';
import {CompatibleSyncService} from '../adapters/local/imports/sync/legacy';
import {loadTokenDashboardData} from '../adapters/local/loader';
import {hash} from '../adapters/local/imports/identity';
import {TRANSFER_SOURCES,type TokenDashboardData} from '../domain';
import {PHASE0_NOW,PHASE0_AT,writePhase0Home,phase0Export,phase0Import,phase0Rehash} from './fixtures/sync-agent-phase0';
import {fromEvents} from './phase1/fixtures';
let directory:string,home:string,legacy:string,service:CompatibleSyncService;
const owner={role:'owner' as const,subject:'owner',reason:'isolated projection acceptance'};
beforeEach(()=>{directory=mkdtempSync(join(tmpdir(),'phase4-projection-'));home=join(directory,'receiver');mkdirSync(home);legacy=join(directory,'legacy.db');writeFileSync(join(directory,'overrides.json'),'{}');vi.stubEnv('INCEPT_DASHBOARD_OVERRIDES_FILE',join(directory,'overrides.json'));vi.stubEnv('INCEPT_DASHBOARD_IMPORTS_FILE',legacy);vi.useFakeTimers();vi.setSystemTime(PHASE0_NOW);service=new CompatibleSyncService(join(directory,'sync.db'));});
afterEach(()=>{service.close();rmSync(directory,{recursive:true,force:true});vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllEnvs();});
const comparable=(data:TokenDashboardData)=>({...data,updatedAt:undefined,sync:undefined,checkedAt:undefined});
it('controlled projection has zero complete DTO differences in 7d/30d/all, before and after exact adoption of overlapping v1 batches',async()=>{
  const source=join(directory,'source');writePhase0Home(source);const original=phase0Export(source);
  const bundle=phase0Rehash({...original,events:[PHASE0_NOW-45*86400000,PHASE0_NOW-15*86400000,PHASE0_AT].flatMap((timestampMs,i)=>original.events.map(e=>({...e,eventId:hash([e.eventId,i]),timestampMs})))});
  const a=phase0Import(bundle,legacy),b=phase0Import(phase0Rehash({...bundle,exportId:randomUUID()}),legacy);service.migrateV1(legacy,owner);expect(service.migrateV1(legacy,owner)).toBe(0);
  const baselines=new Map();for(const range of ['7d','30d','all'] as const){const old=await loadTokenDashboardData({home,range,force:true});baselines.set(range,old);expect(comparable(projection(service,home,range,0,legacy,PHASE0_NOW))).toEqual(comparable(old));}
  for(const source of TRANSFER_SOURCES){const events=bundle.events.filter(e=>e.source===source),scope={deviceId:bundle.device.id,source,sessionId:events[0].sessionId,originId:hash([source,events[0].sessionId])};service.register(scope,bundle.device.label,owner);const p=fromEvents(events,scope,undefined,randomUUID());service.begin(p.header,owner);service.stage(scope.deviceId,p.header.batchId,0,p.records,owner);service.adopt(p.header,a.id,owner);service.adopt(p.header,b.id,owner);expect(service.commit(scope.deviceId,p.header.batchId,owner).status).toBe('committed');}
  for(const range of ['7d','30d','all'] as const)expect(comparable(projection(service,home,range,0,legacy,PHASE0_NOW))).toEqual(comparable(baselines.get(range)));
});
it('stale v1 projection and impossible minimum revision fail closed',()=>{
  const source=join(directory,'source');writePhase0Home(source);phase0Import(phase0Export(source),legacy);expect(()=>projection(service,home,'all',0,legacy)).toThrow('LEGACY_PROJECTION_STALE');
  service.migrateV1(legacy,owner);expect(()=>projection(service,home,'all',999999,legacy)).toThrow('REVISION_NOT_VISIBLE');
});
it('real native collectors retain priority over both legacy and adopted v2 observations',async()=>{
  writePhase0Home(home);const bundle=phase0Export(home),receipt=phase0Import(bundle,legacy);service.migrateV1(legacy,owner);
  const baseline=await loadTokenDashboardData({home,range:'all',force:true});expect(comparable(projection(service,home,'all',0,legacy,PHASE0_NOW))).toEqual(comparable(baseline));
  for(const source of TRANSFER_SOURCES){const events=bundle.events.filter(e=>e.source===source),scope={deviceId:bundle.device.id,source,sessionId:events[0].sessionId,originId:hash([source,events[0].sessionId])};service.register(scope,bundle.device.label,owner);const p=fromEvents(events,scope,undefined,randomUUID());service.begin(p.header,owner);service.stage(scope.deviceId,p.header.batchId,0,p.records,owner);service.adopt(p.header,receipt.id,owner);expect(service.commit(scope.deviceId,p.header.batchId,owner).status).toBe('committed');}
  expect(comparable(projection(service,home,'all',0,legacy,PHASE0_NOW))).toEqual(comparable(baseline));
});
