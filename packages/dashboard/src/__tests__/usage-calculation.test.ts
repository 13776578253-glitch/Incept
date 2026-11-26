import { describe, expect, it } from 'vitest';
import { summarizeUsageEvents } from '../adapters/local/aggregation/summarize';
import type { RawUsageEvent } from '../adapters/local/types';
import { dashboardDate, dashboardHour, dateWindow } from '../domain';
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

  it('aggregates UTC+8 hourly tokens while excluding day-precision legacy records', () => {
    const ts14 = Date.parse('2026-10-10T06:30:00Z'); // 14:30 UTC+8
    const ts01 = Date.parse('2026-10-09T17:15:00Z'); // 01:15 UTC+8 on 2026-10-10
    expect(dashboardDate(ts14)).toBe('2026-10-10');
    expect(dashboardHour(ts14)).toBe(14);
    expect(dashboardDate(ts01)).toBe('2026-10-10');
    expect(dashboardHour(ts01)).toBe(1);

    const mixed = summarizeUsageEvents(
      [
        event({ sessionId: 's1', timestampMs: ts14, inputTokens: 200, cacheReadTokens: 0, outputTokens: 0, reasoningTokens: 0 }),
        event({ sessionId: 's2', timestampMs: ts01, inputTokens: 100, cacheReadTokens: 0, outputTokens: 0, reasoningTokens: 0 }),
        event({ sessionId: 's3', timestampPrecision: 'day', timestampMs: Date.parse('2026-10-10T00:00:00Z'), inputTokens: 300, cacheReadTokens: 0, outputTokens: 0, reasoningTokens: 0 }),
        event({ sessionId: 's4', dateKey: '2026-10-11', monthKey: '2026-10', timestampPrecision: 'day', timestampMs: Date.parse('2026-10-11T00:00:00Z'), inputTokens: 400, cacheReadTokens: 0, outputTokens: 0, reasoningTokens: 0 }),
      ],
      'missing-home',
      new Map(),
      0,
    );

    const dayMixed = mixed.daily.find(d => d.date === '2026-10-10')!;
    expect(dayMixed.totalTokens).toBe(600);
    expect(dayMixed.hourlyMeasuredTokens).toBe(300);
    expect(dayMixed.hourlyTokens).toHaveLength(24);
    expect(dayMixed.hourlyTokens?.[1]).toBe(100);
    expect(dayMixed.hourlyTokens?.[14]).toBe(200);
    expect(dayMixed.hourlyTokens?.[0]).toBe(0);
    expect(dayMixed.hourlyTokens?.[8]).toBe(0);

    const dayOnly = mixed.daily.find(d => d.date === '2026-10-11')!;
    expect(dayOnly.totalTokens).toBe(400);
    expect(dayOnly.hourlyTokens).toBeUndefined();
    expect(dayOnly.hourlyMeasuredTokens).toBeUndefined();
  });
});
