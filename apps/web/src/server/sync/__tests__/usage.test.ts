// @vitest-environment node
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {emptyDashboard,type TokenDashboardData} from '@incept/dashboard/domain';

const mocks=vi.hoisted(()=>({readSnapshot:vi.fn(),trusted:vi.fn(()=>true),requireOwner:vi.fn(async()=>true),legacy:vi.fn()}));
vi.mock('@incept/dashboard/adapters',()=>({readDashboardSnapshot:mocks.readSnapshot,trustedDashboardEnabled:mocks.trusted}));
vi.mock('@incept/dashboard/next',()=>({dashboardUsageGet:mocks.legacy}));
vi.mock('@incept/db/agent',()=>({requireSyncOwner:mocks.requireOwner}));
import {syncUsageGet} from '../usage';

const execute=vi.fn();
const executor={execute} as unknown as Parameters<typeof syncUsageGet>[2];
const request=(query='')=>new Request('http://fixture.invalid/api/dashboard/usage'+query);
function snapshot(revision:number):TokenDashboardData {
  const data=emptyDashboard('30d');
  data.checkedAt='2026-10-27T00:00:00.000Z';
  data.sync={readMode:'v2',dataRevision:revision};
  return data;
}

beforeEach(()=>{
  vi.stubEnv('INCEPT_SYNC_REMOTE_ENABLED','1');
  vi.stubEnv('INCEPT_SYNC_POLL_MS','300000');
  mocks.readSnapshot.mockReset();
  mocks.trusted.mockReset().mockReturnValue(true);
  mocks.requireOwner.mockReset().mockResolvedValue(true);
  mocks.legacy.mockReset();
  execute.mockReset();
});
afterEach(()=>vi.unstubAllEnvs());

it('serves trusted v2 owner reads from the published snapshot without running projection',async()=>{
  mocks.readSnapshot.mockResolvedValue(snapshot(7));
  const response=await syncUsageGet(request('?range=30d'),'session',executor,'v2');
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({sync:{remote:true,readMode:'v2',dataRevision:7,intervalMs:300000}});
  expect(mocks.readSnapshot).toHaveBeenCalledWith('30d');
  expect(execute).not.toHaveBeenCalled();
});

it('returns 503 when the trusted snapshot is unavailable and never falls back to a live projection',async()=>{
  mocks.readSnapshot.mockResolvedValue(null);
  const response=await syncUsageGet(request(),'session',executor,'v2');
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({error:'SYNC_PROJECTION_UNAVAILABLE'});
  expect(execute).not.toHaveBeenCalled();
});

it('refuses a snapshot below the requested minimum revision',async()=>{
  mocks.readSnapshot.mockResolvedValue(snapshot(2));
  const response=await syncUsageGet(request('?minRevision=3'),'session',executor,'v2');
  expect(response.status).toBe(503);
  expect(execute).not.toHaveBeenCalled();
});

it('keeps shadow mode on the live projection path for comparison',async()=>{
  const data=snapshot(7);
  mocks.legacy.mockResolvedValue(Response.json(data));
  execute.mockResolvedValue(data);
  const response=await syncUsageGet(request(),'session',executor,'shadow');
  expect(response.status).toBe(200);
  expect(execute).toHaveBeenCalledWith(expect.objectContaining({op:'projection'}));
  expect(mocks.legacy).toHaveBeenCalledWith(expect.any(Request),'session',true);
  expect(mocks.readSnapshot).not.toHaveBeenCalled();
  expect(await response.json()).toMatchObject({sync:{readMode:'shadow',shadowEqual:true}});
});

it('keeps the live projection path when trusted snapshots are not configured',async()=>{
  mocks.trusted.mockReturnValue(false);
  execute.mockResolvedValue(snapshot(7));
  const response=await syncUsageGet(request(),'session',executor,'v2');
  expect(response.status).toBe(200);
  expect(execute).toHaveBeenCalledWith(expect.objectContaining({op:'projection'}));
  expect(mocks.readSnapshot).not.toHaveBeenCalled();
});
