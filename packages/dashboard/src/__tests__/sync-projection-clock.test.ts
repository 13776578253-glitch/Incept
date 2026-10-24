import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
vi.mock('server-only',()=>({}));
import {projection} from '../sync/projection';
import {CompatibleSyncService} from '../adapters/local/imports/sync/legacy';
import {hash} from '../adapters/local/imports/identity';
import {PHASE0_NOW,writePhase0Home,phase0Export,phase0Import} from './fixtures/sync-agent-phase0';
import {fromEvents} from './phase1/fixtures';

let directory:string,home:string,legacy:string,service:CompatibleSyncService;
const owner={role:'owner' as const,subject:'owner',reason:'isolated time projection'};
beforeEach(()=>{directory=mkdtempSync(join(tmpdir(),'phase5-clock-'));home=join(directory,'receiver');mkdirSync(home);legacy=join(directory,'legacy.db');writeFileSync(join(directory,'overrides.json'),'{}');vi.stubEnv('INCEPT_DASHBOARD_OVERRIDES_FILE',join(directory,'overrides.json'));vi.stubEnv('INCEPT_DASHBOARD_IMPORTS_FILE',legacy);vi.useFakeTimers();vi.setSystemTime(PHASE0_NOW);service=new CompatibleSyncService(join(directory,'sync.db'));});
afterEach(()=>{service.close();rmSync(directory,{recursive:true,force:true});vi.useRealTimers();vi.unstubAllEnvs();});

it('v2 data-updated time follows the receipt clock rather than the legacy import time',()=>{
  const source=join(directory,'source');writePhase0Home(source);const bundle=phase0Export(source),receipt=phase0Import(bundle,legacy);service.migrateV1(legacy,owner);
  const events=bundle.events.filter(e=>e.source==='claudeCode'),scope={deviceId:bundle.device.id,source:'claudeCode' as const,sessionId:events[0].sessionId,originId:hash(['claudeCode',events[0].sessionId])};
  service.register(scope,bundle.device.label,owner);const p=fromEvents(events,scope,undefined,randomUUID());service.begin(p.header,owner);service.stage(scope.deviceId,p.header.batchId,0,p.records,owner);service.adopt(p.header,receipt.id,owner);
  vi.setSystemTime(PHASE0_NOW+60_000);service.commit(scope.deviceId,p.header.batchId,owner);
  const data=projection(service,home,'all',0,legacy,PHASE0_NOW+60_000);
  expect(data.sync?.lastCommittedAt).toBe(new Date(PHASE0_NOW+60_000).toISOString());
  expect(data.updatedAt).toBe(data.sync?.lastCommittedAt);
  expect(data.sync?.legacyImportedAt).toBeTruthy();
  expect(data.updatedAt).not.toBe(data.sync?.legacyImportedAt);
});
