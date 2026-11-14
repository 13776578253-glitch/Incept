import channelMappings from '../sync/usage-billing-channel-mappings.json';
import {
  resolveModelIdentity,
  type BillingModelCost,
  type DailyUsagePoint,
  type ModelUsageSummary,
  type TokenDashboardData,
  type TransferSource,
} from '../domain/index';
import type { BillingPreview } from './hooks/use-billing-preview';

type MappingRule = {
  channel: string;
  model: string;
  action: string;
  canonicalModel?: string;
};

const MODEL_ALIASES = new Map<string, string>();
const EXCLUDED_MODELS = new Set<string>(['codex-auto-review', 'codex-auto-review-unpriced']);

function stripPrefix(name: string): string {
  const slash = name.indexOf('/');
  return slash >= 0 ? name.slice(slash + 1) : name;
}

for (const rule of channelMappings.rules as MappingRule[]) {
  const raw = rule.model.trim().toLowerCase();
  const stripped = stripPrefix(raw);
  if (rule.action === 'exclude') {
    EXCLUDED_MODELS.add(raw);
    EXCLUDED_MODELS.add(stripped);
  } else if (rule.action === 'map' && rule.canonicalModel) {
    const canonical = rule.canonicalModel.trim().toLowerCase();
    MODEL_ALIASES.set(raw, canonical);
    if (!MODEL_ALIASES.has(stripped)) MODEL_ALIASES.set(stripped, canonical);
  }
}

const SOURCE_LABEL_TO_CHANNEL = new Map<string, TransferSource>([
  ['Codex CLI', 'codex'],
  ['CommandCode', 'commandcode'],
  ['Antigravity', 'antigravity'],
  ['Claude Code', 'claudeCode'],
  ['DeepSeek Harness', 'deepseekHarness'],
  ['Gemini CLI', 'geminiCli'],
  ['OpenCode', 'opencode'],
  ['ZCode', 'zcode'],
]);

export function isExcludedBillingModelName(modelName: string): boolean {
  const lower = modelName.trim().toLowerCase();
  return EXCLUDED_MODELS.has(lower)
    || EXCLUDED_MODELS.has(stripPrefix(lower))
    || EXCLUDED_MODELS.has(resolveModelIdentity(lower).canonicalModelId.toLowerCase());
}

function resolveCanonicalBillingModel(modelName: string): string {
  const lower = modelName.trim().toLowerCase();
  const directAlias = MODEL_ALIASES.get(lower);
  if (directAlias) return directAlias;

  const stripped = stripPrefix(lower);
  const strippedAlias = MODEL_ALIASES.get(stripped);
  if (strippedAlias) return strippedAlias;

  const canonical = resolveModelIdentity(lower).canonicalModelId.toLowerCase();
  return MODEL_ALIASES.get(canonical) ?? canonical;
}

function channelsForUsageModel(model: ModelUsageSummary): TransferSource[] {
  const labels = model.sourcesUsed && model.sourcesUsed.length > 0
    ? model.sourcesUsed
    : model.source
      ? model.source.split(' / ').map(item => item.trim()).filter(Boolean)
      : [];
  const channels: TransferSource[] = [];
  for (const label of labels) {
    const channel = SOURCE_LABEL_TO_CHANNEL.get(label);
    if (channel && !channels.includes(channel)) channels.push(channel);
  }
  return channels;
}

function isExcludedBillingBreakdown(entry: BillingModelCost): boolean {
  return entry.excludedTokens > 0 && entry.estimatedTokens === 0 && entry.unpricedTokens === 0;
}

function allocateGroupCosts(
  group: ModelUsageSummary[],
  billingModel: BillingModelCost,
): Map<ModelUsageSummary, { cost: number; missingPricing: boolean }> {
  const updates = new Map<ModelUsageSummary, { cost: number; missingPricing: boolean }>();
  const matchedEntriesByMember = new Map<ModelUsageSummary, BillingModelCost['channels']>();
  const estimable: ModelUsageSummary[] = [];

  for (const member of group) {
    const memberChannels = channelsForUsageModel(member);
    const matched = memberChannels.length > 0
      ? billingModel.channels.filter(entry => memberChannels.includes(entry.channel))
      : [];
    matchedEntriesByMember.set(member, matched);

    const channelBlockedUnpriced = matched.length > 0
      && matched.every(entry => entry.estimatedTokens === 0 && entry.unpricedTokens > 0);
    if (channelBlockedUnpriced) {
      updates.set(member, { cost: 0, missingPricing: true });
    } else {
      estimable.push(member);
    }
  }

  if (!estimable.length) return updates;

  const totalBillingUsd = Number(billingModel.estimatedCostUsd);
  const usePriorCostWeights = estimable.every(member => !member.missingPricing && member.cost > 0);
  const weights = estimable.map(member => usePriorCostWeights ? member.cost : Math.max(0, member.totalTokens));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  for (let i = 0; i < estimable.length; i++) {
    const member = estimable[i];
    const matched = matchedEntriesByMember.get(member) ?? [];
    const missingPricing = matched.length > 0
      ? matched.some(entry => entry.unpricedTokens > 0)
      : billingModel.unpricedTokens > 0;
    const cost = estimable.length === 1
      ? totalBillingUsd
      : totalWeight > 0
        ? totalBillingUsd * (weights[i] / totalWeight)
        : 0;
    updates.set(member, { cost, missingPricing });
  }

  return updates;
}

