import type { ImportMappings, ImportPreview, TransferBundle, TransferEvent } from '../../../domain';
import type { ImportContext } from './context';
import type { StoredBatch } from './store';
import { contentHash, recordHash, eventTokens, hash, nativeEventId } from './identity';
import { canonicalModelName } from '../overrides';
import { canPriceUsage, lookupPricing } from '../pricing';
import { ImportError } from './validation';

export function externalProject(device: string, key: string) { return 'external:' + device + ':' + key; }
export function planImport(bundle: TransferBundle, input: ImportMappings, context: ImportContext, batches: StoredBatch[]) {
  const targets = [...new Map(context.events.map(event => [event.projectKey,
    { key: event.projectKey, name: event.projectName, path: event.workspacePath }])).values()];
  const mappings: ImportMappings = Object.create(null);
  const projects = new Map<string, ImportPreview['projects'][number]>();
  const models = new Map<string, ImportPreview['models'][number]>();
  const local = new Map(context.events.map(event => [nativeEventId(event), recordHash({ ...event, source: event.sourceId } as TransferEvent,
    canonicalModelName(event.modelName, context.aliases))]));
  const indexed = new Set(context.events.filter(event => !event.eventId && (event.sourceId === 'codex' || event.sourceId === 'commandcode'))
    .map(event => contentHash({ ...event, source: event.sourceId } as TransferEvent, canonicalModelName(event.modelName, context.aliases))));
  const imported = new Map<string, { content: string; project: string }>();
  for (const batch of batches) for (const event of batch.bundle.events) {
    imported.set(event.eventId, { content: recordHash(event, canonicalModelName(event.modelName, context.aliases)),
      project: batch.mappings[event.projectKey] || externalProject(batch.bundle.device.id, event.projectKey) });
  }
  for (const event of bundle.events) {
    if (!projects.has(event.projectKey)) {
      const suggestions = targets.filter(target => target.name === event.projectName || target.path && target.path === event.workspacePath);
      projects.set(event.projectKey, { key: event.projectKey, name: event.projectName, path: event.workspacePath, records: 0,
        suggestedTarget: suggestions.length === 1 ? suggestions[0].key : undefined });
      const mapped = Object.hasOwn(input, event.projectKey) ? input[event.projectKey] : null;
      if (mapped !== null && !targets.some(target => target.key === mapped)) throw new ImportError('INVALID_MAPPING', 'Project mapping target is unavailable');
      mappings[event.projectKey] = mapped;
    }
    projects.get(event.projectKey)!.records++;
    const resolvedName = canonicalModelName(event.modelName, context.aliases);
    const priced = event.recordedCost !== undefined || canPriceUsage(lookupPricing(context.pricing, resolvedName) ?? bundle.prices[event.modelName], event);
    const model = models.get(event.modelName) ?? { name: event.modelName, resolvedName, records: 0, priced: true };
    model.records++; model.priced &&= priced; models.set(event.modelName, model);
  }
  if (Object.keys(input).some(key => !projects.has(key))) throw new ImportError('INVALID_MAPPING', 'Unknown source project');
  const seen = new Map<string, string>();
  let added = 0, duplicateLocal = 0, duplicateImported = 0, conflicts = 0, addedTokens = 0;
  const classifications: Array<[string, string]> = [];
  for (const event of bundle.events) {
    const resolvedName = canonicalModelName(event.modelName, context.aliases);
    const fingerprint = recordHash(event, resolvedName);
    const previous = seen.get(event.eventId), native = local.get(event.eventId), prior = imported.get(event.eventId);
    let classification = 'added';
    if (previous) { classification = previous === fingerprint ? 'duplicate-imported' : 'conflict'; }
    else if (native) { classification = native === fingerprint ? 'duplicate-local' : 'conflict'; }
    else if (indexed.has(contentHash(event, resolvedName))) { classification = 'duplicate-local'; }
    else if (prior) { classification = prior.content === fingerprint && prior.project === (mappings[event.projectKey] || externalProject(bundle.device.id, event.projectKey)) ? 'duplicate-imported' : 'conflict'; }
    seen.set(event.eventId, fingerprint);
    if (classification === 'added') { added++; addedTokens += eventTokens(event); }
    if (classification === 'duplicate-local') duplicateLocal++;
    if (classification === 'duplicate-imported') duplicateImported++;
    if (classification === 'conflict') conflicts++;
    classifications.push([event.eventId, classification]);
  }
  return { mappings, reviewHash: hash([classifications, mappings, targets.filter(target => Object.values(mappings).includes(target.key))]),
    summary: { device: bundle.device, exportedAt: bundle.exportedAt, received: bundle.events.length, added, duplicateLocal, duplicateImported,
      conflicts, addedTokens, projects: [...projects.values()], targets, models: [...models.values()], warnings: bundle.warnings } };
}
