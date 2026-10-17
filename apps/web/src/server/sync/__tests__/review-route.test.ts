// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createSyncHandler } from '../controller';
import type { SyncExecutor } from '@incept/dashboard/sync';

it('Owner can read a redacted review queue without device authentication', async () => {
  const execute=vi.fn(async(work:{op:string;actor:{role:string}})=>{
    expect(work).toMatchObject({op:'reviews',actor:{role:'owner'}});
    return {reviews:[{id:1,source:'geminiCli',sessionSummary:'abc123',code:'ADAPTER_REVIEW',createdAt:'2026-10-17T00:00:00.000Z',oldDataRetained:true,nextStep:'OWNER_MAINTENANCE_REVIEW'}]};
  });
  const owner=vi.fn(async()=>({sessionId:'session',ownerId:'owner'}));
  const handler=createSyncHandler({
    executor:{execute} as unknown as SyncExecutor,
    owner,
    enabled:()=>true,
  });
  const response=await handler(new Request('http://fixture.invalid/api/dashboard/sync/reviews',{method:'GET'}));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({reviews:[expect.objectContaining({source:'geminiCli',oldDataRetained:true})]});
  expect(owner).toHaveBeenCalledWith(expect.any(Request),false);
});
