// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import zh from '../messages/zh.json';
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
  const fetchDashboard = vi.fn(async (url: string) => {
    if (url === '/api/dashboard/billing?range=30d') {
      return Response.json({ range: '30d', estimatedCostUsd: '1.25', estimatedTokens: 60, unpricedTokens: 20,
        excludedTokens: 40, tokens: 120, recordedUnknownCurrency: 1, asOf: '2026-10-28T01:00:00Z' });
    }
    if (url.startsWith('/api/dashboard/billing?')) return new Response(null, { status: 503 });
    return Response.json(emptyDashboard('7d'));
  });
  vi.stubGlobal('fetch', fetchDashboard);
  render(withMessages(<TokenDashboardFeature data={data} canImport billingPreviewEnabled />));
  await waitFor(() => expect(screen.getAllByText('$1.25 USD')).toHaveLength(2));
  expect(screen.getAllByText('估算覆盖率 75%')).toHaveLength(2);
  expect(screen.getByText(zh.costs.reference.unpricedTokens)).toBeDefined();
  expect(screen.queryByText('$999.00')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: zh.page.range7d }));
  await waitFor(() => expect(screen.getAllByText(zh.costs.reference.unavailable)).toHaveLength(2));
  expect(screen.queryByText('$1.25 USD')).toBeNull();
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
