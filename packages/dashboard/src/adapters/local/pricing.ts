import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type UnitPricing } from './types';
import { openSqliteReadOnly } from './sqlite';
import { loadCommandCodePricing } from './pricing-commandcode';
import {
  canonicalModelName,
  DEFAULT_EXCLUDED_PRICING_MODELS,
  DEFAULT_PRICING_ALIASES,
  readLocalOverrides,
  type LocalOverrides,
} from './overrides';
import { resolveModelIdentity } from '../../domain/index';
import referenceCatalog from '../../sync/usage-billing-reference-catalog.json';

type ReferenceCatalogRate = {
  model: string;
  effectiveFrom: number;
  effectiveTo?: number;
  perMillion: {
    input: string;
    output: string;
    cacheRead?: string;
    cacheWrite?: string;
  };
  cacheWriteTtl?: {
    '5m': string;
    '1h': string;
  };
};

export function loadReferenceCatalogPrices(now = Date.now()): Map<string, UnitPricing> {
  const byModel = new Map<string, ReferenceCatalogRate[]>();
  for (const rate of (referenceCatalog as { rates: ReferenceCatalogRate[] }).rates) {
    const model = rate.model.trim().toLowerCase();
    if (!model) continue;
    const list = byModel.get(model) ?? [];
    list.push(rate);
    byModel.set(model, list);
  }
  const prices = new Map<string, UnitPricing>();
  for (const [model, versions] of byModel) {
    const sorted = [...versions].sort((a, b) => a.effectiveFrom - b.effectiveFrom);
    const active = sorted.find(
      version => version.effectiveFrom <= now && (version.effectiveTo === undefined || now < version.effectiveTo),
    );
    const selected = active
      ?? [...sorted].reverse().find(version => version.effectiveFrom <= now)
      ?? sorted[0];
    if (!selected) continue;
    const unit: UnitPricing = {
      inputPerMillion: Number(selected.perMillion.input),
      outputPerMillion: Number(selected.perMillion.output),
    };
    if (selected.perMillion.cacheRead !== undefined) {
      unit.cacheReadPerMillion = Number(selected.perMillion.cacheRead);
    }
    const cacheWrite = selected.perMillion.cacheWrite ?? selected.cacheWriteTtl?.['5m'];
    if (cacheWrite !== undefined) {
      unit.cacheWritePerMillion = Number(cacheWrite);
    }
    prices.set(model, unit);
  }
  return prices;
}

export function isPolicyExcludedPricingModel(modelName: string): boolean {
  const lower = modelName.trim().toLowerCase();
  if (!lower) return false;
  const shortName = lower.includes('/') ? lower.slice(lower.lastIndexOf('/') + 1) : lower;
  return DEFAULT_EXCLUDED_PRICING_MODELS.has(lower)
    || DEFAULT_EXCLUDED_PRICING_MODELS.has(shortName)
    || DEFAULT_EXCLUDED_PRICING_MODELS.has(resolveModelIdentity(lower).canonicalModelId.toLowerCase());
}

export function loadLocalPricingMap(
  home: string,
  overrides: LocalOverrides = readLocalOverrides(),
  now = Date.now(),
): Map<string, UnitPricing> {
  const pricingMap = loadReferenceCatalogPrices(now);


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
  if (!lower) return undefined;

  const direct = pricingMap.get(lower);
  if (direct) return direct;

  const candidates = new Set<string>();
  candidates.add(lower);

  const shortName = lower.includes('/') ? lower.slice(lower.lastIndexOf('/') + 1) : lower;
  candidates.add(shortName);

  const identity = resolveModelIdentity(lower);
  candidates.add(identity.canonicalModelId);

  const shortIdentity = resolveModelIdentity(shortName);
  candidates.add(shortIdentity.canonicalModelId);

  for (const c of Array.from(candidates)) {
    const target = canonicalModelName(c, DEFAULT_PRICING_ALIASES).toLowerCase();
    if (target && target !== c) {
      candidates.add(target);
      const targetShort = target.includes('/') ? target.slice(target.lastIndexOf('/') + 1) : target;
      candidates.add(targetShort);
      candidates.add(resolveModelIdentity(target).canonicalModelId);
    }
  }

  for (const c of candidates) {
    const p = pricingMap.get(c);
    if (p) return p;
  }

  const vendorPrefixes = ['deepseek/', 'google/', 'openai/', 'anthropic/', 'xiaomi/'];
  for (const c of candidates) {
    if (!c.includes('/')) {
      for (const prefix of vendorPrefixes) {
        const p = pricingMap.get(prefix + c);
        if (p) return p;
      }
    }
  }

  for (const c of candidates) {
    const suffix = '/' + c;
    for (const [key, price] of pricingMap.entries()) {
      if (key.endsWith(suffix)) return price;
    }
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
