import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { captureHome, buildCandidate } from '../agent/capture';
import { SyncService } from '../adapters/local/imports/sync/service';
import { syncScopeId, qualifyRanges } from '../adapters/local/imports/sync/contract';
import { hash } from '../adapters/local/imports/identity';
import { fromEvents } from './fixtures/events';
it('Harness multiframe capture receipts append idempotently despite an invalid line', async () => {
  const home=mkdtempSync(join(tmpdir(),'harness-capture-')),dir=join(home,'.dsh','sessions','fixture'),path=join(dir,'session.v4.jsonl.zstd');
  const source='deepseekHarness' as const,sessionId='harness-fixture';
  const scope={deviceId:'00000000-0000-4000-8000-000000000001',source,sessionId,originId:hash(['fixture',sessionId])};
  const row=(id:string,time:number)=>JSON.stringify({type:'assistant/message',time,data:{message:{id,source:{model:'workbuddy/deepseek-v4.1-flash'}},usage:{inputTokens:10,outputTokens:2,cacheReadTokens:30,cacheWriteTokens:0,totalTokens:42}}})+'\n';
  const service=new SyncService(join(home,'acceptance.db')),device={role:'device' as const,deviceId:scope.deviceId};
  try{
    mkdirSync(dir,{recursive:true});writeFileSync(path,Buffer.concat([zstdCompressSync(JSON.stringify({type:'session',id:sessionId,version:4})+'\n'),zstdCompressSync(row('one',1792490400000)+'{invalid json}\n')]));
    const captured=await captureHome(home,join(home,'snapshot-one'),[source]);
    expect(captured.captures).toHaveLength(1);expect(captured.issues).toContain('deepseekHarness:INTERVAL_ISOLATED');
    expect(captured.captures[0].proofs[0].range.sessionAnchorHash).toBe(hash(sessionId));
    const first=buildCandidate(captured.captures[0],scope,undefined,'baseline');
    service.register(scope,'Harness fixture',{role:'owner',subject:'fixture',reason:'test'});
    expect(service.ingest(first.header,first.records,device).status).toBe('committed');
    expect(service.ingest(first.header,first.records,device).status).toBe('committed');
    appendFileSync(path,zstdCompressSync(row('two',1792490460000)));
    const parent={header:first.header,proofs:first.proofs},nextCapture=await captureHome(home,join(home,'snapshot-two'),[source],[parent]);
    expect(nextCapture.captures).toHaveLength(1);
    const next=buildCandidate(nextCapture.captures[0],scope,parent,'append');
    expect(service.ingest(next.header,next.records,device).status).toBe('committed');
    expect(service.ingest(next.header,next.records,device).status).toBe('committed');
    const records=[...service.current(syncScopeId(scope))];expect(records).toHaveLength(2);
    expect(records.reduce((n,r)=>n+r.event.inputTokens+r.event.outputTokens+r.event.cacheReadTokens,0)).toBe(84);
  }finally{service.close();rmSync(home,{recursive:true,force:true});}
});
it('turns a path/extension rotation with a retained prefix into an auditable rotation proof', () => {
  const source='claudeCode' as const,sessionId='rotation-fixture';
  const scope={deviceId:'00000000-0000-4000-8000-000000000001',source,sessionId,originId:hash(['fixture',sessionId])};
  const event={eventId:hash('rotation-event'),source,sessionId,timestampMs:Date.parse('2026-10-31T00:00:00Z'),modelName:'fixture-model',
    projectKey:'fixture',projectName:'Fixture',inputTokens:10,outputTokens:2,cacheReadTokens:3,cacheCreationTokens:0,reasoningTokens:0};
  const base=fromEvents([event],scope,undefined,'rotation-base'),old=base.header.manifest.ranges[0];
  const newRange={...old,locatorHash:hash('rotation-new.jsonl.zst'),identityHash:hash('rotation-new-identity')};
  const parent={header:{...base.header,manifest:{...base.header.manifest,ranges:[old]}},proofs:[{range:old,locator:'rotation-old.jsonl'}]};
  const capture={source,sessionId,reader:source,records:base.records,proofs:[{range:newRange,locator:'rotation-new.jsonl.zst'}],rates:{},prefixes:{[old.locatorHash+':'+old.byteLength]:old.root}};
  const candidate=buildCandidate(capture,scope,parent,'rotation');
  expect(candidate.header.manifest.ranges[0].previous).toMatchObject({locatorHash:old.locatorHash,retainedRoot:old.root,change:'rotation'});
  expect(() => qualifyRanges(parent.header.manifest,candidate.header.manifest)).not.toThrow();
});