function reconcileModels(
  models: ModelUsageSummary[],
  billingModels: BillingModelCost[],
  totalBillingCostUsd: number,
): { models: ModelUsageSummary[]; excludedModels: ReadonlySet<string> } {
  const billingByModel = new Map<string, BillingModelCost>();
  const excludedModels = new Set<string>();

  for (const entry of billingModels) {
    billingByModel.set(entry.model.trim().toLowerCase(), entry);
  }

  const groups = new Map<string, { billingModel: BillingModelCost; members: ModelUsageSummary[] }>();
  for (const model of models) {
    if (isExcludedBillingModelName(model.modelName)) {
      excludedModels.add(model.modelName);
      continue;
    }
    if (model.slotStatus === 'configured' || model.totalTokens <= 0) continue;

    const lower = model.modelName.trim().toLowerCase();
    const billingModel = billingByModel.get(lower)
      ?? billingByModel.get(resolveCanonicalBillingModel(model.modelName));
    if (!billingModel) continue;

    if (isExcludedBillingBreakdown(billingModel)) {
      excludedModels.add(model.modelName);
      continue;
    }

    const key = billingModel.model.trim().toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.members.push(model);
    } else {
      groups.set(key, { billingModel, members: [model] });
    }
  }

  const updates = new Map<ModelUsageSummary, { cost: number; missingPricing: boolean }>();
  for (const { billingModel, members } of groups.values()) {
    for (const [member, update] of allocateGroupCosts(members, billingModel)) {
      updates.set(member, update);
    }
  }

  const totalCostDenominator = totalBillingCostUsd > 0
    ? totalBillingCostUsd
    : models.reduce((sum, model) => sum + (updates.get(model)?.cost ?? model.cost), 0);

  const reconciledModels = models.map((model) => {
    if (excludedModels.has(model.modelName)) {
      return { ...model, cost: 0, missingPricing: true, shareOfCost: 0 };
    }
    const update = updates.get(model);
    if (!update) return model;
    return {
      ...model,
      cost: update.cost,
      missingPricing: update.missingPricing,
      shareOfCost: totalCostDenominator > 0 ? update.cost / totalCostDenominator : 0,
    };
  });

  return { models: reconciledModels, excludedModels };
}

function reconcileSources(
  sources: TokenDashboardData['sources'],
  billingModels: BillingModelCost[],
): TokenDashboardData['sources'] {
  const channelTotals = new Map<TransferSource, { cost: number; unpricedTokens: number; hasTokens: boolean }>();
  for (const model of billingModels) {
    for (const entry of model.channels) {
      const current = channelTotals.get(entry.channel) ?? { cost: 0, unpricedTokens: 0, hasTokens: false };
      current.cost += Number(entry.estimatedCostUsd);
      current.unpricedTokens += entry.unpricedTokens;
      if (entry.estimatedTokens + entry.unpricedTokens + entry.excludedTokens > 0) {
        current.hasTokens = true;
      }
      channelTotals.set(entry.channel, current);
    }
  }

  return sources.map((source) => {
    if (source.status !== 'active') return source;
    const channel = channelTotals.get(source.sourceId as TransferSource);
    if (!channel || !channel.hasTokens) return source;
    return {
      ...source,
      cost: channel.cost,
      missingPricing: channel.unpricedTokens > 0,
    };
  });
}

function reconcileDaily(
  daily: DailyUsagePoint[],
  dayTotals: ReadonlyMap<string, number>,
): DailyUsagePoint[] {
  return daily.map((day) => {
    const cost = dayTotals.get(day.date);
    return cost === undefined ? day : { ...day, cost };
  });
}

export function reconcileDashboardWithBilling(
  data: TokenDashboardData,
  billingPreview?: BillingPreview,
  filteredDaily: DailyUsagePoint[] = data.daily,
): { data: TokenDashboardData; filteredDaily: DailyUsagePoint[]; excludedModels: ReadonlySet<string> } {
  const baseExcluded = new Set<string>(
    data.models.filter(model => isExcludedBillingModelName(model.modelName)).map(model => model.modelName),
  );

  if (
    !billingPreview
    || billingPreview.status !== 'ready'
    || billingPreview.data.range !== data.range
    || !billingPreview.data.breakdown
  ) {
    return { data, filteredDaily, excludedModels: baseExcluded };
  }

  const { breakdown } = billingPreview.data;
  const totalBillingCostUsd = Number(billingPreview.data.estimatedCostUsd);
  const { models, excludedModels } = reconcileModels(data.models, breakdown.models, totalBillingCostUsd);
  const sources = reconcileSources(data.sources, breakdown.models);

  const dayTotals = new Map(breakdown.days.map(day => [day.day, Number(day.estimatedCostUsd)]));
  const daily = reconcileDaily(data.daily, dayTotals);

  return {
    data: { ...data, models, sources, daily },
    filteredDaily: filteredDaily === data.daily ? daily : reconcileDaily(filteredDaily, dayTotals),
    excludedModels,
  };
}
