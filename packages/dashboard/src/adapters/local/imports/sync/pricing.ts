import type { SyncBasis, SyncRecord, SyncScope } from '../../../../domain/sync';
import type { RawUsageEvent } from '../../types';
import { dashboardDate } from '../../../../domain';
import { canonicalModelName } from '../../overrides';
import { lookupPricing, computeCostFromPricing, canPriceUsage } from '../../pricing';
import { applyCommandCodeQuota } from '../../pricing-schedule';
import { hash } from '../identity';

export function priceSyncRecord(scope: SyncScope, record: SyncRecord, basis: SyncBasis, mappings: Record<string, string | null>, label: string): RawUsageEvent & { apiEquivalentCost: number | null; pricingVersion: string } {
  const event = record.event, modelName = canonicalModelName(event.modelName, basis.aliases);
  const freeReview = scope.source === 'codex' && /^codex-auto-review$/i.test(modelName);
  const rates = new Map(Object.entries(basis.rates).map(([model, rate]) => [model.toLowerCase(), rate]));
  const price = lookupPricing(rates, modelName) ?? lookupPricing(rates, event.modelName), dateKey = dashboardDate(event.timestampMs);
  const equivalent = computeCostFromPricing(price, event), labels = { codex: 'Codex CLI', commandcode: 'CommandCode', antigravity: 'Antigravity', claudeCode: 'Claude Code', geminiCli: 'Gemini CLI', opencode: 'OpenCode', zcode: 'ZCode' };
  const raw: RawUsageEvent = { ...event, modelName, sourceId: scope.source, sourceLabel: labels[scope.source], deviceId: scope.deviceId, deviceLabel: label,
    projectKey: mappings[event.projectKey] || 'external:' + scope.deviceId + ':' + event.projectKey,
    projectName: mappings[event.projectKey] ? event.projectName : event.projectName + ' · ' + label,
    cost: freeReview ? 0 : event.recordedCost ?? equivalent, costSource: event.recordedCost === undefined ? 'calculated' : 'recorded',
    missingPricing: !freeReview && event.recordedCost === undefined && !canPriceUsage(price, event), dateKey, monthKey: dateKey.slice(0, 7) };
  return { ...applyCommandCodeQuota(raw), apiEquivalentCost: freeReview ? 0 : canPriceUsage(price, event) ? applyCommandCodeQuota({ ...raw, cost: equivalent }).cost : null, pricingVersion: hash(basis) };
}
