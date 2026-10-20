import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDashboard, publicDashboardSummary } from '../domain';
const mocks = vi.hoisted(() => ({ read: vi.fn(), refresh: vi.fn() }));
vi.mock('../adapters', () => ({ readDashboardSnapshot: mocks.read, refreshDashboardSnapshot: mocks.refresh }));
import { dashboardUsageGet } from '../next/usage-route';
import { clientSnapshot, rememberSnapshot } from '../react/hooks/client-snapshots';

beforeEach(() => { mocks.read.mockReset(); mocks.refresh.mockReset(); });
describe('dashboard publishing boundary', () => {
  it('publishes all model/source/cost statistics while dropping project, session and unlisted fields', () => {
    const data = emptyDashboard();
    Object.assign(data, { checkedAt: new Date().toISOString(), projects: [{ workspacePath: 'private-path' }],
      sessions: [{ title: 'private-title', deviceLabel: 'private-device' }], collectionIssues: ['private-error'],
      models: [{ ...data.totals, modelName: 'public-model', displayName: 'Public Model', provider: 'openai', source: 'Codex CLI',
        sessionCount: 2, activeDays: 1, missingPricing: false, internalPath: 'private-model-path' }],
      sources: [{ ...data.totals, sourceId: 'codex', label: 'Codex CLI', modelsUsed: ['public-model'], descriptionKey: 'codex', status: 'active', internalPath: 'private-source-path' }] });
    data.totals.totalTokens = 42;
    data.costs.unpricedModels = [{ modelName: 'public-unpriced-model', source: 'Codex CLI', totalTokens: 12,
      internalPath: 'private-cost-path' }] as unknown as typeof data.costs.unpricedModels;
    data.daily = [{ ...data.totals, date: '2026-10-14', modelsUsed: ['public-model'], modelBreakdowns: [{ modelName: 'public-model',
      inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheCreationTokens: 4, cost: 5, internalPath: 'private-daily-path' } as never] }];
    const result = publicDashboardSummary(data);
    expect(result.totals.totalTokens).toBe(42);
    expect(result.models[0].displayName).toBe('Public Model');
    expect(result.sources[0].label).toBe('Codex CLI');
    expect(result.costs.unpricedModels[0].totalTokens).toBe(12);
    expect(result.daily[0].modelBreakdowns[0].cost).toBe(5);
    expect(result.projects).toEqual([]); expect(result.sessions).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('private-');
  });
  it('Pro can read project/session details without raw paths, device identities or diagnostics, and cannot force collection', async () => {
    const data = emptyDashboard();
    data.projects = [{ ...data.totals, projectKey: 'project', projectName: 'Project', workspacePath: 'private-path',
      modelsUsed: ['model'], shareOfTokens: 1, shareOfCost: 1, lastActivity: '2026-10-14' }];
    data.sessions = [{ ...data.totals, sessionId: 'session', projectKey: 'project', projectName: 'Project', title: 'Session',
      source: 'Codex CLI', firstActivity: '2026-10-14', lastActivity: '2026-10-14', durationMinutes: 1,
      modelsUsed: ['model'], modelBreakdowns: [], workspacePath: 'private-path', deviceLabel: 'private-device', importBatchId: 'private-batch' }];
    data.collectionIssues = ['private-issue'];
    mocks.read.mockResolvedValue(data);
    const result = await dashboardUsageGet(new Request('http://site/api/dashboard/usage'), undefined, true);
    const payload = await result.json();
    expect(payload.projects[0].projectName).toBe('Project'); expect(payload.sessions[0].title).toBe('Session');
    expect(JSON.stringify(payload)).not.toContain('private-');
    expect(result.headers.get('vary')).toBe('Cookie');
    expect((await dashboardUsageGet(new Request('http://site/api/dashboard/usage?refresh=1'), undefined, true)).status).toBe(403);
    expect(mocks.refresh).not.toHaveBeenCalled();
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
    rememberSnapshot(publicDashboardSummary(owner, true), 'pro');
    expect(clientSnapshot('30d', 'owner')?.collectionIssues).toEqual(['owner-only']);
    expect(clientSnapshot('30d', 'public')?.collectionIssues).toBeUndefined();
    expect(clientSnapshot('30d', 'pro')?.collectionIssues).toBeUndefined();
  });
});
