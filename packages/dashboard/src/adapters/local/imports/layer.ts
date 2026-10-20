import type { RawUsageEvent, UnitPricing } from '../types';
import { dashboardDate, type TransferEvent } from '../../../domain';
import { canonicalModelName } from '../overrides';
import { canPriceUsage, computeCostFromPricing, lookupPricing } from '../pricing';
import { nativeEventId, recordHash } from './identity';
import { canonicalTransferId, hasWeakIdentity, identityIndex } from './matching';
import { readActiveBatches, importStorePath } from './store';
import { externalProject } from './planner';
import { capturedPricing, inheritedPricing } from './pricing';

export function loadImportedEvents(native: RawUsageEvent[], pricing: Map<string, UnitPricing>, aliases: Record<string, string>, path = importStorePath()) {
  const events: RawUsageEvent[] = [], issues: string[] = [];
  const replacedIndexed = new Set<RawUsageEvent>();
  const resolve = (name: string) => canonicalModelName(name, aliases);
  const local = identityIndex(native.map(raw => ({ raw, event: { ...raw, eventId: nativeEventId(raw), source: raw.sourceId } as TransferEvent })), resolve);
  const seen = new Set<string>();
  const targets = new Map(native.map(event => [event.projectKey, event]));
  let combinedPricing = new Map(pricing);
  let updatedAt = 0;
  let batches;
  try { batches = readActiveBatches(path).reverse(); }
  catch { return { events, pricing: combinedPricing, updatedAt, replacedIndexed, issues: ['Import storage could not be read; imported usage is unavailable.'] }; }
  const records = batches.flatMap(batch => batch.bundle.events.map(event => ({ event, batch,
    project: batch.mappings[event.projectKey] || externalProject(batch.bundle.device.id, event.projectKey) })));
  const transferred = identityIndex(records, resolve);
  combinedPricing = inheritedPricing(pricing, aliases, [...batches].reverse());
  for (const batch of batches) {
    const captured = capturedPricing(batch.bundle, aliases);
    updatedAt = Math.max(updatedAt, Date.parse(batch.receipt.importedAt));
    for (const event of batch.bundle.events) {
      const identity = canonicalTransferId(event);
      if (seen.has(identity)) continue;
      if (hasWeakIdentity(event) && transferred.hasWeak(event)) {
        const strong = transferred.related(event).filter(item => !hasWeakIdentity(item.event));
        if (strong.length) {
          const candidates = new Set(strong.map(item => item.event.eventId));
          const fingerprint = recordHash(event, resolve(event.modelName));
          const project = batch.mappings[event.projectKey] || externalProject(batch.bundle.device.id, event.projectKey);
          if (candidates.size === 1 && strong.every(item => recordHash(item.event, resolve(item.event.modelName)) === fingerprint && item.project === project)) continue;
          issues.push('Ambiguous historical import identity; review the affected batches before updating data.');
        }
      }
      const nativeCopy = local.find(event, transferred);
      if (nativeCopy.matches.length && !nativeCopy.ambiguous) {
        const indexedCopies = nativeCopy.matches.filter(item => !item.raw.eventId && (item.raw.sourceId === 'codex' || item.raw.sourceId === 'commandcode'));
        if (indexedCopies.length !== nativeCopy.matches.length) continue;
        for (const item of indexedCopies) replacedIndexed.add(item.raw);
      } else if (nativeCopy.ambiguous) issues.push('Ambiguous native/import identity; review the affected batches before updating data.');
      seen.add(identity);
      const modelName = canonicalModelName(event.modelName, aliases);
      const price = lookupPricing(pricing, modelName) ?? lookupPricing(captured, event.modelName) ?? lookupPricing(captured, modelName) ?? lookupPricing(combinedPricing, modelName);
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
  return { events, pricing: combinedPricing, updatedAt, issues: [...new Set(issues)], replacedIndexed };
}
