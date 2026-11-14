// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import zh from '../messages/zh.json';
import en from '../messages/en.json';
import { emptyDashboard, type BillingReadResponse, type UsageRange } from '../domain';
import { useBillingPreview } from '../react/hooks/use-billing-preview';
import { buildReferenceTrendDays } from '../react/sections/overview/reference-cost-trend';
import { ProjectsSection } from '../react/sections/projects/projects-section';
import { ModelsSection } from '../react/sections/models/models-section';
import { reconcileDashboardWithBilling } from '../react/reconcile-billing-models';
import { TokenDashboardFeature } from '../react/token-dashboard-feature';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function withMessages(children: React.ReactNode) {
  return <NextIntlClientProvider locale="zh" timeZone="Asia/Singapore" messages={{ dashboard: zh }}>{children}</NextIntlClientProvider>;
}

it('Guest sees all navigation and statistical sections plus three permission placeholders in section 04', async () => {
  render(withMessages(<TokenDashboardFeature data={emptyDashboard()} />));
  expect(screen.getByRole('button', { name: zh.page.range30d })).toBeDefined();
  expect(await screen.findByRole('heading', { name: zh.models.title })).toBeDefined();
  expect(await screen.findByRole('heading', { name: zh.costs.title })).toBeDefined();
  expect(await screen.findByRole('heading', { name: zh.projects.title })).toBeDefined();
  expect(await screen.findAllByText('无权限查看')).toHaveLength(3);
  expect(screen.queryByRole('button', { name: '导入' })).toBeNull();
  expect(screen.queryByRole('heading', { name: zh.costs.reference.diagnostics })).toBeNull();
});

it('restricted project panels never render private records or interactive data controls', () => {
  const data = emptyDashboard();
  data.projects = [{ ...data.totals, projectKey: 'private-key', projectName: 'Private project', workspacePath: 'private-path',
    modelsUsed: [], shareOfTokens: 1, shareOfCost: 1, lastActivity: '2026-10-14' }];
  render(withMessages(<ProjectsSection data={data} canViewDetails={false} />));
  expect(screen.getAllByText('无权限查看')).toHaveLength(3);
  expect(screen.queryByText('Private project')).toBeNull();
  expect(screen.queryByRole('searchbox')).toBeNull();
  expect(screen.queryByRole('table')).toBeNull();
});

it('Pro sees section 04 records while import remains Owner-only', async () => {
  const data = emptyDashboard();
  data.projects = [{ ...data.totals, projectKey: 'readable-key', projectName: 'Readable project',
    modelsUsed: [], shareOfTokens: 1, shareOfCost: 1, lastActivity: '2026-10-14' }];
  render(withMessages(<TokenDashboardFeature data={data} canViewDetails />));
  expect(await screen.findByText('Readable project')).toBeDefined();
  expect(screen.queryByText('无权限查看')).toBeNull();
  expect(screen.queryByRole('button', { name: '导入' })).toBeNull();
});

