import 'server-only';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelUsageSummary } from '../../../domain/index';
import { resolveModelIdentity } from '../../../domain/index';
import { type UnitPricing } from '../types';
import { lookupPricing } from '../pricing';
import { classifyProvider } from '../normalization';
import { canonicalModelName, readLocalOverrides } from '../overrides';

export function appendConfiguredModels(home: string, pricingMap: Map<string, UnitPricing>, models: ModelUsageSummary[]) {
  const existingModelNames = new Set(models.map((m) => m.modelName.toLowerCase()));
  const aliases = readLocalOverrides().aliases;

  const codexCachePath = join(home, '.codex', 'models_cache.json');

  if(existsSync(codexCachePath)) {
    try {
      const rawCodexCache = JSON.parse(readFileSync(codexCachePath, 'utf8')) as {
        models?: Array<{ slug?: string; display_name?: string }>;
      };
      for(const item of rawCodexCache.models ?? []) {
        const slug = item.slug ? canonicalModelName(item.slug, aliases) : undefined;
        if(!slug) continue;
        const identity = resolveModelIdentity(slug, 'codex');
        const canonicalId = identity.canonicalModelId;
        if(existingModelNames.has(canonicalId.toLowerCase()) || existingModelNames.has(slug.toLowerCase())) continue;
        existingModelNames.add(canonicalId.toLowerCase());
        existingModelNames.add(slug.toLowerCase());
        const pricing = lookupPricing(pricingMap, canonicalId) ?? lookupPricing(pricingMap, slug);
        models.push({
          modelName: canonicalId,
          displayName: item.display_name || identity.displayName,
          canonicalModelId: canonicalId,
          provider: identity.providerFamily ?? classifyProvider(canonicalId),
          providersUsed: identity.provider ? [identity.provider] : [],
          rawModels: [slug],
          source: 'Codex CLI',
          sourcesUsed: ['Codex CLI'],
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          reasoningTokens: 0,
          totalTokens: 0,
          cost: 0,
          shareOfTokens: 0,
          shareOfCost: 0,
          cacheHitRate: 0,
          missingPricing: !pricing,
          slotStatus: 'configured',
          sessionCount: 0,
          activeDays: 0,
          unitPricing: pricing,
        });
      }
    } catch {
      // ignore
    }
  }

  const ccConfigPath = join(home, '.commandcode', 'config.json');

  if(existsSync(ccConfigPath)) {
    try {
      const rawConfig = JSON.parse(readFileSync(ccConfigPath, 'utf8')) as {
        starredModels?: string[];
        reasoningEffort?: Record<string, string>;
      };
      const candidates = new Set<string>([
        ...(rawConfig.starredModels ?? []),
        ...Object.keys(rawConfig.reasoningEffort ?? {}),
      ]);
      for(const candidate of candidates) {
        const clean = canonicalModelName(candidate, aliases);
        if(!clean) continue;
        const shortName = clean.includes('/') ? clean.split('/').pop()! : clean;
        const identity = resolveModelIdentity(clean, 'commandcode');
        const canonicalId = identity.canonicalModelId;
        if(
          existingModelNames.has(canonicalId.toLowerCase()) ||
          existingModelNames.has(clean.toLowerCase()) ||
          existingModelNames.has(shortName.toLowerCase())
        ) {
          continue;
        }
        existingModelNames.add(canonicalId.toLowerCase());
        existingModelNames.add(clean.toLowerCase());
        existingModelNames.add(shortName.toLowerCase());
        const pricing = lookupPricing(pricingMap, canonicalId) ?? lookupPricing(pricingMap, clean);
        models.push({
          modelName: canonicalId,
          displayName: identity.displayName,
          canonicalModelId: canonicalId,
          provider: identity.providerFamily ?? classifyProvider(canonicalId),
          providersUsed: identity.provider ? [identity.provider] : [],
          rawModels: [clean],
          source: 'CommandCode',
          sourcesUsed: ['CommandCode'],
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          reasoningTokens: 0,
          totalTokens: 0,
          cost: 0,
          shareOfTokens: 0,
          shareOfCost: 0,
          cacheHitRate: 0,
          missingPricing: !pricing,
          slotStatus: 'configured',
          sessionCount: 0,
          activeDays: 0,
          unitPricing: pricing,
        });
      }
    } catch {
      // ignore
    }
  }
}
