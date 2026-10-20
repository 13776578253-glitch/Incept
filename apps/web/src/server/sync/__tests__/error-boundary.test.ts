// @vitest-environment node
import {afterAll,beforeAll,expect,it} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {AgentAuthError} from '@incept/db/agent';
import {SyncTransportError,type SyncExecutor} from '@incept/dashboard/sync';
import {createSyncHandler} from '../controller';

let home:string,foreign:typeof import('@incept/dashboard/sync');
const executors:SyncExecutor[]=[];
const identity={deviceId:'fixture-device',ownerAccountId:'fixture-owner',allowedSources:['codex'],version:1};
const request=(headers:Record<string,string>={})=>new Request('http://fixture.invalid/api/dashboard/sync/batches/missing-batch',{headers:{authorization:'Bearer fixture',...headers}});
const handler=(executor:SyncExecutor,authenticate=async()=>identity)=>createSyncHandler({executor,enabled:()=>true,owner:async()=>({ownerId:'owner',sessionId:'fixture'}),authenticate});
const broken=(error:unknown)=>({execute:async()=>{throw error;}} as unknown as SyncExecutor);
beforeAll(async()=>{
  home=mkdtempSync(join(tmpdir(),'sync-error-boundary-'));
  const {build}=createRequire(resolve('../../packages/dashboard/package.json'))('esbuild');
  const outfile=join(home,'independent-executor.mjs');
  await build({entryPoints:[resolve('../../packages/dashboard/src/sync/index.ts')],outfile,bundle:true,platform:'node',format:'esm',target:'node24'});
  // An independently bundled executor models the shared instance created by another Next route.
  foreign=await import(/* @vite-ignore */ pathToFileURL(outfile).href);
});
afterAll(async()=>{for(const executor of executors)await executor.close();rmSync(home,{recursive:true,force:true});});
it('keeps a real Worker missing-batch 404 across independently bundled routes and remains usable',async()=>{
  const executor=new foreign.SyncExecutor(join(home,'sync.db'),{trusted:true,workerFile:resolve('../../packages/dashboard/dist/dashboard-sync-worker.mjs')});executors.push(executor);
  let caught:unknown;try{await executor.execute({op:'status',device:identity.deviceId,batch:'missing-batch',actor:{role:'device',deviceId:identity.deviceId},allowedSources:identity.allowedSources});}catch(error){caught=error;}
  expect(caught).toMatchObject({code:'BATCH_NOT_FOUND',status:404});expect(caught instanceof SyncTransportError).toBe(false);
  const response=await handler(executor)(request());expect(response.status).toBe(404);expect(await response.json()).toMatchObject({error:'BATCH_NOT_FOUND'});expect(response.headers.get('retry-after')).toBeNull();
  expect(await executor.execute({op:'checkpoint',actor:{role:'owner',subject:'fixture',reason:'connection check'}})).toMatchObject({dataRevision:0});
});
it('preserves genuine executor unavailability and Retry-After',async()=>{
  const executor=new foreign.SyncExecutor(join(home,'closed.db'),{workerFile:resolve('../../packages/dashboard/dist/dashboard-sync-worker.mjs')});await executor.close();
  const response=await handler(executor)(request());expect(response.status).toBe(503);expect(await response.json()).toMatchObject({error:'EXECUTOR_CLOSED'});expect(response.headers.get('retry-after')).toBe('2');
});
it('preserves cross-bundle authorization denial',async()=>{
  const response=await handler(broken(new foreign.SyncTransportError('DEVICE_MISMATCH',403,0)))(request());expect(response.status).toBe(403);expect(await response.json()).toMatchObject({error:'FORBIDDEN'});
});
it('keeps authentication failure at 401',async()=>{
  const response=await handler(broken(Error('must not dispatch')),async()=>{throw new AgentAuthError(401,'INVALID_AGENT_TOKEN');})(request());expect(response.status).toBe(401);expect(await response.json()).toMatchObject({error:'INVALID_AGENT_TOKEN'});
});
it('revalidates credentials before real Worker dispatch',async()=>{
  const executor=new foreign.SyncExecutor(join(home,'revalidate.db'),{workerFile:resolve('../../packages/dashboard/dist/dashboard-sync-worker.mjs')});executors.push(executor);let calls=0;
  const response=await handler(executor,async()=>{if(++calls===2)throw new AgentAuthError(401,'DEVICE_REVOKED');return identity;})(request());expect(response.status).toBe(401);expect(await response.json()).toMatchObject({error:'DEVICE_REVOKED'});expect(calls).toBe(2);
});
it('keeps device-header identity checks',async()=>{
  const response=await handler(broken(Error('must not dispatch')))(request({'x-sync-device-id':'other-device'}));expect(response.status).toBe(403);
});
it('redacts unexpected backend errors and rejects unbranded status-shaped errors',async()=>{
  for(const error of [Error('SQL secret path token'),{code:'BATCH_NOT_FOUND',status:404,retryAfter:0},new foreign.SyncTransportError('secret path',404,0)]){
    const response=await handler(broken(error))(request());expect(response.status).toBe(503);expect(await response.json()).toMatchObject({error:'BACKEND_UNAVAILABLE'});
  }
});
