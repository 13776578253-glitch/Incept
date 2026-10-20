import type { ImportMappings, ImportPreview, TransferBundle, TransferEvent } from '../../../domain';
import type { ImportContext } from './context';
import type { StoredBatch } from './store';
import { contentHash, recordHash, eventTokens, hash, nativeEventId } from './identity';
import { canonicalModelName } from '../overrides';
import { canPriceUsage, lookupPricing } from '../pricing';
import { ImportError } from './validation';
import { canonicalTransferId, identityIndex } from './matching';
import { capturedPricing, inheritedPricing } from './pricing';

export function externalProject(device: string, key: string) { return 'external:' + device + ':' + key; }
export function planImport(bundle: TransferBundle, input: ImportMappings, context: ImportContext, batches: StoredBatch[]) {
  const captured = capturedPricing(bundle, context.aliases), inherited = inheritedPricing(context.pricing, context.aliases, batches);
  const targets = [...new Map(context.events.map(event => [event.projectKey,
    { key: event.projectKey, name: event.projectName, path: event.workspacePath }])).values()];
  const mappings: ImportMappings = Object.create(null);
  const projects = new Map<string, ImportPreview['projects'][number]>();
  const models = new Map<string, ImportPreview['models'][number]>();
  const resolve = (name: string) => canonicalModelName(name, context.aliases);
  const incoming = identityIndex(bundle.events.map(event => ({ event })), resolve);
  const local = identityIndex(context.events.map(raw => ({ event: { ...raw, source: raw.sourceId, eventId: nativeEventId(raw) } as TransferEvent,
    fingerprint: recordHash({ ...raw, source: raw.sourceId } as TransferEvent, resolve(raw.modelName)) })), resolve);
  const indexed = new Set(context.events.filter(event => !event.eventId && (event.sourceId === 'codex' || event.sourceId === 'commandcode'))
    .map(event => contentHash({ ...event, source: event.sourceId } as TransferEvent, canonicalModelName(event.modelName, context.aliases))));
  const stored: Array<{ event: TransferEvent; content: string; project: string }> = [];
  for (const batch of batches) for (const event of batch.bundle.events) {
    stored.push({ event, content: recordHash(event, canonicalModelName(event.modelName, context.aliases)),
      project: batch.mappings[event.projectKey] || externalProject(batch.bundle.device.id, event.projectKey) });
  }
  const imported = identityIndex(stored, resolve);
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
    const priced = event.recordedCost !== undefined || canPriceUsage(lookupPricing(context.pricing, resolvedName)
      ?? lookupPricing(captured, event.modelName) ?? lookupPricing(captured, resolvedName) ?? lookupPricing(inherited, resolvedName), event);
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
    const identity = canonicalTransferId(event), previous = seen.get(identity), native = local.find(event, incoming), prior = imported.find(event, incoming);
    let classification = 'added';
    if (incoming.count(event) > 1 && incoming.hasWeak(event)) { classification = 'conflict'; }
    else if (previous) { classification = previous === fingerprint ? 'duplicate-imported' : 'conflict'; }
    else if (native.ambiguous) { classification = 'conflict'; }
    else if (native.matches.length) { classification = native.matches.every(item => item.fingerprint === fingerprint) ? 'duplicate-local' : 'conflict'; }
    else if (indexed.has(contentHash(event, resolvedName))) { classification = 'duplicate-local'; }
    else if (prior.ambiguous) { classification = 'conflict'; }
    else if (prior.matches.length) { classification = prior.matches.every(item => item.content === fingerprint && item.project === (mappings[event.projectKey] || externalProject(bundle.device.id, event.projectKey))) ? 'duplicate-imported' : 'conflict'; }
    seen.set(identity, fingerprint);
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
