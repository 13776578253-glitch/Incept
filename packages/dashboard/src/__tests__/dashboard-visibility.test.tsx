// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import zh from '../messages/zh.json';
import en from '../messages/en.json';
import { emptyDashboard, type BillingReadResponse, type UsageRange } from '../domain';
import { useBillingPreview } from '../react/hooks/use-billing-preview';
import { ProjectsSection } from '../react/sections/projects/projects-section';
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
