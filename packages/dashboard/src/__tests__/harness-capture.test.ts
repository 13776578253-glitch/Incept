import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { captureHome, buildCandidate } from '../agent/capture';
import { SyncService } from '../adapters/local/imports/sync/service';
import { syncScopeId } from '../adapters/local/imports/sync/contract';
import { hash } from '../adapters/local/imports/identity';
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