it('shows the reviewed USD total and coverage to an Owner, then clears them when a window is unavailable', async () => {
  const data = emptyDashboard();
  data.totals.cost = 999;
  const cost = { estimatedCostUsd: '1.25', estimatedTokens: 60, unpricedTokens: 20, excludedTokens: 40 };
  const channel = { estimatedCostUsd: '0.25', estimatedTokens: 20, unpricedTokens: 0, excludedTokens: 0 };
  const fetchDashboard = vi.fn(async (url: string) => {
    if (url === '/api/dashboard/billing?range=30d') {
      return Response.json({ range: '30d', ...cost, tokens: 120, recordedUnknownCurrency: 1, asOf: '2026-10-28T01:00:00Z',
        revision: 3287, liveRevision: 3288, unpricedGroups: 1, conflicted: 2, breakdown: {
          days: [{ day: '2026-10-28', ...cost }],
          models: [{ model: 'provider/model', ...cost, channels: [
            { channel: 'claudeCode', ...channel },
            { channel: 'codex', estimatedCostUsd: '1.00', estimatedTokens: 40, unpricedTokens: 20, excludedTokens: 40 },
          ] }],
          unpriced: [{ channel: 'codex', model: 'provider/unknown', reason: 'RATE_NOT_FOUND', observations: 1 }],
        } });
    }
    if (url.startsWith('/api/dashboard/billing?')) return new Response(null, { status: 503 });
    return Response.json(emptyDashboard('7d'));
  });
  vi.stubGlobal('fetch', fetchDashboard);
  render(withMessages(<TokenDashboardFeature data={data} canImport billingPreviewEnabled />));
  await waitFor(() => expect(screen.getAllByText('$1.25 USD')).toHaveLength(2));
  expect(screen.getAllByText('估算覆盖率 75%')).toHaveLength(2);
  expect(screen.getAllByText(zh.costs.reference.unpricedTokens).length).toBeGreaterThan(0);
  expect(screen.getByText(zh.costs.reference.liveRevision)).toBeDefined();
  expect(screen.getByText('3288')).toBeDefined();
  expect(screen.getAllByText('计费正在从版本 3287 更新至 3288')).toHaveLength(2);
  expect(screen.getByText(zh.costs.reference.unpricedGroups)).toBeDefined();
  expect(screen.getByText(zh.costs.reference.conflicted)).toBeDefined();
  const modelTable = screen.getByRole('table', { name: zh.costs.reference.modelCosts });
  expect(within(modelTable).getByText('$1.25')).toBeDefined();
  fireEvent.change(screen.getByRole('combobox', { name: zh.costs.reference.channel }), { target: { value: 'claudeCode' } });
  expect(within(modelTable).getByText('$0.25')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: zh.overview.trend.metricCost }));
  expect(screen.getByRole('button', { name: '2026-10-28 · $1.25 USD · 20 未估算 Token' })).toBeDefined();
  expect(screen.queryByText('$999.00')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: zh.page.range7d }));
  await waitFor(() => expect(screen.getAllByText(zh.costs.reference.unavailable).length).toBeGreaterThanOrEqual(2));
  expect(screen.queryByText('$1.25 USD')).toBeNull();
  expect(screen.queryByRole('table', { name: zh.costs.reference.modelCosts })).toBeNull();
});

it('keeps the current billing state during refresh and loads anew when the range changes', async () => {
  const respondTo: ((response: Response) => void)[] = [];
  const fetchBilling = vi.fn(() => new Promise<Response>(resolve => {
    respondTo.push(resolve);
  }));
  vi.stubGlobal('fetch', fetchBilling);
  const { result, rerender } = renderHook(
    ({ range, cycle }: { range: UsageRange; cycle: number }) => useBillingPreview(true, range, cycle),
    { initialProps: { range: '30d', cycle: 0 } },
  );
  const first: BillingReadResponse = {
    range: '30d', estimatedCostUsd: '1.25', estimatedTokens: 60, unpricedTokens: 20, excludedTokens: 40,
    members: 3, tokens: 120, recordedUnknownCurrency: 1, asOf: '2026-10-28T01:00:00Z',
    run: 'first', revision: 1, catalog: 'test',
  };
  const second = { ...first, estimatedCostUsd: '2.50', estimatedTokens: 80, unpricedTokens: 0, revision: 2, run: 'second' };
  const respond = (index: number, response: Response) => act(async () => respondTo[index](response));

  expect(result.current).toEqual({ status: 'loading' });
  await respond(0, Response.json(first));
  rerender({ range: '30d', cycle: 1 });
  expect(result.current).toEqual({ status: 'ready', data: first });
  await respond(1, Response.json(second));
  expect(result.current).toEqual({ status: 'ready', data: second });

  rerender({ range: '30d', cycle: 2 });
  expect(result.current).toEqual({ status: 'ready', data: second });
  await respond(2, new Response(null, { status: 503 }));
  expect(result.current).toEqual({ status: 'unavailable' });
  rerender({ range: '30d', cycle: 3 });
  expect(result.current).toEqual({ status: 'unavailable' });

  rerender({ range: '7d', cycle: 3 });
  expect(result.current).toEqual({ status: 'loading' });
  rerender({ range: '30d', cycle: 3 });
  await respond(3, Response.json(first));
  expect(result.current).toEqual({ status: 'loading' });
  await respond(5, Response.json(second));
  expect(result.current).toEqual({ status: 'ready', data: second });
});

