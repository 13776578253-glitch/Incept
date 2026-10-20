import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type UnitPricing } from './types';
import { openSqliteReadOnly } from './sqlite';
import { loadCommandCodePricing } from './pricing-commandcode';
import { TEMPORARY_MODEL_PRICES } from './pricing-temporary';
import { canonicalModelName, DEFAULT_PRICING_ALIASES, readLocalOverrides, type LocalOverrides } from './overrides';

export function loadLocalPricingMap(home: string, overrides: LocalOverrides = readLocalOverrides()): Map<string, UnitPricing> {
  const pricingMap = new Map<string, UnitPricing>(Object.entries(TEMPORARY_MODEL_PRICES).map(([model, rates]) => [model, { ...rates }]));


  // 1. Load model_prices from ~/.aiusage/cache.db
  const cacheDbPath = join(home, '.aiusage', 'cache.db');
  const db = openSqliteReadOnly(cacheDbPath);
  if(db) {
    try {
      const rows = db
        .prepare(
          "SELECT model_key, input, output, cache_read, cache_write FROM model_prices WHERE status = 'active'",
        )
        .all();
      for(const row of rows) {
        const key = String(row.model_key ?? '').trim().toLowerCase();
        if(!key) continue;
        pricingMap.set(key, {
          inputPerMillion: Number(row.input ?? NaN),
          outputPerMillion: Number(row.output ?? NaN),
          cacheReadPerMillion: row.cache_read == null ? undefined : Number(row.cache_read),
          cacheWritePerMillion: row.cache_write == null ? undefined : Number(row.cache_write),
        });
      }
      try {
        const aliases = db.prepare('SELECT alias, model_key FROM model_price_aliases WHERE enabled = 1 ORDER BY priority ASC').all();
        for (const alias of aliases) {
          const price = pricingMap.get(String(alias.model_key).toLowerCase());
          if (price) pricingMap.set(String(alias.alias).toLowerCase(), price);
        }
      } catch { /* Older registries have no alias table. */ }
    } catch {
      // ignore sqlite query errors
    } finally {
      db.close();
    }
  }

  // 2. Load priceOverrides from ~/.aiusage/config.json
  const aiusageConfigPath = join(home, '.aiusage', 'config.json');
  if(existsSync(aiusageConfigPath)) {
    try {
      const cfg = JSON.parse(readFileSync(aiusageConfigPath, 'utf8')) as {
        priceOverrides?: Record<
          string,
          { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }
        >;
      };
      for(const [modelKey, override] of Object.entries(cfg.priceOverrides ?? {})) {
        const existing = pricingMap.get(modelKey.trim().toLowerCase());
        pricingMap.set(modelKey.trim().toLowerCase(), {
          inputPerMillion: Number(override.input ?? existing?.inputPerMillion ?? NaN),
          outputPerMillion: Number(override.output ?? existing?.outputPerMillion ?? NaN),
          cacheReadPerMillion: Number(override.cacheRead ?? existing?.cacheReadPerMillion ?? NaN),
          cacheWritePerMillion: Number(override.cacheWrite ?? existing?.cacheWritePerMillion ?? NaN),
        });
      }
    } catch {
      // ignore malformed config
    }
  }

  for (const [model, prices] of loadCommandCodePricing(home)) pricingMap.set(model, prices);
  for (const [model, prices] of Object.entries(overrides.prices)) pricingMap.set(model, prices);
  for (const alias of Object.keys(overrides.aliases)) {
    const price = lookupPricing(pricingMap, canonicalModelName(alias, overrides.aliases));
    if (price) pricingMap.set(alias, price);
  }
  for (const model of pricingMap.keys()) {
    const target = canonicalModelName(model, overrides.aliases);
    if (target !== model) {
      const price = lookupPricing(pricingMap, target);
      if (price) pricingMap.set(model, price);
    }
  }
  for (const [model, prices] of pricingMap) {
    for (const key of ['cacheReadPerMillion', 'cacheWritePerMillion'] as const) {
      if (prices[key] === undefined || Number.isNaN(prices[key])) delete prices[key];
    }
    if (!Number.isFinite(prices.inputPerMillion) || !Number.isFinite(prices.outputPerMillion)
      || !Object.values(prices).every(rate => Number.isFinite(rate) && rate >= 0)) pricingMap.delete(model);
  }
  return pricingMap;
}

export function lookupPricing(
  pricingMap: Map<string, UnitPricing>,
  modelName: string,
): UnitPricing | undefined {
  const lower = modelName.trim().toLowerCase();
  if(pricingMap.has(lower)) return pricingMap.get(lower);
  const shortName = lower.includes('/') ? lower.split('/').pop()! : lower;
  if(pricingMap.has(shortName)) return pricingMap.get(shortName);
  const target = canonicalModelName(lower, DEFAULT_PRICING_ALIASES).toLowerCase();
  if (target !== lower) {
    const providerPrefix = lower.includes('/') ? lower.slice(0, lower.lastIndexOf('/') + 1) : '';
    return pricingMap.get(target.includes('/') ? target : `${providerPrefix}${target}`)
      ?? pricingMap.get(target);
  }
  return undefined;
}

export function computeCostFromPricing(
  pricing: UnitPricing | undefined,
  tokens: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    reasoningTokens: number;
  },
): number {
  if (!pricing || !canPriceUsage(pricing, tokens)) return 0;
  return (
    (tokens.inputTokens * pricing.inputPerMillion +
      (tokens.outputTokens + tokens.reasoningTokens) * pricing.outputPerMillion +
      tokens.cacheReadTokens * (pricing.cacheReadPerMillion ?? 0) +
      tokens.cacheCreationTokens * (pricing.cacheWritePerMillion ?? 0)) /
    1_000_000
  );
}

export function readRecordedCost(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const cost = Number(value);
  return Number.isFinite(cost) && cost >= 0 ? cost : undefined;
}

export function canPriceUsage(pricing: UnitPricing | undefined, tokens: { inputTokens: number; outputTokens: number; reasoningTokens: number; cacheReadTokens: number; cacheCreationTokens: number }): boolean {
  if (!pricing) return false;
  const pairs = [[tokens.inputTokens, pricing.inputPerMillion], [tokens.outputTokens + tokens.reasoningTokens, pricing.outputPerMillion], [tokens.cacheReadTokens, pricing.cacheReadPerMillion], [tokens.cacheCreationTokens, pricing.cacheWritePerMillion]];
  return pairs.every(([count, rate]) => count === 0 || rate !== undefined && Number.isFinite(rate) && rate >= 0);
}
