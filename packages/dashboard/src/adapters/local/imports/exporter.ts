import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname, homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { TransferBundle, TransferEvent, TransferPrice } from '../../../domain';
import { collectCommandCodeEvents } from '../collectors/commandcode';
import { collectAiusageAndRawAgentEvents } from '../collectors/agents';
import { normalizeFile } from '../collectors/common';
import { loadLocalPricingMap, lookupPricing } from '../pricing';
import { hash, nativeEventId, eventTokens, recordHash } from './identity';
import { validateBundle } from './validation';
import { canonicalTransferId } from './matching';

export function deviceId(home: string) {
  const directory = join(home, '.incept'), path = join(directory, 'token-device.json');
  if (!existsSync(path)) {
    mkdirSync(directory, { recursive: true });
    try { writeFileSync(path, JSON.stringify({ id: randomUUID() }) + '\n', { flag: 'wx', mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  const data = JSON.parse(readFileSync(path, 'utf8')) as { id?: string };
  if (!data.id || !/^[a-f0-9-]{36}$/i.test(data.id)) throw new Error('Invalid persistent token-device.json; do not silently replace device identity');
  return data.id;
}
export function exportTokenData(options: { home?: string; deviceId?: string; label?: string } = {}): TransferBundle {
  const home = options.home ?? homedir(), now = Date.now();
  const pricing = loadLocalPricingMap(home, { aliases: {}, prices: {}, updatedAt: 0 });
  const commandcode = collectCommandCodeEvents(home, pricing);
  const agents = collectAiusageAndRawAgentEvents(home, pricing);
  const commandFiles = new Set(commandcode.events.flatMap(event => event.sourceFile ? [normalizeFile(event.sourceFile)] : []));
  const agentEvents = agents.events.filter(event => event.sourceId !== 'commandcode' || !event.sourceFile || !commandFiles.has(normalizeFile(event.sourceFile)));
  const records = [...commandcode.events, ...agentEvents];
  const events = new Map<string, TransferEvent>(), prices: Record<string, TransferPrice> = {}, warnings = [...commandcode.errors, ...agents.errors, ...agents.harnessDiagnostics.map(item => 'deepseekHarness:' + item.reason + ':' + (item.sessionId ?? 'unidentified'))];
  for (const raw of records) {
    if (raw.timestampMs > now) { warnings.push('Excluded usage newer than the export snapshot'); continue; }
    const event: TransferEvent = { eventId: nativeEventId(raw), source: raw.sourceId as TransferEvent['source'],
      sessionId: raw.sessionId, timestampMs: raw.timestampMs, modelName: raw.modelName,
      projectKey: raw.projectKey + ':' + hash(raw.workspacePath ?? raw.projectKey).slice(0, 16),
      projectName: raw.projectName, workspacePath: raw.workspacePath, sessionTitle: raw.sessionTitle,
      inputTokens: raw.inputTokens, outputTokens: raw.outputTokens, cacheReadTokens: raw.cacheReadTokens,
      cacheCreationTokens: raw.cacheCreationTokens, reasoningTokens: raw.reasoningTokens };
    if (raw.costSource === 'recorded' && raw.sourceId !== 'codex') event.recordedCost = raw.nominalCost ?? raw.cost;
    event.eventId = canonicalTransferId(event);
    if (!eventTokens(event)) continue;
    const previous = events.get(event.eventId);
    if (previous && !raw.eventId) throw new Error('Usage records share an ambiguous identity; export stopped');
    if (previous && recordHash(previous) !== recordHash(event)) throw new Error('Conflicting source records; export stopped');
    events.set(event.eventId, event);
    const price = lookupPricing(pricing, raw.modelName); if (price) prices[raw.modelName] = { ...price };
  }
  if (!events.size) throw new Error('No readable usage found in the selected home directory');
  const payload = { format: 'incept-token-transfer' as const, version: 1 as const, exportId: randomUUID(),
    device: { id: options.deviceId ?? deviceId(home), label: options.label ?? hostname(), platform: process.platform },
    exportedAt: new Date(now).toISOString(), events: [...events.values()].sort((a, b) => a.timestampMs - b.timestampMs || a.eventId.localeCompare(b.eventId)),
    prices, warnings: [...new Set(warnings)] };
  return validateBundle({ ...payload, checksum: hash(payload) });
}
