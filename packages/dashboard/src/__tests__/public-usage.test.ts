import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDashboard, publicDashboardSummary } from '../domain';
const mocks = vi.hoisted(() => ({ read: vi.fn(), refresh: vi.fn() }));
vi.mock('../adapters', () => ({ readDashboardSnapshot: mocks.read, refreshDashboardSnapshot: mocks.refresh }));
import { dashboardUsageGet } from '../next/usage-route';
import { clientSnapshot, rememberSnapshot } from '../react/hooks/client-snapshots';

beforeEach(() => { mocks.read.mockReset(); mocks.refresh.mockReset(); });
describe('dashboard publishing boundary', () => {
  it('only publishes aggregate numbers and dates, dropping all collected details', () => {
    const data = emptyDashboard();
    Object.assign(data, { checkedAt: new Date().toISOString(), projects: [{ workspacePath: 'private-path' }],
      sessions: [{ title: 'private-title', deviceLabel: 'private-device' }], collectionIssues: ['private-error'],
      models: [{ displayName: 'private-model' }], sources: [{ label: 'private-source' }] });
    data.totals.totalTokens = 42;
    data.costs.unpricedModels = [{ modelName: 'private-model' }] as typeof data.costs.unpricedModels;
    const result = publicDashboardSummary(data);
    expect(result.totals.totalTokens).toBe(42);
    expect(JSON.stringify(result)).not.toContain('private-');
  });
  it('anonymous reads never collect and anonymous refresh is forbidden', async () => {
    mocks.read.mockResolvedValue(emptyDashboard('7d'));
    expect((await dashboardUsageGet(new Request('http://site/api/dashboard/usage?range=7d'))).status).toBe(200);
    expect((await dashboardUsageGet(new Request('http://site/api/dashboard/usage?refresh=1'))).status).toBe(403);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('owner reads retain details and forced collection has a cooldown', async () => {
    const data = { ...emptyDashboard(), collectionIssues: ['owner-only'] };
    mocks.refresh.mockResolvedValue(data);
    const request = new Request('http://site/api/dashboard/usage?refresh=1');
    expect(await (await dashboardUsageGet(request, 'test-owner')).json()).toEqual(data);
    expect((await dashboardUsageGet(request, 'test-owner')).status).toBe(429);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
  it('owner client history cannot become public history after logout', () => {
    const owner = { ...emptyDashboard(), checkedAt: new Date().toISOString(), collectionIssues: ['owner-only'] };
    rememberSnapshot(owner, 'owner');
    rememberSnapshot(publicDashboardSummary(owner), 'public');
    expect(clientSnapshot('30d', 'owner')?.collectionIssues).toEqual(['owner-only']);
    expect(clientSnapshot('30d', 'public')?.collectionIssues).toBeUndefined();
  });
});
