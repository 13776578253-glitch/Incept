import 'server-only';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import channelMappings from '../../sync/usage-billing-channel-mappings.json';
import type { UnitPricing } from './types';

export type LocalOverrides = { aliases: Record<string, string>; prices: Record<string, UnitPricing>; updatedAt: number; error?: string };

type ChannelMappingRule = {
  channel: string;
  model: string;
  action: string;
  canonicalModel?: string;
};

function buildChannelPricingPolicy() {
  const aliases: Record<string, string> = {};
  const excluded = new Set<string>();
  for (const rule of channelMappings.rules as ChannelMappingRule[]) {
    const raw = rule.model.trim().toLowerCase();
    if (!raw) continue;
    if (rule.action === 'exclude') {
      excluded.add(raw);
      const short = raw.includes('/') ? raw.slice(raw.lastIndexOf('/') + 1) : raw;
      if (short) excluded.add(short);
    } else if (rule.action === 'map' && rule.canonicalModel) {
      const target = rule.canonicalModel.trim().toLowerCase();
      if (target && raw !== target && !(raw in aliases)) {
        aliases[raw] = target;
      }
      if (raw.includes('/')) {
        const short = raw.slice(raw.lastIndexOf('/') + 1);
        if (short && target && short !== target && !(short in aliases)) {
          aliases[short] = target;
        }
      }
    }
  }
  return { aliases, excluded };
}

const CHANNEL_PRICING_POLICY = buildChannelPricingPolicy();

// Pricing aliases share rates without merging usage identities in summaries or imports.
export const DEFAULT_PRICING_ALIASES: Readonly<Record<string, string>> = CHANNEL_PRICING_POLICY.aliases;
export const DEFAULT_EXCLUDED_PRICING_MODELS: ReadonlySet<string> = CHANNEL_PRICING_POLICY.excluded;

export function overridesPath() {
  if (process.env.INCEPT_DASHBOARD_OVERRIDES_FILE) return resolve(process.env.INCEPT_DASHBOARD_OVERRIDES_FILE);
  let directory = process.cwd();
  while (dirname(directory) !== directory) {
    const path = join(directory, 'packages', 'dashboard', 'dashboard.local.json');
    if (existsSync(join(directory, 'pnpm-workspace.yaml'))) return path;
    directory = dirname(directory);
  }
  return join(process.cwd(), 'dashboard.local.json');
}

export function readLocalOverrides(path = overridesPath()): LocalOverrides {
  const result: LocalOverrides = { aliases: {}, prices: {}, updatedAt: 0 };
  if (!existsSync(path)) return result;
  try {
    result.updatedAt = statSync(path).mtimeMs;
    const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid configuration');
    for (const [alias, target] of Object.entries(value.modelAliases ?? {})) {
      if (typeof target !== 'string' || !target.trim()) throw new Error('Invalid alias');
      result.aliases[alias.trim().toLowerCase()] = target.trim();
    }
    for (const [model, price] of Object.entries(value.prices ?? {})) {
      if (!price || typeof price !== 'object' || Array.isArray(price)) throw new Error('Invalid price');
      const entry = price as UnitPricing;
      if (!Number.isFinite(entry.inputPerMillion) || !Number.isFinite(entry.outputPerMillion)
        || !Object.values(entry).every(rate => typeof rate === 'number' && Number.isFinite(rate) && rate >= 0)) throw new Error('Invalid price');
      result.prices[model.trim().toLowerCase()] = entry;
    }
    for (const alias of Object.keys(result.aliases)) canonicalModelName(alias, result.aliases);
  } catch {
    return { aliases: {}, prices: {}, updatedAt: result.updatedAt, error: 'Invalid dashboard.local.json; automatic collection remains enabled.' };
  }
  return result;
}

export function canonicalModelName(model: string, aliases: Record<string, string>): string {
  let name = model.trim();
  const seen = new Set<string>();
  while (true) {
    const key = name.toLowerCase();
    const target = aliases[key] ?? aliases[key.split('/').pop()!];
    if (!target) return name;
    if (seen.has(key)) throw new Error('Cyclic model alias');
    seen.add(key);
    name = target;
  }
}
