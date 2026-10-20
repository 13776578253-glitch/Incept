// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import type { DailyUsagePoint } from '../domain';
import zh from '../messages/zh.json';
import { modelSeries, modelShares, tokenShares } from '../react/sections/overview/trend-series';
import { useOverviewState } from '../react/sections/overview/use-overview-state';
import { TrendChart } from '../react/sections/overview/trend-chart';
import type { TokenDashboardData } from '../domain';
import { emptyDashboard } from '../domain';
import { ModelPricingTable } from '../react/sections/costs/model-pricing-table';

afterEach(cleanup);
const emptyTokens = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0, cost: 0, totalTokens: 0 };
const point: DailyUsagePoint = {
  ...emptyTokens, date: '2026-10-12', inputTokens: 100, outputTokens: 50,
  cacheReadTokens: 300, cacheCreationTokens: 25, reasoningTokens: 25, totalTokens: 500,
  modelsUsed: ['model-a', 'model-b'], modelBreakdowns: [
    { ...emptyTokens, modelName: 'model-a', inputTokens: 300 },
    { ...emptyTokens, modelName: 'model-b', inputTokens: 200 },
  ],
};
const wrap = (children: React.ReactNode) => <NextIntlClientProvider locale="zh" timeZone="Asia/Singapore" messages={{ dashboard: zh }}>{children}</NextIntlClientProvider>;

describe('daily consumption and model shares', () => {
  it('labels peak and off-peak only in Model Shares and retains one pricing row', () => {
    const modelName = 'deepseek/deepseek-v4.1-flash';
    const billing = {
      peak: { totalTokens: 300, cost: 1.18, nominalCost: .59, requests: 101 },
      offPeak: { totalTokens: 200, cost: .23, nominalCost: .23, requests: 75 },
    };
    const day = { ...point, cost: 1.41, modelBreakdowns: [
      { ...point.modelBreakdowns[0], modelName, inputTokens: 500, cost: 1.41, billing },
    ] };
    const props = { trendItems: [{ ...day, label: '10-14', fullLabel: '2026-10-14' }], activeTrendIndex: 0,
      maxTrendValue: 500, setSelectedTrendIndex: () => {} };
    const { rerender, container } = render(wrap(<TrendChart {...props} trendMetric="models" />));
    expect(screen.getByRole('img', { name: modelName + ' · 高峰 2×: 60.0%' })).toBeDefined();
    expect(screen.getByRole('img', { name: modelName + ' · 平峰 1×: 40.0%' })).toBeDefined();
    expect(container.querySelector('.dashboard-trend-legend')?.textContent).toContain('$1.18');
    const data = emptyDashboard();
    data.models = [{ ...point, modelName, displayName: modelName, provider: 'deepseek', source: 'CommandCode / OpenCode',
      billing, cost: 1.41, missingPricing: false, shareOfTokens: 1, shareOfCost: 1, cacheHitRate: 0,
      sessionCount: 1, activeDays: 1, unitPricing: { inputPerMillion: .15, outputPerMillion: .6 } }];
    rerender(wrap(<ModelPricingTable data={data} maxModelCost={1.41} />));
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText(modelName)).toBeDefined();
    expect(screen.getByText('$1.41')).toBeDefined();
    expect(screen.getByText('高峰：$0.3 / $1.2 / — / —')).toBeDefined();
    expect(screen.queryByText(/高峰溢价|此处展示基础价/)).toBeNull();
  });

  it('uses the same daily denominator for Input, Output, Cache Read, Cache Write and Reasoning', () => {
    const parts = tokenShares(point);
    expect(Object.fromEntries(parts.map(part => [part.id, part.share]))).toEqual({
      input: .2, output: .1, cacheRead: .6, cacheWrite: .05, reasoning: .05,
    });
    expect(parts.reduce((sum, part) => sum + part.share, 0)).toBeCloseTo(1);
    expect(tokenShares({ ...point, ...emptyTokens }).every(part => part.share === 0)).toBe(true);
  });

  it('aggregates duplicate model entries and keeps model colors consistent between days', () => {
    const day = { ...point, modelBreakdowns: [
      { ...emptyTokens, modelName: 'model-a', inputTokens: 100 },
      { ...emptyTokens, modelName: 'model-a', cacheReadTokens: 200 },
      { ...emptyTokens, modelName: 'model-b', reasoningTokens: 200 },
    ] };
    const series = modelSeries([day, point]);
    const parts = modelShares(day, series);
    expect(parts.map(part => [part.id, part.share])).toEqual([['model-a', .6], ['model-b', .4]]);
    expect(parts.map(part => part.color)).toEqual(modelShares(point, series).map(part => part.color));
    expect(modelShares({ ...day, modelBreakdowns: [] }, series)).toEqual([]);
  });

  it('renders the daily split and model split with accessible percentages', () => {
    const props = { trendItems: [{ ...point, label: '10-12', fullLabel: point.date }], activeTrendIndex: 0,
      maxTrendValue: 500, setSelectedTrendIndex: () => {} };
    const { rerender } = render(wrap(<TrendChart {...props} trendMetric="stacked" />));
    expect(screen.getByRole('img', { name: 'Input: 20.0%' })).toBeDefined();
    expect(screen.getByRole('img', { name: 'Cache Read: 60.0%' })).toBeDefined();
    rerender(wrap(<TrendChart {...props} trendMetric="models" />));
    expect(screen.getByRole('img', { name: 'model-a: 60.0%' })).toBeDefined();
    expect(screen.getByRole('img', { name: 'model-b: 40.0%' })).toBeDefined();
  });

  it('has a daily timeline controlled only by the shared window', async () => {
    const data = { monthly: [{ month: '2026-09' }], models: [] } as unknown as TokenDashboardData;
    const { result } = renderHook(() => useOverviewState([point], data, 999));
    expect(result.current.trendItems.map(item => item.fullLabel)).toEqual(['2026-10-12']);
    await act(async () => result.current.setTrendMetric('models'));
    expect(result.current.trendMetric).toBe('models');
  });

  it('preserves daily volume when stacking models instead of stretching every day to 100%', () => {
    const smallDay = {
      ...point, date: '2026-10-11', totalTokens: 250,
      inputTokens: 50, outputTokens: 25, cacheReadTokens: 150, cacheCreationTokens: 15, reasoningTokens: 10,
      modelBreakdowns: [
        { ...emptyTokens, modelName: 'model-a', inputTokens: 150, totalTokens: 150 },
        { ...emptyTokens, modelName: 'model-b', inputTokens: 100, totalTokens: 100 },
      ],
    };
    const items = [smallDay, point].map(day => ({ ...day, label: day.date.slice(5), fullLabel: day.date }));
    const props = { trendItems: items, activeTrendIndex: 1, maxTrendValue: 500, setSelectedTrendIndex: () => {} };
    const { container, rerender } = render(wrap(<TrendChart {...props} trendMetric="models" />));
    expect([...container.querySelectorAll<HTMLElement>('.dashboard-trend-bar')].map(bar => bar.style.height)).toEqual(['50%', '100%']);
    expect(screen.getByRole('button', { name: /2026-10-11/ }).textContent).toContain('250');
    rerender(wrap(<TrendChart {...props} trendMetric="stacked" />));
    expect([...container.querySelectorAll<HTMLElement>('.dashboard-trend-bar')].map(bar => bar.style.height)).toEqual(['100%', '100%']);
  });
});
