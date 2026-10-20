// PHASE 0B PROOF ONLY. No runtime exports, routes or production schema.
import type { TransferEvent, TransferSource, TransferPrice } from '../../domain';
import type { RawUsageEvent } from '../../adapters/local/types';
import { dashboardDate } from '../../domain';
import { hash } from '../../adapters/local/imports/identity';
import { canonicalModelName } from '../../adapters/local/overrides';
import { canPriceUsage, computeCostFromPricing, lookupPricing } from '../../adapters/local/pricing';
import { applyCommandCodeQuota } from '../../adapters/local/pricing-schedule';

export type Completeness = 'complete' | 'partial' | 'unavailable' | 'failed';
export type Scope = { deviceId: string; source: TransferSource; sessionId: string; originId: string };
export type Observation = { event: TransferEvent; nativeAnchor?: string };
export type Evidence = {
  status: Completeness;
  code: string;
  inventoryHash: string;
  snapshotHash: string;
  originId: string;
  consistentRead: boolean;
  parseErrors: number;
  history: 'known-scope' | 'unknown-prefix';
  coverage: 'snapshot-only' | 'fixture-certified';
  // This proof is an actual content comparison, separate from a claimed complete flag.
  beforeHash: string;
  afterHash: string;
};
export type PriceBasis = {
  rates: Record<string, TransferPrice>;
  aliases: Record<string, string>;
  schedule: 'commandcode-peak-v1';
  provenance: string;
};
export type SessionGeneration = {
  contract: 'phase0b-candidate/1';
  scope: Scope;
  parent: string | null;
  observations: Observation[];
  evidence: Evidence;
  basis: PriceBasis;
  mappings: Record<string, string | null>;
  operation: 'observe' | 'replace-complete-session';
  // Explicit removals of strong anchors. Weak records are one session entity, never fuzzy-matched.
  removedAnchors: string[];
  generationId: string;
};
export const scopeId = (scope: Scope) => hash(['scope/1', scope.deviceId, scope.source, scope.sessionId]);
export const logicalIdentity = (scope: Scope, anchor?: string) => hash(['entity/1', scopeId(scope), anchor ? ['native', anchor] : ['session']]);
export const fingerprint = (observation: Observation, basis: PriceBasis) => hash(['record/1', observation.event, observation.nativeAnchor ?? null, basis]);
export const priceVersion = (basis: PriceBasis) => hash(['pricing/1', basis]);
export function generation(payload: Omit<SessionGeneration, 'generationId' | 'contract'>): SessionGeneration {
  const data = { contract: 'phase0b-candidate/1' as const, ...payload };
  return { ...data, generationId: hash(data) };
}
export function verifyGeneration(value: SessionGeneration) {
  const { generationId, ...payload } = value;
  if (generationId !== hash(payload)) throw new Error('GENERATION_HASH_MISMATCH');
  const proof = value.evidence;
  if (proof.status !== 'complete' || !proof.consistentRead || proof.parseErrors || proof.beforeHash !== proof.afterHash
    || proof.history !== 'known-scope' || proof.originId !== value.scope.originId) throw new Error('INCOMPLETE_SCOPE');
  const anchors = value.observations.flatMap(row => row.nativeAnchor ? [row.nativeAnchor] : []);
  if (new Set(anchors).size !== anchors.length) throw new Error('AMBIGUOUS_ANCHOR');
  for (const row of value.observations) {
    if (row.event.source !== value.scope.source || row.event.sessionId !== value.scope.sessionId) throw new Error('CROSS_SCOPE_RECORD');
  }
}

export function pricedObservation(scope: Scope, row: Observation, basis: PriceBasis, mappings: Record<string, string | null> = {}): RawUsageEvent & { apiEquivalentCost: number | null; pricingVersion: string } {
  const event = row.event, modelName = canonicalModelName(event.modelName, basis.aliases);
  const prices = new Map(Object.entries(basis.rates).map(([model, price]) => [model.toLowerCase(), price]));
  const rate = lookupPricing(prices, modelName) ?? lookupPricing(prices, event.modelName);
  if (event.source === 'codex' && event.recordedCost !== undefined) throw new Error('CODEX_RECORDED_COST');
  const equivalent = computeCostFromPricing(rate, event), dateKey = dashboardDate(event.timestampMs);
  const labels: Record<TransferSource, string> = { codex: 'Codex CLI', commandcode: 'CommandCode', antigravity: 'Antigravity',
    claudeCode: 'Claude Code', deepseekHarness: 'DeepSeek Harness', geminiCli: 'Gemini CLI', opencode: 'OpenCode', zcode: 'ZCode' };
  const raw: RawUsageEvent = { ...event, modelName, sourceId: event.source, sourceLabel: labels[event.source],
    deviceId: scope.deviceId, deviceLabel: 'Synthetic device', projectKey: mappings[event.projectKey] || 'external:' + scope.deviceId + ':' + event.projectKey,
    projectName: mappings[event.projectKey] ? event.projectName : event.projectName + ' · Synthetic device',
    cost: event.recordedCost ?? equivalent, costSource: event.recordedCost === undefined ? 'calculated' : 'recorded',
    missingPricing: event.recordedCost === undefined && !canPriceUsage(rate, event), dateKey, monthKey: dateKey.slice(0, 7) };
  const quota = applyCommandCodeQuota(raw), api = applyCommandCodeQuota({ ...raw, cost: equivalent });
  return { ...quota, apiEquivalentCost: canPriceUsage(rate, event) ? api.cost : null, pricingVersion: priceVersion(basis) };
}

export type AdoptionProof = {
  kind: 'registered-origin' | 'owner-reviewed';
  deviceId: string;
  source: TransferSource;
  sessionId: string;
  originId: string;
  batchChecksum: string;
  evidenceHash: string;
};
export function classifyAdoption(legacy: TransferEvent[], candidate: SessionGeneration, legacyDevice: string, checksum: string,
  proof?: AdoptionProof): 'auto-adopt' | 'review-required' | 'conflict' {
  if (legacyDevice !== candidate.scope.deviceId || legacy.some(row => row.source !== candidate.scope.source)) return 'conflict';
  if (!proof || proof.deviceId !== legacyDevice || proof.source !== candidate.scope.source || proof.sessionId !== candidate.scope.sessionId
    || proof.originId !== candidate.scope.originId || proof.batchChecksum !== checksum || !proof.evidenceHash) return 'review-required';
  if (legacy.some(row => row.sessionId !== candidate.scope.sessionId)) return 'review-required';
  if (proof.kind === 'owner-reviewed') return 'auto-adopt';
  // Exact native ID or a unique full content bridge under a pre-registered origin binding.
  const key = (row: TransferEvent) => hash({ ...row, eventId: undefined });
  const old = legacy.map(key), next = candidate.observations.map(row => key(row.event));
  if (new Set(old).size !== old.length || new Set(next).size !== next.length || old.length !== next.length) return 'review-required';
  return old.every(value => next.includes(value)) ? 'auto-adopt' : 'review-required';
}
