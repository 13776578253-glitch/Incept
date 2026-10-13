// @vitest-environment jsdom
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import zh from '../messages/zh.json';
import type { DailyUsagePoint, ModelUsageSummary, TokenDashboardData } from '../domain';
import { calendarMonth, adjacentMonth } from '../react/sections/overview/calendar-month';
import { UsageCalendar } from '../react/sections/overview/usage-calendar';
import { useOverviewState } from '../react/sections/overview/use-overview-state';
import { ModelHeatmap } from '../react/sections/overview/model-heatmap';
import { DashboardToolbar } from '../react/components/dashboard-toolbar';

afterEach(cleanup);
const tokens = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0, totalTokens: 0, cost: 0 };
const points: DailyUsagePoint[] = ['2026-09-30', '2026-10-01', '2026-10-02'].map((date, index) => ({
  ...tokens, date, totalTokens: index * 100, modelBreakdowns: [], modelsUsed: [],
}));
const wrap = (children: React.ReactNode) => <NextIntlClientProvider locale="zh" timeZone="Asia/Singapore" messages={{ dashboard: zh }}>{children}</NextIntlClientProvider>;

describe('calendar and matrix presentation', () => {
  it('builds six complete calendar weeks including leap days and year boundaries', () => {
    const february = calendarMonth('2024-02');
    expect(february).toHaveLength(42);
    expect(february[0].key).toBe('2024-01-29');
    expect(february.filter(day => day.inMonth)).toHaveLength(29);
    expect(february.some(day => day.key === '2024-02-29')).toBe(true);
    expect(adjacentMonth('2026-01', -1)).toBe('2025-12');
    expect(adjacentMonth('2026-12', 1)).toBe('2027-01');
  });

  it('navigates actual months, disables dates outside the window and selects the correct record', () => {
    const select = vi.fn();
    render(wrap(<UsageCalendar points={points} selectedDate="2026-10-02" onSelect={select} />));
    expect(screen.getAllByRole('gridcell')).toHaveLength(42);
    expect((screen.getByRole('button', { name: '下个月' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '2026-10-03: —' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '2026-10-01: 100' }));
    expect(select).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: '上个月' }));
    expect(screen.getByRole('heading', { name: '2026年9月' })).toBeDefined();
    expect((screen.getByRole('button', { name: '上个月' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '2026-09-30: 0' }));
    expect(select).toHaveBeenLastCalledWith(0);
  });

  it('chooses up to ten active models by current-window throughput and updates when the window changes', () => {
    const models = Array.from({ length: 13 }, (_, index) => ({ modelName: 'model-' + index })) as ModelUsageSummary[];
    const day = { ...points[0], modelBreakdowns: models.map((model, index) => ({ ...tokens, modelName: model.modelName, inputTokens: index })) };
    const data = { models, monthly: [] } as unknown as TokenDashboardData;
    const { result, rerender } = renderHook(({ daily }) => useOverviewState(daily, data, 999), { initialProps: { daily: [day] } });
    expect(result.current.matrixModels.map(model => model.modelName)).toEqual(Array.from({ length: 10 }, (_, index) => 'model-' + (12 - index)));
    rerender({ daily: [{ ...day, modelBreakdowns: [{ ...tokens, modelName: 'model-1', cacheCreationTokens: 20, reasoningTokens: 10 }] }] });
    expect(result.current.matrixModels.map(model => model.modelName)).toEqual(['model-1']);
    render(wrap(<ModelHeatmap points={[day]} models={result.current.matrixModels} />));
    expect(screen.getAllByRole('rowheader')).toHaveLength(1);
  });
});

describe('toolbar presentation', () => {
  it('has three shared windows and announces refresh without a fabricated percentage', () => {
    const props = { rangePreset: '7d' as const, setRangePreset: vi.fn(), setSelectedTrendIndex: vi.fn(),
      data: { updatedAt: '' } as TokenDashboardData, isRefreshing: true, refreshError: false, onRefresh: vi.fn(), refreshCycle: 1, isPollingPaused: false };
    const { rerender } = render(wrap(<DashboardToolbar {...props} />));
    expect(screen.queryByRole('button', { name: '统计口径说明' })).toBeNull();
    expect(screen.queryByRole('button', { name: '近 14 天' })).toBeNull();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '近 30 天' }));
    expect(props.setRangePreset).toHaveBeenCalledWith('30d');
    rerender(wrap(<DashboardToolbar {...props} isRefreshing={false} />));
    expect(screen.getByRole('progressbar', { name: zh.page.autoRefresh })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '立即刷新' }));
    expect(props.onRefresh).toHaveBeenCalledOnce();
  });
});
