// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionUsageItem, TokenDashboardData } from '../domain';
import zh from '../messages/zh.json';
import { ExpandRowsButton } from '../react/components/expand-rows-button';
import { useProjectsState } from '../react/sections/projects/use-projects-state';
import { PeriodSummary } from '../react/sections/overview/period-summary';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const tokens = { inputTokens: 1, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0, cost: 0, totalTokens: 1 };

describe('dashboard collapse and model summary', () => {
  it('keeps the page in place when collapsing an internally scrolling table', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: -300, top: -300, left: 0, right: 800, bottom: 600, width: 800, height: 900, toJSON: () => ({}),
    });
    function Card() {
      const [expanded, setExpanded] = useState(true);
      return <div><h3>Table heading</h3><ExpandRowsButton preservePagePosition expanded={expanded} count={20} limit={10}
        expandLabel="Expand" collapseLabel="Collapse" onToggle={() => setExpanded(value => !value)} /></div>;
    }
    render(<Card />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(scroll).not.toHaveBeenCalled();
  });
  it('returns a collapsed table to its heading after scrolling into its expanded rows', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(1000);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: -300, top: -300, left: 0, right: 800, bottom: 600, width: 800, height: 900, toJSON: () => ({}),
    });
    function Card() {
      const [expanded, setExpanded] = useState(true);
      return <div><h3>Table heading</h3><ExpandRowsButton expanded={expanded} count={20} limit={10}
        expandLabel="Expand" collapseLabel="Collapse" onToggle={() => setExpanded(value => !value)} /></div>;
    }
    render(<Card />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(scroll).toHaveBeenCalledWith({ top: 604, behavior: 'instant' });
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Table heading' }));
  });

  it('resets expanded sessions when changing search, project or time range', async () => {
    const sessions: SessionUsageItem[] = Array.from({ length: 14 }, (_, index) => ({
      ...tokens, sessionId: 'session-' + index, projectKey: 'project-' + index % 2,
      projectName: 'Project ' + index % 2, source: 'client', modelsUsed: [], modelBreakdowns: [],
      firstActivity: '2026-10-12T00:00:00Z', lastActivity: '2026-10-12T00:01:00Z', durationMinutes: 1,
    }));
    const { result, rerender } = renderHook(({ range }: { range: '7d' | '30d' }) =>
      useProjectsState({ sessions, projects: [], range } as unknown as TokenDashboardData),
      { initialProps: { range: '7d' } });
    await act(async () => { result.current.toggleSessions(); });
    expect(result.current.visibleSessions).toHaveLength(14);
    await act(async () => { result.current.setSessionSearch('client'); });
    expect(result.current.showAllSessions).toBe(false);
    expect(result.current.visibleSessions).toHaveLength(12);
    await act(async () => { result.current.toggleSessions(); result.current.setSelectedProjectKey('project-0'); });
    expect(result.current.showAllSessions).toBe(false);
    await act(async () => { result.current.toggleSessions(); });
    rerender({ range: '30d' });
    expect(result.current.showAllSessions).toBe(false);
  });

  it('shows all active models instead of cutting off models beyond six', () => {
    const models = Array.from({ length: 9 }, (_, index) => ({ ...tokens, modelName: 'active-' + index }));
    const period = { ...tokens, totalTokens: 9, inputTokens: 9, date: '2026-10-12', label: '10-12',
      fullLabel: '2026-10-12', modelsUsed: models.map(model => model.modelName), modelBreakdowns: models };
    render(<NextIntlClientProvider locale="zh" timeZone="Asia/Singapore" messages={{ dashboard: zh }}>
      <PeriodSummary selectedPeriodItem={period} />
    </NextIntlClientProvider>);
    expect(screen.getByText('active-8')).toBeDefined();
    expect(document.querySelector('.dashboard-period-model-track')?.children).toHaveLength(10);
  });
});
