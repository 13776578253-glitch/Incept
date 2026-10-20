import type { SyncBasis, SyncRecord, SyncScope } from '../../../../domain/sync';
import type { RawUsageEvent } from '../../types';
import { dashboardDate } from '../../../../domain';
import { canonicalModelName } from '../../overrides';
import { lookupPricing, computeCostFromPricing, canPriceUsage } from '../../pricing';
import { applyCommandCodeQuota } from '../../pricing-schedule';
import { hash } from '../identity';
import { CODEX_AUTO_REVIEW_MODEL, isCodexAutoReviewModel } from '../../collectors/codex-purpose';

export function priceSyncRecord(scope: SyncScope, record: SyncRecord, basis: SyncBasis, mappings: Record<string, string | null>, label: string): RawUsageEvent & { apiEquivalentCost: number | null; pricingVersion: string } {
  const event = record.event, canonicalName = canonicalModelName(event.modelName, basis.aliases);
  const autoReview = scope.source === 'codex' && (isCodexAutoReviewModel(event.modelName) || isCodexAutoReviewModel(canonicalName));
  const modelName = autoReview ? CODEX_AUTO_REVIEW_MODEL : canonicalName;
  const rates = new Map(Object.entries(basis.rates).map(([model, rate]) => [model.toLowerCase(), rate]));
  const price = lookupPricing(rates, modelName) ?? lookupPricing(rates, event.modelName), dateKey = dashboardDate(event.timestampMs);
  const equivalent = computeCostFromPricing(price, event), labels = { codex: 'Codex CLI', commandcode: 'CommandCode', antigravity: 'Antigravity', claudeCode: 'Claude Code', deepseekHarness: 'DeepSeek Harness', geminiCli: 'Gemini CLI', opencode: 'OpenCode', zcode: 'ZCode' };
  const raw: RawUsageEvent = { ...event, modelName, sourceId: scope.source, sourceLabel: labels[scope.source], deviceId: scope.deviceId, deviceLabel: label,
    projectKey: mappings[event.projectKey] || 'external:' + scope.deviceId + ':' + event.projectKey,
    projectName: mappings[event.projectKey] ? event.projectName : event.projectName + ' · ' + label,
    cost: autoReview ? 0 : event.recordedCost ?? equivalent, costSource: autoReview || event.recordedCost === undefined ? 'calculated' : 'recorded',
    missingPricing: autoReview || event.recordedCost === undefined && !canPriceUsage(price, event), dateKey, monthKey: dateKey.slice(0, 7) };
  return { ...applyCommandCodeQuota(raw), apiEquivalentCost: autoReview ? null : canPriceUsage(price, event) ? applyCommandCodeQuota({ ...raw, cost: equivalent }).cost : null, pricingVersion: hash(basis) };
}