it('preserves channel selection across range switches, formats sub-cent totals without rounding to zero, and toggles billing disclosures', async () => {
  const data = emptyDashboard('30d');
  const makeSnapshot = (range: UsageRange, claudeUsd: string, codexUsd: string) => ({
    range,
    estimatedCostUsd: range === 'all' ? '4.00' : '0.0042',
    estimatedTokens: 150,
    unpricedTokens: 50,
    excludedTokens: 10,
    tokens: 210,
    recordedUnknownCurrency: 0,
    asOf: '2026-10-28T01:00:00Z',
    revision: 3290,
    liveRevision: 3290,
    unpricedGroups: 1,
    conflicted: 0,
    breakdown: {
      days: [
        { day: '2026-10-27', estimatedCostUsd: '0', estimatedTokens: 0, unpricedTokens: 50, excludedTokens: 0 },
        { day: '2026-10-28', estimatedCostUsd: range === 'all' ? '4.00' : '0.0042', estimatedTokens: 150, unpricedTokens: 0, excludedTokens: 10 },
      ],
      models: [{
        model: 'deepseek/v4.1-flash',
        estimatedCostUsd: range === 'all' ? '4.00' : '0.0042',
        estimatedTokens: 150,
        unpricedTokens: 0,
        excludedTokens: 0,
        channels: [
          { channel: 'claudeCode', estimatedCostUsd: claudeUsd, estimatedTokens: 50, unpricedTokens: 0, excludedTokens: 0 },
          { channel: 'codex', estimatedCostUsd: codexUsd, estimatedTokens: 100, unpricedTokens: 0, excludedTokens: 0 },
        ],
      }],
      unpriced: [{ channel: 'codex', model: 'provider/new-model', reason: 'RATE_NOT_FOUND', observations: 2 }],
    },
  });

  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/dashboard/billing?range=30d') return Response.json(makeSnapshot('30d', '0.0042', '0.00'));
    if (url === '/api/dashboard/billing?range=all') return Response.json(makeSnapshot('all', '1.50', '2.50'));
    return Response.json(emptyDashboard('all'));
  }));

  render(withMessages(<TokenDashboardFeature data={data} canImport billingPreviewEnabled />));
  await waitFor(() => expect(screen.getAllByText('<$0.01 USD')).toHaveLength(2));
  expect(screen.queryByText('$0.00 USD')).toBeNull();

  const channelSelect = screen.getByRole('combobox', { name: zh.costs.reference.channel }) as HTMLSelectElement;
  fireEvent.change(channelSelect, { target: { value: 'claudeCode' } });
  const modelTable = screen.getByRole('table', { name: zh.costs.reference.modelCosts });
  expect(within(modelTable).getByText('<$0.01')).toBeDefined();

  fireEvent.click(screen.getByRole('button', { name: zh.page.rangeAll }));
  await waitFor(() => expect(screen.getAllByText('$4.00 USD')).toHaveLength(2));
  expect((screen.getByRole('combobox', { name: zh.costs.reference.channel }) as HTMLSelectElement).value).toBe('claudeCode');
  expect(within(screen.getByRole('table', { name: zh.costs.reference.modelCosts })).getByText('$1.50')).toBeDefined();

  const unpricedSummary = screen.getByText(zh.costs.reference.unpricedDetails).closest('summary')!;
  const unpricedDetails = unpricedSummary.closest('details')!;
  unpricedDetails.open = true;
  fireEvent(unpricedDetails, new Event('toggle'));
  const unpricedTable = screen.getByRole('table', { name: zh.costs.reference.unpricedDetails });
  expect(unpricedTable.className).toContain('dashboard-data-table');
  expect(within(unpricedTable).getByText('provider/new-model')).toBeDefined();

  const dailySummary = screen.getByText(zh.costs.reference.dailyCosts).closest('summary')!;
  const dailyDetails = dailySummary.closest('details')!;
  dailyDetails.open = true;
  fireEvent(dailyDetails, new Event('toggle'));
  const dailyTable = screen.getByRole('table', { name: zh.costs.reference.dailyCosts });
  expect(dailyTable.className).toContain('dashboard-data-table');
  expect(within(dailyTable).getByText('2026-10-27')).toBeDefined();

  fireEvent.click(screen.getByRole('button', { name: zh.overview.trend.metricCost }));
  expect(screen.getByRole('button', { name: '2026-10-28 · $4.00 USD · 0 未估算 Token' })).toBeDefined();
});

it('keeps en and zh costs.reference localization keys aligned without Chinese full stops', () => {
  const collectKeys = (node: unknown, prefix = ''): string[] => {
    if (!node || typeof node !== 'object') return [prefix];
    return Object.entries(node as Record<string, unknown>)
      .flatMap(([key, value]) => collectKeys(value, prefix ? `${prefix}.${key}` : key));
  };
  const collectStrings = (node: unknown): string[] => {
    if (typeof node === 'string') return [node];
    if (!node || typeof node !== 'object') return [];
    return Object.values(node as Record<string, unknown>).flatMap(collectStrings);
  };
  expect(collectKeys(zh.costs.reference).sort()).toEqual(collectKeys(en.costs.reference).sort());
  for (const text of collectStrings(zh.costs.reference)) {
    expect(text).not.toContain('。');
  }
});

