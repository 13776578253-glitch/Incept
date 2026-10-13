// @vitest-environment jsdom
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelUsageSummary, ProjectUsageSummary, TokenDashboardData } from '../domain';
import zh from '../messages/zh.json';
import { useExpandableRows } from '../react/hooks/use-expandable-rows';
import { ModelsTable } from '../react/sections/models/models-table';
import { ProjectAttributionTable } from '../react/sections/projects/project-attribution-table';
import { DashboardTableFrame } from '../react/components/dashboard-table-frame';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const tokens = { inputTokens: 1, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0, totalTokens: 1, cost: 0 };
const models: ModelUsageSummary[] = Array.from({ length: 13 }, (_, index) => ({
  ...tokens, modelName: 'test-model-' + index, displayName: 'Model ' + index,
  provider: 'other', source: 'test-client', shareOfTokens: 1 / 13, shareOfCost: 0,
  cacheHitRate: 0, missingPricing: true, slotStatus: 'measured', sessionCount: 1, activeDays: 1,
}));
const projects: ProjectUsageSummary[] = Array.from({ length: 13 }, (_, index) => ({
  ...tokens, projectKey: 'project-' + index, projectName: 'Project ' + index,
  sessionCount: 1, shareOfTokens: 1 / 13, shareOfCost: 0, lastActivity: '2026-10-12T00:00:00Z', modelsUsed: [],
}));
const data = { models, projects, range: '7d', totals: { sessionCount: 13 } } as TokenDashboardData;
const wrap = (children: React.ReactNode) => <NextIntlClientProvider locale="zh" timeZone="Asia/Singapore" messages={{ dashboard: zh }}>{children}</NextIntlClientProvider>;

describe('expandable dashboard tables', () => {
  it('preserves the collapsed viewport when extra rows change column wrapping, and resets internal scroll on collapse', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const bottom = this.tagName === 'TR' ? (this.closest('table')!.querySelectorAll('tr').length > 2 ? 110 : 80) : 0;
      return { top: 0, bottom, left: 0, right: 800, x: 0, y: 0, width: 800, height: bottom, toJSON: () => ({}) };
    });
    const table = (expanded: boolean) => <DashboardTableFrame rowLimit={2} expanded={expanded}>
      <table><tbody>{Array.from({ length: expanded ? 4 : 2 }, (_, index) => <tr key={index}><td>Row {index}</td></tr>)}</tbody></table>
    </DashboardTableFrame>;
    const { container, rerender } = render(table(false));
    const viewport = container.querySelector<HTMLElement>('.dashboard-table-scroll')!;
    expect(viewport.style.height).toBe('80px');
    rerender(table(true));
    expect(viewport.style.height).toBe('80px');
    expect(viewport.style.overflowY).toBe('auto');
    viewport.scrollTop = 50;
    rerender(table(false));
    expect(viewport.scrollTop).toBe(0);
    expect(viewport.style.overflowY).toBe('hidden');
  });

  it('resets expansion when changing filters or windows, including returning to a previous window', () => {
    const { result, rerender } = renderHook(({ scope }) => useExpandableRows(models, 10, scope), { initialProps: { scope: '7d' } });
    expect(result.current.visibleRows).toHaveLength(10);
    fireEvent.click(render(<button onClick={result.current.toggle}>Expand</button>).getByText('Expand'));
    expect(result.current.visibleRows).toHaveLength(13);
    rerender({ scope: '30d' });
    expect(result.current.visibleRows).toHaveLength(10);
    rerender({ scope: '7d' });
    expect(result.current.expanded).toBe(false);
  });

  it('expands and collapses the filtered model table', () => {
    render(wrap(<ModelsTable data={data} selectedModelSource="all" setSelectedModelSource={vi.fn()}
      modelSort="tokens" setModelSort={vi.fn()} modelSourceFilters={[]} sortedModels={models} maxSortedModelMetric={1} />));
    expect(screen.getAllByRole('row')).toHaveLength(11);
    fireEvent.click(screen.getByRole('button', { name: '展开全部 13 个模型' }));
    expect(screen.getAllByRole('row')).toHaveLength(14);
    fireEvent.click(screen.getByRole('button', { name: '收起至前 10 个模型' }));
    expect(screen.getAllByRole('row')).toHaveLength(11);
  });

  it('expands project attribution while retaining project selection behavior', () => {
    const select = vi.fn();
    render(wrap(<ProjectAttributionTable data={data} selectedProjectKey="all" setSelectedProjectKey={select} maxProjectTokens={1} />));
    expect(screen.getAllByRole('row')).toHaveLength(11);
    fireEvent.click(screen.getByRole('button', { name: '展开全部 13 个项目' }));
    expect(screen.getAllByRole('row')).toHaveLength(14);
    fireEvent.click(screen.getByText('Project 12'));
    expect(select).toHaveBeenCalledOnce();
    expect(select.mock.calls[0][0]('all')).toBe('project-12');
    fireEvent.click(screen.getByRole('button', { name: '收起至前 10 个项目' }));
    expect(screen.getAllByRole('row')).toHaveLength(11);
  });
});
