import { describe, expect, it } from 'vitest';
import { summarizeUsageEvents } from '../adapters/local/aggregation/summarize';
import type { RawUsageEvent } from '../adapters/local/types';
import { dashboardDate, dateWindow } from '../domain';
import { formatPercent } from '../react/formatters';

function event(overrides: Partial<RawUsageEvent> = {}): RawUsageEvent {
  return {
    sourceId: 'commandcode', sourceLabel: 'CommandCode', sessionId: 'same-session',
    projectKey: 'test', projectName: 'Test', modelName: 'model-from-log',
    timestampMs: Date.parse('2026-10-10T04:00:00Z'), dateKey: '2026-10-10', monthKey: '2026-10',
    inputTokens: 25, cacheReadTokens: 75, outputTokens: 10, reasoningTokens: 5,
    cacheCreationTokens: 0, cost: 0.01, missingPricing: false, ...overrides,
  };
}

describe('usage calculations', () => {
  it('formats bounded fractions once and includes all output exactly once', () => {
    const data = summarizeUsageEvents([event()], 'missing-home', new Map(), 0);
    expect(data.totals.totalTokens).toBe(115);
    expect(data.totals.cacheHitRate).toBe(0.75);
    expect(formatPercent(data.totals.cacheHitRate, 2)).toBe('75.00%');
    expect(formatPercent(data.totals.outputToInputRatio, 2)).toBe('15.00%');
    expect(formatPercent(data.costs.tokenCoverageRate)).toBe('100.0%');
    expect(data.sessions[0].modelBreakdowns[0].totalTokens).toBe(data.totals.totalTokens);
    expect(data.daily[0].modelBreakdowns[0].outputTokens).toBe(10);
    expect(data.daily[0].modelBreakdowns[0].reasoningTokens).toBe(5);
  });

  it('keeps unknown requests out of coverage even when the same model has known costs', () => {
    const data = summarizeUsageEvents([event(), event({ missingPricing: true, cost: 0 })], 'missing-home', new Map(), 0);
    expect(data.costs.pricedTokens).toBe(115);
    expect(data.costs.unpricedTokens).toBe(115);
    expect(data.costs.tokenCoverageRate).toBe(0.5);
    expect(data.costs.totalCost).toBe(0.01);
    expect(data.costs.unpricedModels[0].totalTokens).toBe(115);
    expect(data.models[0].missingPricing).toBe(true);
    expect(data.sessions[0].modelBreakdowns[0].missingPricing).toBe(true);
  });

  it('does not claim 100% coverage for empty data', () => {
    const data = summarizeUsageEvents([], 'missing-home', new Map(), 0);
    expect(data.costs.tokenCoverageRate).toBe(0);
    expect(data.costs.modelCoverageRate).toBe(0);
    expect(data.updatedAt).toBe('');
  });

  it('uses Singapore calendar days across a month boundary and fills inactive days', () => {
    const window = dateWindow('7d', Date.parse('2026-10-02T16:05:00Z'));
    expect(window).toEqual({ from: '2026-09-27', to: '2026-10-03', calendarDays: 7 });
    expect(dashboardDate(Date.parse('2026-10-02T16:05:00Z'))).toBe('2026-10-03');
    const data = summarizeUsageEvents([event({ dateKey: '2026-09-30', monthKey: '2026-09', cost: 7 })], 'missing-home', new Map(), 0, window);
    expect(data.daily).toHaveLength(7);
    expect(data.dateRange.activeDays).toBe(1);
    expect(data.dateRange.calendarDays).toBe(7);
    expect(data.costs.avgDailyCost).toBe(1);
    expect(data.monthly[0].totalTokens).toBe(data.totals.totalTokens);
  });

  it('returns all sessions instead of silently truncating at 80', () => {
    const data = summarizeUsageEvents(Array.from({ length: 81 }, (_, index) => event({ sessionId: String(index) })), 'missing-home', new Map(), 0);
    expect(data.sessions).toHaveLength(81);
    expect(data.totals.sessionCount).toBe(81);
  });
});