it('fills continuous calendar dates for all-range reference cost trend and preserves model ranking prices for Owner', async () => {
  const allData = {
    range: 'all',
    estimatedCostUsd: '3.00',
    estimatedTokens: 300,
    unpricedTokens: 0,
    excludedTokens: 0,
    members: 2,
    tokens: 300,
    recordedUnknownCurrency: 0,
    asOf: '2026-10-28T01:00:00Z',
    run: 'continuous',
    revision: 3331,
    catalog: 'test',
    breakdown: {
      days: [
        { day: '2026-10-26', estimatedCostUsd: '1.00', estimatedTokens: 100, unpricedTokens: 0, excludedTokens: 0 },
        { day: '2026-10-28', estimatedCostUsd: '2.00', estimatedTokens: 200, unpricedTokens: 0, excludedTokens: 0 },
      ],
      models: [],
      unpriced: [],
    },
  } satisfies BillingReadResponse;

  expect(buildReferenceTrendDays(allData).map(day => [day.day, day.estimatedCostUsd])).toEqual([
    ['2026-10-26', '1.00'],
    ['2026-10-27', '0'],
    ['2026-10-28', '2.00'],
  ]);

  const data = emptyDashboard('30d');
  data.totals.cost = 999;
  data.models = [{
    modelName: 'gpt-5.4',
    displayName: 'GPT-5.4',
    provider: 'openai',
    source: 'Codex',
    sourcesUsed: ['Codex'],
    inputTokens: 100,
    outputTokens: 50,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    reasoningTokens: 0,
    totalTokens: 150,
    cost: 12.34,
    shareOfTokens: 1,
    shareOfCost: 1,
    cacheHitRate: 0,
    missingPricing: false,
    sessionCount: 1,
    activeDays: 1,
  }];

  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/dashboard/billing?range=30d') return Response.json({ ...allData, range: '30d' });
    return Response.json(data);
  }));

  render(withMessages(<TokenDashboardFeature data={data} canImport billingPreviewEnabled />));
  await waitFor(() => expect(screen.getAllByText('$3.00 USD')).toHaveLength(2));
  expect(screen.queryByText('$999.00')).toBeNull();
  expect(screen.getAllByText('$12.34').length).toBeGreaterThan(0);
});

