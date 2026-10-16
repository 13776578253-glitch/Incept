import type { RawUsageEvent, UnitPricing } from '../types';
import { dashboardDate, type TransferEvent } from '../../../domain';
import { canonicalModelName } from '../overrides';
import { canPriceUsage, computeCostFromPricing, lookupPricing } from '../pricing';
import { nativeEventId, contentHash } from './identity';
import { readActiveBatches, importStorePath } from './store';
import { externalProject } from './planner';

export function loadImportedEvents(native: RawUsageEvent[], pricing: Map<string, UnitPricing>, aliases: Record<string, string>, path = importStorePath()) {
  const events: RawUsageEvent[] = [], issues: string[] = [];
  const replacedIndexed = new Set<RawUsageEvent>();
  const indexed = new Map(native.filter(event => !event.eventId && (event.sourceId === 'codex' || event.sourceId === 'commandcode'))
    .map(event => [contentHash({ ...event, source: event.sourceId } as TransferEvent, canonicalModelName(event.modelName, aliases)), event]));
  const seen = new Set(native.map(nativeEventId));
  const targets = new Map(native.map(event => [event.projectKey, event]));
  const combinedPricing = new Map(pricing);
  let updatedAt = 0;
  let batches;
  try { batches = readActiveBatches(path).reverse(); }
  catch { return { events, pricing: combinedPricing, updatedAt, replacedIndexed, issues: ['Import storage could not be read; imported usage is unavailable.'] }; }
  for (const batch of batches) {
    for (const [model, price] of Object.entries(batch.bundle.prices ?? {})) {
      const canonical = canonicalModelName(model, aliases).toLowerCase();
      if (price && !lookupPricing(combinedPricing, canonical)) combinedPricing.set(canonical, price);
      if (price && !lookupPricing(combinedPricing, model.toLowerCase())) combinedPricing.set(model.toLowerCase(), price);
    }
  }
  for (const batch of batches) {
    updatedAt = Math.max(updatedAt, Date.parse(batch.receipt.importedAt));
    for (const event of batch.bundle.events) {
      if (seen.has(event.eventId)) continue;
      seen.add(event.eventId);
      const modelName = canonicalModelName(event.modelName, aliases);
      const indexedCopy = indexed.get(contentHash(event, modelName));
      if (indexedCopy) replacedIndexed.add(indexedCopy);
      const price = lookupPricing(combinedPricing, modelName) ?? batch.bundle.prices[event.modelName];
      if (price && !lookupPricing(combinedPricing, modelName)) combinedPricing.set(modelName.toLowerCase(), price);
      const target = batch.mappings[event.projectKey];
      const project = target ? targets.get(target) : undefined;
      const cost = event.recordedCost ?? computeCostFromPricing(price, event);
      const dateKey = dashboardDate(event.timestampMs);
      const sourceLabels: Record<string, string> = {
        codex: 'Codex CLI', commandcode: 'CommandCode', antigravity: 'Antigravity',
        claudeCode: 'Claude Code', opencode: 'OpenCode', zcode: 'ZCode', geminiCli: 'Gemini CLI',
      };
      events.push({ ...event, modelName, sourceId: event.source, sourceLabel: sourceLabels[event.source] ?? event.source,
        deviceId: batch.bundle.device.id, deviceLabel: batch.bundle.device.label, importBatchId: batch.receipt.id,
        projectKey: target || externalProject(batch.bundle.device.id, event.projectKey),
        projectName: project?.projectName ?? (target ? event.projectName : event.projectName + ' · ' + batch.bundle.device.label),
        workspacePath: project?.workspacePath ?? event.workspacePath,
        costSource: event.recordedCost === undefined ? 'calculated' : 'recorded', cost,
        missingPricing: event.recordedCost === undefined && !canPriceUsage(price, event), dateKey, monthKey: dateKey.slice(0, 7) });
    }
  }
  return { events, pricing: combinedPricing, updatedAt, issues, replacedIndexed };
}
