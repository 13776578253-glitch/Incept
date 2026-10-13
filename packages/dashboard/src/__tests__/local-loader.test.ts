import { appendFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const localHome = vi.hoisted(() => ({ path: '' }));

vi.mock('node:os', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:os')>(),
  homedir: () => localHome.path,
}));

beforeEach(() => {
  localHome.path = mkdtempSync(join(tmpdir(), 'incept-dashboard-'));
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  const resolvedHome = resolve(localHome.path);
  if (!resolvedHome.startsWith(join(resolve(tmpdir()), 'incept-dashboard-'))) {
    throw new Error('Fixture cleanup must stay inside the test temporary directory.');
  }
  rmSync(resolvedHome, { recursive: true, force: true });
});

describe('package local usage adapter', () => {
  it('reads committed imports and rollbacks immediately even while the native snapshot is cached', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-12T04:00:00Z'));
    const dir = join(localHome.path, '.commandcode', 'projects', 'project'); mkdirSync(dir, { recursive: true });
    const original = JSON.stringify({ id: 'native', model: 'native-model', timestamp: '2026-10-12T00:00:00Z', usage: { inputTokens: 20, costUsd: .1 } });
    writeFileSync(join(dir, 'native.jsonl'), original);
    const { loadTokenDashboardData } = await import('@incept/dashboard/adapters');
    const { hash } = await import('../adapters/local/imports/identity');
    const { previewImport, commitImport, rollbackImport, importHistory } = await import('../adapters/local/imports/service');
    const { importStorePath } = await import('../adapters/local/imports/store');
    expect((await loadTokenDashboardData({ range: '30d' })).totals.totalTokens).toBe(20);
    const payload = { format: 'incept-token-transfer', version: 1, exportId: '62fda0a5-f89b-4baf-93df-d69881b61001',
      device: { id: '62fda0a5-f89b-4baf-93df-d69881b61002', label: 'Other computer', platform: 'win32' }, exportedAt: '2026-10-12T03:00:00Z', prices: {}, warnings: [],
      events: [{ eventId: hash('foreign-event'), source: 'commandcode', sessionId: 'foreign', modelName: 'foreign-model',
        projectKey: 'foreign-project', projectName: 'Foreign', timestampMs: Date.parse('2026-10-12T00:00:00Z'),
        inputTokens: 50, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0, recordedCost: .3 }] };
    const options = { home: localHome.path, context: { events: [], pricing: new Map(), aliases: {} } };
    const receipt = commitImport(previewImport({ ...payload, checksum: hash(payload) }, {}, options).previewId, options);
    const imported = await loadTokenDashboardData({ range: '30d' });
    expect(imported.totals.totalTokens).toBe(70); expect(imported.sources.find(source => source.sourceId === 'commandcode')?.collectionMode).toBe('mixed');
    rollbackImport(receipt.id, importStorePath());
    expect((await loadTokenDashboardData({ range: '30d' })).totals.totalTokens).toBe(20);
    expect(importHistory(importStorePath())[0].status).toBe('rolled_back');
  });
  it('rereads temporary aliases and prices on refresh, while invalid configuration cannot disable native collection', async () => {
    let now = Date.parse('2026-10-12T04:00:00Z'); vi.spyOn(Date, 'now').mockImplementation(() => now);
    const directory = join(localHome.path, '.commandcode', 'projects', 'project'); mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'native.jsonl'), JSON.stringify({ model: 'provider/old-route', timestamp: '2026-10-12T00:00:00Z', usage: { inputTokens: 10, outputTokens: 2 } }));
    const config = join(localHome.path, 'dashboard.local.json'); vi.stubEnv('INCEPT_DASHBOARD_OVERRIDES_FILE', config);
    const content = (input: number) => JSON.stringify({ modelAliases: { 'old-route': 'provider/current-model' }, prices: { 'provider/current-model': { inputPerMillion: input, outputPerMillion: 2 } } });
    writeFileSync(config, content(1));
    const { loadTokenDashboardData } = await import('@incept/dashboard/adapters');
    expect((await loadTokenDashboardData()).models[0]).toMatchObject({ modelName: 'provider/current-model', cost: .000014 });
    writeFileSync(config, content(3)); now += 15_001;
    expect((await loadTokenDashboardData()).models[0].cost).toBe(.000034);
    writeFileSync(config, '{invalid');
    const data = await loadTokenDashboardData({ force: true });
    expect(data.totals.totalTokens).toBe(12); expect(data.models[0].modelName).toBe('provider/old-route');
    expect(data.collectionIssues?.some(issue => issue.includes('Invalid dashboard.local.json'))).toBe(true);
  });
  it('does not resurrect an indexed Codex fork after its duplicate raw history moved to the archive', async () => {
    const original = join(localHome.path, '.codex', 'sessions'), archive = join(localHome.path, '.codex', 'archived_sessions');
    const index = join(localHome.path, '.aiusage');
    for (const path of [original, archive, index]) mkdirSync(path, { recursive: true });
    const lines = [JSON.stringify({ type: 'session_meta', payload: { id: 'parent' } }),
      JSON.stringify({ type: 'turn_context', payload: { model: 'from-native' } }),
      JSON.stringify({ timestamp: '2026-10-01T00:00:00Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 100, output_tokens: 20 } } } })].join('\n');
    writeFileSync(join(original, 'parent.jsonl'), lines); writeFileSync(join(archive, 'fork.jsonl'), lines);
    const db = new DatabaseSync(join(index, 'cache.db'));
    db.exec('CREATE TABLE records (ts INTEGER, tool TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER, cache_write_tokens INTEGER, thinking_tokens INTEGER, cost REAL, session_id TEXT, source_file TEXT, cwd TEXT)');
    db.prepare('INSERT INTO records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(Date.parse('2026-10-01T00:00:00Z'), 'codex', 'from-index', 100, 20, 0, 0, 0, 0, 'fork', join(original, 'fork.jsonl'), ''); db.close();
    const { loadTokenDashboardData } = await import('@incept/dashboard/adapters');
    const data = await loadTokenDashboardData();
    expect(data.totals.totalTokens).toBe(120); expect(data.models.map(model => model.modelName)).toEqual(['from-native']);
  });
  it('applies one calendar window to every aggregate and refreshes newly appended records', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-12T04:00:00Z'));
    const projectDir = join(localHome.path, '.commandcode', 'projects', 'd-desktop-code-code-incept');
    mkdirSync(projectDir, { recursive: true });
    const file = join(projectDir, 'window.jsonl');
    const line = (timestamp: string) => JSON.stringify({ model: 'from-log', timestamp,
      usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0 } }) + '\n';
    writeFileSync(file, line('2026-09-01T00:00:00Z') + line('2026-10-06T00:00:00Z'));
    const { loadTokenDashboardData } = await import('@incept/dashboard/adapters');
    const window = await loadTokenDashboardData({ range: '7d' });
    expect(window.totals.totalTokens).toBe(120);
    expect(window.projects[0].totalTokens).toBe(120);
    expect(window.models[0].totalTokens).toBe(120);
    expect(window.sessions[0].totalTokens).toBe(120);
    expect(window.daily).toHaveLength(7);
    expect(window.costs.tokenCoverageRate).toBe(0);
    expect((await loadTokenDashboardData({ range: 'all' })).totals.totalTokens).toBe(240);
    appendFileSync(file, line('2026-10-12T00:00:00Z'));
    expect((await loadTokenDashboardData({ range: '7d' })).totals.totalTokens).toBe(120);
    const refreshed = await loadTokenDashboardData({ range: '7d', force: true });
    expect(refreshed.totals.totalTokens).toBe(240);
    expect(refreshed.dateRange.activeDays).toBe(2);
    expect(refreshed.monthly[0].totalTokens).toBe(240);
    const timestamp = refreshed.updatedAt;
    expect((await loadTokenDashboardData({ force: true })).updatedAt).toBe(timestamp);
  });

  it('does not invent model identities or prices, and reads real local price data', async () => {
    const dir = join(localHome.path, '.aiusage');
    mkdirSync(dir);
    const db = new DatabaseSync(join(dir, 'cache.db'));
    db.exec("CREATE TABLE model_prices (model_key TEXT, input REAL, output REAL, cache_read REAL, cache_write REAL, status TEXT)");
    db.exec("INSERT INTO model_prices VALUES ('provider/from-data', 1, 2, 0.1, 1.2, 'active')");
    db.close();
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ priceOverrides: {
      'provider/from-data': { output: 3 },
      invalid: { input: -1, output: 2, cacheRead: 0, cacheWrite: 0 },
    } }));
    const { loadLocalPricingMap } = await import('../adapters/local/pricing');
    const pricing = loadLocalPricingMap(localHome.path);
    expect([...pricing.keys()]).toEqual(['gpt-5.3-codex', 'gpt-5.2-codex', 'provider/from-data']);
    expect(pricing.get('provider/from-data')?.outputPerMillion).toBe(3);
    const codex = join(localHome.path, '.codex', 'sessions');
    mkdirSync(codex, { recursive: true });
    const usage = { input_tokens: 100, cached_input_tokens: 60, output_tokens: 20, reasoning_output_tokens: 5 };
    const message = (timestamp: string, total: typeof usage) => JSON.stringify({ timestamp, type: 'event_msg',
      payload: { type: 'token_count', info: { last_token_usage: usage, total_token_usage: total } } });
    writeFileSync(join(codex, 'test.jsonl'), [
      message('2026-10-01T00:00:00Z', usage),
      message('2026-10-01T00:01:00Z', usage),
      message('2026-10-01T00:02:00Z', { input_tokens: 200, cached_input_tokens: 100, output_tokens: 40, reasoning_output_tokens: 10 }),
    ].join('\n'));
    const { loadTokenDashboardData } = await import('@incept/dashboard/adapters');
    const data = await loadTokenDashboardData();
    expect(data.models[0].modelName).toBe('unknown');
    expect(data.totals.totalTokens).toBe(240);
    expect(data.totals.outputTokens).toBe(30);
    expect(data.totals.reasoningTokens).toBe(10);
    expect(data.costs.tokenCoverageRate).toBe(0);
  });

  it('uses appended raw Codex records rather than the older indexed copy', async () => {
    const dir = join(localHome.path, '.aiusage');
    const sessions = join(localHome.path, '.codex', 'sessions');
    mkdirSync(dir);
    mkdirSync(sessions, { recursive: true });
    const file = join(sessions, 'indexed.jsonl');
    const record = (timestamp: string) => JSON.stringify({ timestamp, type: 'event_msg', payload: {
      type: 'token_count', info: { last_token_usage: { input_tokens: 100, output_tokens: 20 } },
    } });
    writeFileSync(file, [record('2026-10-01T00:00:00Z'), record('2026-10-01T00:01:00Z')].join('\n'));
    const db = new DatabaseSync(join(dir, 'cache.db'));
    db.exec('CREATE TABLE records (ts INTEGER, tool TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER, cache_write_tokens INTEGER, thinking_tokens INTEGER, cost REAL, session_id TEXT, source_file TEXT, cwd TEXT)');
    db.prepare('INSERT INTO records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(Date.parse('2026-10-01T00:00:00Z'), 'codex', 'indexed-model', 100, 20, 0, 0, 0, 0, 'indexed', file, '');
    db.close();
    const { loadTokenDashboardData } = await import('@incept/dashboard/adapters');
    const data = await loadTokenDashboardData();
    expect(data.totals.totalTokens).toBe(240);
    expect(data.models).toHaveLength(1);
    expect(data.models[0].modelName).toBe('unknown');
  });

  it('expires its cache and retains small recorded costs until display', async () => {
    let now = Date.parse('2026-10-12T04:00:00Z');
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const dir = join(localHome.path, '.commandcode', 'projects', 'd-desktop-code-code-incept');
    mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({ model: 'from-log', timestamp: '2026-10-12T00:00:00Z', usage: {
      inputTokens: 100, outputTokens: 20, costUsd: 0.000001,
    } }) + '\n';
    const file = join(dir, 'tiny-cost.jsonl');
    writeFileSync(file, line);
    const { loadTokenDashboardData } = await import('@incept/dashboard/adapters');
    expect((await loadTokenDashboardData()).costs.totalCost).toBe(0.000001);
    appendFileSync(file, line);
    now += 15_001;
    const data = await loadTokenDashboardData();
    expect(data.totals.totalTokens).toBe(240);
    expect(data.costs.totalCost).toBe(0.000002);
  });
  it('loads a CommandCode fixture through the public adapter export', async () => {
    const projectDir = join(localHome.path, '.commandcode', 'projects', 'd-desktop-code-code-incept');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'fixture-session.meta.json'), JSON.stringify({ title: 'Fixture session' }));
    writeFileSync(join(projectDir, 'fixture-session.jsonl'), JSON.stringify({
      model: 'fixture-model',
      timestamp: '2026-10-01T04:00:00Z',
      usage: { inputTokens: 1000, cacheReadTokens: 300, outputTokens: 200, costUsd: 0.05 },
    }) + '\n');

    const { loadTokenDashboardData } = await import('@incept/dashboard/adapters');
    const data = await loadTokenDashboardData();

    expect(data.totals).toMatchObject({
      inputTokens: 700,
      cacheReadTokens: 300,
      outputTokens: 200,
      totalTokens: 1200,
      cost: 0.05,
      projectCount: 1,
      sessionCount: 1,
    });
    expect(data.projects[0]).toMatchObject({ projectKey: 'incept', totalTokens: 1200 });
    expect(data.sessions[0]).toMatchObject({
      sessionId: 'cc-fixture-session',
      title: 'Fixture session',
      source: 'CommandCode',
      totalTokens: 1200,
    });
    expect(data.models[0]).toMatchObject({ modelName: 'fixture-model', totalTokens: 1200 });
    expect(data.sources.find((source) => source.sourceId === 'commandcode')).toMatchObject({
      status: 'active', totalTokens: 1200, sessionCount: 1,
    });
  });

  it('returns an empty dashboard when the local home has no usage sources', async () => {
    const { loadTokenDashboardData } = await import('@incept/dashboard/adapters');
    const data = await loadTokenDashboardData();

    expect(data.totals.totalTokens).toBe(0);
    expect(data.sessions).toEqual([]);
    expect(data.projects).toEqual([]);
    expect(data.sources.every((source) => source.status === 'pending')).toBe(true);
  });
});
