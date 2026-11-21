import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canPriceUsage, computeCostFromPricing, loadLocalPricingMap, lookupPricing } from '../adapters/local/pricing';

describe('temporary historical Codex rates', () => {
  it('prices both identifiers without local registries and preserves explicit overrides', () => {
    const home = mkdtempSync(join(tmpdir(), 'dashboard-historical-pricing-'));
    try {
      const prices = loadLocalPricingMap(home, { aliases: {}, prices: {}, updatedAt: 0 });
      for (const model of ['gpt-5.3-codex', 'gpt-5.2-codex']) {
        const rate = lookupPricing(prices, `openai/${model}`);
        expect(rate).toEqual({ inputPerMillion: 1.75, outputPerMillion: 14, cacheReadPerMillion: .175 });
        const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, reasoningTokens: 0, cacheReadTokens: 1_000_000, cacheCreationTokens: 0 };
        expect(computeCostFromPricing(rate, usage)).toBeCloseTo(15.925);
        expect(canPriceUsage(rate, { ...usage, cacheCreationTokens: 1 })).toBe(false);
      }
      const override = { inputPerMillion: 2, outputPerMillion: 8 };
      expect(loadLocalPricingMap(home, { aliases: {}, prices: { 'gpt-5.2-codex': override }, updatedAt: 0 }).get('gpt-5.2-codex')).toEqual(override);
      expect(lookupPricing(prices, 'gpt/gpt-6.2-sol')).toEqual({ inputPerMillion: 2, outputPerMillion: 10, cacheReadPerMillion: 0.1 });
      expect(lookupPricing(prices, 'gemini-4-hydrogen')).toEqual({ inputPerMillion: 1.5, outputPerMillion: 7.5, cacheReadPerMillion: 0.075 });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