it('reconciles managed billing prices onto model ranking, models table, sources, and drops Unpriced on codex-auto-review', async () => {
  const data = emptyDashboard('30d');
  data.daily = [{
    date: '2026-10-28',
    inputTokens: 1000,
    outputTokens: 500,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    reasoningTokens: 0,
    totalTokens: 1500,
    cost: 1.0,
    modelsUsed: [],
    modelBreakdowns: [],
  }];
  const baseModel = {
    inputTokens: 100,
    outputTokens: 50,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    reasoningTokens: 0,
    sessionCount: 1,
    activeDays: 1,
    cacheHitRate: 0,
  };
  data.models = [
    {
      ...baseModel,
      modelName: 'gemini-3.8-flash-n',
      displayName: 'gemini-3.8-flash-n',
      provider: 'gemini',
      source: 'Antigravity',
      sourcesUsed: ['Antigravity'],
      totalTokens: 200,
      cost: 300,
      shareOfTokens: 0.4,
      shareOfCost: 0.6,
      missingPricing: false,
    },
    {
      ...baseModel,
      modelName: 'gemini-3.8-flash-tiered',
      displayName: 'gemini-3.8-flash-tiered',
      provider: 'gemini',
      source: 'Antigravity',
      sourcesUsed: ['Antigravity'],
      totalTokens: 100,
      cost: 100,
      shareOfTokens: 0.2,
      shareOfCost: 0.2,
      missingPricing: false,
    },
    {
      ...baseModel,
      modelName: 'gemini-4-hydrogen',
      displayName: 'gemini-4-hydrogen',
      provider: 'gemini',
      source: 'Antigravity',
      sourcesUsed: ['Antigravity'],
      totalTokens: 100,
      cost: 0,
      shareOfTokens: 0.1,
      shareOfCost: 0,
      missingPricing: true,
    },
    {
      ...baseModel,
      modelName: 'gpt-6.1-terra',
      displayName: 'gpt-6.1-terra',
      provider: 'openai',
      source: 'Codex CLI',
      sourcesUsed: ['Codex CLI'],
      totalTokens: 100,
      cost: 0,
      shareOfTokens: 0.1,
      shareOfCost: 0,
      missingPricing: true,
    },
    {
      ...baseModel,
      modelName: 'codex-auto-review',
      displayName: 'Codex Auto-review',
      provider: 'openai',
      source: 'Codex CLI',
      sourcesUsed: ['Codex CLI'],
      totalTokens: 100,
      cost: 0,
      shareOfTokens: 0.1,
      shareOfCost: 0,
      missingPricing: true,
    },
    {
      ...baseModel,
      modelName: 'gemini-4-argon-trial',
      displayName: 'gemini-4-argon-trial',
      provider: 'gemini',
      source: 'Antigravity',
      sourcesUsed: ['Antigravity'],
      totalTokens: 50,
      cost: 0,
      shareOfTokens: 0.05,
      shareOfCost: 0,
      missingPricing: true,
    },
    {
      ...baseModel,
      modelName: 'claude-opus-5-5',
      displayName: 'Claude Opus 5.5',
      provider: 'claude',
      source: 'Claude Code',
      sourcesUsed: ['Claude Code'],
      totalTokens: 500,
      cost: 0,
      shareOfTokens: 0.03,
      shareOfCost: 0,
      missingPricing: true,
    },
    {
      ...baseModel,
      modelName: 'claude-opus-5-5-low',
      displayName: 'Claude Opus 5.5 Low',
      provider: 'claude',
      source: 'Antigravity',
      sourcesUsed: ['Antigravity'],
      totalTokens: 50,
      cost: 0,
      shareOfTokens: 0.02,
      shareOfCost: 0,
      missingPricing: true,
    },
  ];
  data.sources = [
    {
      sourceId: 'antigravity',
      label: 'Antigravity',
      descriptionKey: 'antigravity',
      status: 'active',
      totalTokens: 500,
      inputTokens: 300,
      outputTokens: 200,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      reasoningTokens: 0,
      cost: 400,
      missingPricing: true,
      sessionCount: 2,
      modelsUsed: ['gemini-4-hydrogen'],
      shareOfTokens: 0.5,
      shareOfCost: 0.8,
    },
    {
      sourceId: 'codex',
      label: 'Codex CLI',
      descriptionKey: 'codex',
      status: 'active',
      totalTokens: 200,
      inputTokens: 100,
      outputTokens: 100,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      reasoningTokens: 0,
      cost: 0,
      missingPricing: true,
      sessionCount: 1,
      modelsUsed: ['gpt-6.1-terra'],
      shareOfTokens: 0.5,
      shareOfCost: 0.2,
    },
  ];

  // Without billing preview, codex-auto-review still never renders Unpriced badge.
  const withoutBilling = render(withMessages(<ModelsSection data={data} />));
  const autoReviewRowGuest = screen.getByText('codex-auto-review').closest('tr')!;
  expect(within(autoReviewRowGuest).queryByText(zh.models.table.unpricedBadge)).toBeNull();
  const terraRowGuest = screen.getAllByText('gpt-6.1-terra')[0].closest('tr')!;
  expect(within(terraRowGuest).getByText(zh.models.table.unpricedBadge)).toBeDefined();
  withoutBilling.unmount();

  const billing: BillingReadResponse = {
    range: '30d',
    estimatedCostUsd: '545.46',
    estimatedTokens: 600,
    unpricedTokens: 500,
    excludedTokens: 100,
    members: 8,
    tokens: 1200,
    recordedUnknownCurrency: 0,
    asOf: '2026-10-28T01:00:00Z',
    run: 'reconcile',
    revision: 3336,
    catalog: 'test',
    breakdown: {
      days: [{ day: '2026-10-28', estimatedCostUsd: '545.46', estimatedTokens: 600, unpricedTokens: 500, excludedTokens: 100 }],
      models: [
        {
          model: 'gemini-3.8-flash',
          estimatedCostUsd: '400.00',
          estimatedTokens: 300,
          unpricedTokens: 0,
          excludedTokens: 0,
          channels: [{ channel: 'antigravity', estimatedCostUsd: '400.00', estimatedTokens: 300, unpricedTokens: 0, excludedTokens: 0 }],
        },
        {
          model: 'gemini-4-hydrogen',
          estimatedCostUsd: '104.81',
          estimatedTokens: 100,
          unpricedTokens: 0,
          excludedTokens: 0,
          channels: [{ channel: 'antigravity', estimatedCostUsd: '104.81', estimatedTokens: 100, unpricedTokens: 0, excludedTokens: 0 }],
        },
        {
          model: 'gpt-6.1-terra',
          estimatedCostUsd: '36.18',
          estimatedTokens: 100,
          unpricedTokens: 0,
          excludedTokens: 0,
          channels: [{ channel: 'codex', estimatedCostUsd: '36.18', estimatedTokens: 100, unpricedTokens: 0, excludedTokens: 0 }],
        },
        {
          model: 'gemini-4-argon',
          estimatedCostUsd: '4.38',
          estimatedTokens: 50,
          unpricedTokens: 0,
          excludedTokens: 0,
          channels: [{ channel: 'antigravity', estimatedCostUsd: '4.38', estimatedTokens: 50, unpricedTokens: 0, excludedTokens: 0 }],
        },
        {
          model: 'codex-auto-review',
          estimatedCostUsd: '0',
          estimatedTokens: 0,
          unpricedTokens: 0,
          excludedTokens: 100,
          channels: [{ channel: 'codex', estimatedCostUsd: '0', estimatedTokens: 0, unpricedTokens: 0, excludedTokens: 100 }],
        },
        {
          model: 'claude-opus-5-5',
          estimatedCostUsd: '0.09',
          estimatedTokens: 50,
          unpricedTokens: 500,
          excludedTokens: 0,
          channels: [
            { channel: 'claudeCode', estimatedCostUsd: '0', estimatedTokens: 0, unpricedTokens: 500, excludedTokens: 0 },
            { channel: 'antigravity', estimatedCostUsd: '0.09', estimatedTokens: 50, unpricedTokens: 0, excludedTokens: 0 },
          ],
        },
      ],
      unpriced: [],
    },
  };

  const reconciled = reconcileDashboardWithBilling(data, { status: 'ready', data: billing });
  expect(reconciled.excludedModels.has('codex-auto-review')).toBe(true);
  expect(reconciled.data.daily[0].cost).toBe(545.46);

  const byName = new Map(reconciled.data.models.map(m => [m.modelName, m]));
  expect(byName.get('gemini-3.8-flash-n')).toMatchObject({ cost: 300, missingPricing: false });
  expect(byName.get('gemini-3.8-flash-tiered')).toMatchObject({ cost: 100, missingPricing: false });
  expect(byName.get('gemini-4-hydrogen')).toMatchObject({ cost: 104.81, missingPricing: false });
  expect(byName.get('gpt-6.1-terra')).toMatchObject({ cost: 36.18, missingPricing: false });
  expect(byName.get('gemini-4-argon-trial')).toMatchObject({ cost: 4.38, missingPricing: false });
  expect(byName.get('claude-opus-5-5')).toMatchObject({ cost: 0, missingPricing: true });
  expect(byName.get('claude-opus-5-5-low')).toMatchObject({ cost: 0.09, missingPricing: false });
  expect(reconciled.data.sources[0].cost).toBeCloseTo(509.28, 6);
  expect(reconciled.data.sources[0].missingPricing).toBe(false);
  expect(reconciled.data.sources[1]).toMatchObject({ sourceId: 'codex', cost: 36.18, missingPricing: false });

  render(withMessages(<ModelsSection data={reconciled.data} excludedModels={reconciled.excludedModels} />));
  expect(within(screen.getAllByText('gemini-4-hydrogen')[0].closest('tr')!).getByText('$104.81')).toBeDefined();
  expect(within(screen.getAllByText('gpt-6.1-terra')[0].closest('tr')!).getByText('$36.18')).toBeDefined();
  expect(within(screen.getAllByText('gemini-4-argon-trial')[0].closest('tr')!).getByText('$4.38')).toBeDefined();
  const autoReviewRowOwner = screen.getByText('codex-auto-review').closest('tr')!;
  expect(within(autoReviewRowOwner).getByText('—')).toBeDefined();
  expect(within(autoReviewRowOwner).queryByText(zh.models.table.unpricedBadge)).toBeNull();
  const opusRow = screen.getByText('claude-opus-5-5').closest('tr')!;
  expect(within(opusRow).getByText(zh.models.table.unpricedBadge)).toBeDefined();
});
