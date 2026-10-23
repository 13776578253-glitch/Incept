import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyCommandCodeQuota, commandCodePricingMultiplier } from '../adapters/local/pricing-schedule';
import { collectCommandCodeEvents } from '../adapters/local/collectors/commandcode';
import { summarizeUsageEvents } from '../adapters/local/aggregation/summarize';
import { exportTokenData } from '../adapters/local/imports/exporter';
import { loadTokenDashboardData } from '../adapters/local/loader';
import { previewImport, commitImport } from '../adapters/local/imports/service';
import { publicDashboardSummary } from '../domain';
import { modelSeries, modelShares } from '../react/sections/overview/trend-series';

const model = 'deepseek/deepseek-v4.1-flash';
const canonicalModel = 'deepseek-v4.1-flash';
let home: string | undefined;
afterEach(() => {
  if (home) {
    if (!resolve(home).startsWith(join(resolve(tmpdir()), 'dashboard-peak-'))) throw new Error('Unsafe fixture cleanup');
    rmSync(home, { recursive: true, force: true }); home = undefined;
  }
});

function fixture() {
  home = mkdtempSync(join(tmpdir(), 'dashboard-peak-'));
  const dir = join(home, '.commandcode', 'projects', 'fixture');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'usage.jsonl'), [
    { timestamp: '2026-10-13T13:00:00Z', costUsd: .04 },
    { timestamp: '2026-10-14T06:00:00Z', costUsd: .59 },
    { timestamp: '2026-10-14T10:00:00Z', costUsd: .23 },
  ].map((row, index) => JSON.stringify({ id: String(index), model, timestamp: row.timestamp,
    usage: { inputTokens: 100, outputTokens: 20, costUsd: row.costUsd } })).join('\n'));
  return home;
}

describe('CommandCode quota and model identity', () => {
  it.each([
    ['2026-10-14T00:59:59.999Z', false], ['2026-10-14T01:00:00Z', true],
    ['2026-10-14T03:59:59.999Z', true], ['2026-10-14T04:00:00Z', false],
    ['2026-10-14T05:59:59.999Z', false], ['2026-10-14T06:00:00Z', true],
    ['2026-10-14T09:59:59.999Z', true], ['2026-10-14T10:00:00Z', false],
    ['2026-10-17T06:00:00Z', false], ['2026-10-18T01:00:00Z', false],
    ['2026-10-01T06:00:00Z', false], ['2026-10-07T01:00:00Z', false],
  ])('resolves %s to peak=%s', (timestamp, isPeak) => {
    expect(commandCodePricingMultiplier(model, Date.parse(timestamp))).toEqual({ isPeak, multiplier: isPeak ? 2 : 1 });
  });

  it('keeps MiMo and unknown DeepSeek models at their existing rates', () => {
    expect(commandCodePricingMultiplier('xiaomi/mimo-v2.6-pro', Date.parse('2026-10-14T06:00:00Z'))).toBeUndefined();
    expect(commandCodePricingMultiplier('deepseek/deepseek-r1', Date.now())).toBeUndefined();
  });

  it('reconciles all aggregates while splitting only overview share segments', () => {
    const events = collectCommandCodeEvents(fixture(), new Map()).events;
    expect(events.map(event => event.cost)).toEqual([.04, 1.18, .23]);
    expect(events.map(event => event.nominalCost)).toEqual([.04, .59, .23]);
    expect(events.map(applyCommandCodeQuota)).toEqual(events);
    const data = summarizeUsageEvents(events, home!, new Map(), 0);
    for (const collection of [data.daily, data.monthly, data.models, data.sessions, data.projects, data.sources]) {
      expect(collection.reduce((sum, row) => sum + row.cost, 0)).toBeCloseTo(1.45);
    }
    expect(data.totals.cost).toBeCloseTo(1.45);
    expect(data.costs.totalCost).toBeCloseTo(1.45);
    expect(data.models.map(row => row.modelName)).toEqual([canonicalModel]);
    expect(data.costs.totalModelCount).toBe(1);
    expect(data.sessions[0].modelBreakdowns.map(row => row.modelName)).toEqual([canonicalModel]);
    const publicData = publicDashboardSummary(data);
    expect(publicData.models[0].billing).toEqual(data.models[0].billing);
    const parts = modelShares(publicData.daily[1], modelSeries(publicData.daily));
    expect(parts.map(part => part.billingPeriod).sort()).toEqual(['offPeak', 'peak']);
    expect(parts.reduce((sum, part) => sum + part.tokens, 0)).toBe(240);
    expect(parts.reduce((sum, part) => sum + (part.cost ?? 0), 0)).toBeCloseTo(1.41);
    const mixed = summarizeUsageEvents([...events, { ...events[1], sourceId: 'opencode',
      sourceLabel: 'OpenCode', isPeak: undefined, nominalCost: undefined, peakMultiplier: undefined, cost: .3 }], home!, new Map(), 0);
    expect(mixed.models).toHaveLength(1);
    expect(mixed.models[0].cost).toBeCloseTo(1.75);
    const mixedParts = modelShares(mixed.daily[1], modelSeries(mixed.daily));
    expect(mixedParts).toHaveLength(3);
    expect(mixedParts.reduce((sum, part) => sum + part.tokens, 0)).toBe(360);
    expect(mixedParts.reduce((sum, part) => sum + (part.cost ?? 0), 0)).toBeCloseTo(1.71);
  });

  it('applies the schedule to token-calculated costs and keeps other sources unchanged', () => {
    const dirHome = fixture();
    const dir = join(dirHome, '.commandcode', 'projects', 'fixture');
    writeFileSync(join(dir, 'calculated.jsonl'), JSON.stringify({ model, timestamp: '2026-10-14T06:30:00Z',
      usage: { inputTokens: 1_000_000, cacheReadTokens: 500_000, outputTokens: 100_000 } }));
    const events = collectCommandCodeEvents(dirHome, new Map([[model,
      { inputPerMillion: .15, outputPerMillion: .6, cacheReadPerMillion: .003 }]])).events;
    const calculated = events.find(event => event.costSource === 'calculated')!;
    expect(calculated.nominalCost).toBeCloseTo(.1365);
    expect(calculated.cost).toBeCloseTo(.273);
    const otherSource = { ...calculated, sourceId: 'opencode' as const, cost: .1365 };
    expect(applyCommandCodeQuota(otherSource)).toEqual(otherSource);
  });

  it('exports the baseline and weights imported requests exactly once', async () => {
    const dirHome = fixture();
    const bundle = exportTokenData({ home: dirHome, deviceId: '62fda0a5-f89b-4baf-93df-d69881b61001', label: 'Fixture' });
    expect(bundle.events.map(event => event.recordedCost)).toEqual([.04, .59, .23]);
    // Import into a separate home with no native source records.
    const importedHome = join(dirHome, 'remote'); mkdirSync(importedHome);
    const options = { home: importedHome, context: { events: [], pricing: new Map(), aliases: {} } };
    commitImport(previewImport(bundle, {}, options).previewId, options);
    const data = await loadTokenDashboardData({ home: importedHome, range: 'all', force: true });
    expect(data.totals.cost).toBeCloseTo(1.45);
    expect(data.models.map(row => row.modelName)).toEqual([canonicalModel]);
    expect(data.models[0].canonicalModelId).toBe(canonicalModel);
    expect(data.models[0].rawModels).toEqual([model]);
    expect(data.models[0].billing?.peak?.cost).toBeCloseTo(1.18);
  });
});
