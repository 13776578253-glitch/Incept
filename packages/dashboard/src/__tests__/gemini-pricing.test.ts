import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadLocalPricingMap, lookupPricing } from '../adapters/local/pricing';
import { canonicalModelName, readLocalOverrides } from '../adapters/local/overrides';
import { usageEvent } from '../adapters/local/collectors/common';
import { summarizeUsageEvents } from '../adapters/local/aggregation/summarize';

const variants = ['gemini-3.8-flash-exp-a', 'gemini-3.8-flash-n', 'gemini-3.8-flash-tiered'];
// Fixture rates are intentionally independent of real provider prices.
const price = { inputPerMillion: 1, outputPerMillion: 2, cacheReadPerMillion: .1, cacheWritePerMillion: 1.5 };

describe('Gemini grey-model pricing without identity aliases', () => {
  it.each(variants)('uses base rates for %s and its provider-qualified identifier', model => {
    const pricing = new Map([['gemini-3.8-flash', price]]);
    expect(lookupPricing(pricing, model)).toBe(price);
    expect(lookupPricing(pricing, `google/${model}`)).toBe(price);
    expect(lookupPricing(new Map([['google/gemini-3.8-flash', price]]), `google/${model}`)).toBe(price);
    expect([...pricing.keys()]).toEqual(['gemini-3.8-flash']);
  });

  it('prioritizes explicit variant pricing over the shared base price', () => {
    const override = { ...price, outputPerMillion: 7 };
    const pricing = new Map([['gemini-3.8-flash', price], [variants[0], override]]);
    expect(lookupPricing(pricing, variants[0])).toBe(override);
    expect(lookupPricing(pricing, `google/${variants[0]}`)).toBe(override);
  });

  it('keeps missing base prices unavailable and does not guess other suffixes', () => {
    expect(lookupPricing(new Map(), variants[0])).toBeUndefined();
    expect(lookupPricing(new Map([['gemini-3.8-flash', price]]), 'gemini-3.8-flash-unknown')).toBeUndefined();
  });

  it('retains all original names in model and session summaries while calculating shared rates', () => {
    const home = mkdtempSync(join(tmpdir(), 'dashboard-grey-pricing-'));
    try {
      const pricing = new Map([['gemini-3.8-flash', price]]);
      const at = Date.parse('2026-10-13T04:00:00Z');
      const events = variants.map(modelName => usageEvent({
        sourceId: 'antigravity', sourceLabel: 'Antigravity', sessionId: modelName,
        modelName, timestampMs: at, inputTokens: 1_000_000, outputTokens: 2_000_000,
        reasoningTokens: 500_000, cacheReadTokens: 10_000_000, cacheCreationTokens: 200_000,
      }, pricing));
      for (const event of events) {
        expect(event.cost).toBeCloseTo(7.3);
        expect(event.missingPricing).toBe(false);
      }
      const data = summarizeUsageEvents(events, home, pricing, at);
      expect(data.models.map(model => model.modelName).sort()).toEqual([...variants].sort());
      expect(data.sessions.flatMap(session => session.modelsUsed).sort()).toEqual([...variants].sort());
      expect(data.totals.cost).toBeCloseTo(21.9);
      for (const model of data.models) expect(model.unitPricing).toMatchObject(price);
    } finally {
      if (!resolve(home).startsWith(join(resolve(tmpdir()), 'dashboard-grey-pricing-'))) throw new Error('Unsafe fixture cleanup');
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('uses configured base rates without turning pricing aliases into identity aliases', () => {
    const home = mkdtempSync(join(tmpdir(), 'dashboard-grey-pricing-'));
    try {
      const overrides = readLocalOverrides(join(home, 'absent-overrides.json'));
      overrides.prices['gemini-3.8-flash'] = price;
      overrides.prices[variants[0]] = { ...price, outputPerMillion: 7 };
      const pricing = loadLocalPricingMap(home, overrides);
      expect(lookupPricing(pricing, variants[0])?.outputPerMillion).toBe(7);
      expect(lookupPricing(pricing, variants[1])).toEqual(price);
      for (const variant of variants) expect(canonicalModelName(variant, overrides.aliases)).toBe(variant);
    } finally {
      if (!resolve(home).startsWith(join(resolve(tmpdir()), 'dashboard-grey-pricing-'))) throw new Error('Unsafe fixture cleanup');
      rmSync(home, { recursive: true, force: true });
    }
  });
});
