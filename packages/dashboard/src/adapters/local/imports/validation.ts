import type { TransferBundle, TransferEvent, TransferPrice } from '../../../domain';
import { TRANSFER_SOURCES } from '../../../domain';
import { hash } from './identity';

export const MAX_TRANSFER_BYTES = 64 * 1024 * 1024;
const digest = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const allowedSources = new Set<string>(TRANSFER_SOURCES);
export class ImportError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); }
}
function fail(message: string): never { throw new ImportError('INVALID_TRANSFER', message); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected a JSON object');
  return value as Record<string, unknown>;
}
function keys(row: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(row).some(key => !allowed.includes(key))) fail('Unexpected transfer field');
}
function text(value: unknown, name: string, max = 512): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) fail('Invalid ' + name);
  return value;
}
function count(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000_000) fail('Invalid ' + name);
  return value;
}
function rate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000) fail('Invalid USD rate/cost');
  return value;
}
function optionalText(row: Record<string, unknown>, key: string, limit: number) {
  return row[key] === undefined ? undefined : text(row[key], key, limit);
}
function validateEvent(value: unknown, exportedAt: number): TransferEvent {
  const row = object(value);
  keys(row, ['eventId', 'source', 'sessionId', 'timestampMs', 'modelName', 'projectKey', 'projectName', 'workspacePath', 'sessionTitle',
    'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheCreationTokens', 'reasoningTokens', 'recordedCost']);
  const source = row.source as TransferEvent['source'];
  if (!allowedSources.has(source)) fail('Unsupported transfer source: ' + source);
  const eventId = text(row.eventId, 'eventId', 64); if (!digest.test(eventId)) fail('Invalid event identifier');
  const timestampMs = row.timestampMs;
  if (typeof timestampMs !== 'number' || !Number.isSafeInteger(timestampMs)) fail('Invalid timestampMs');
  if (timestampMs < Date.UTC(2010, 0, 1) || timestampMs > exportedAt + 300_000) fail('Usage timestamp lies outside the export snapshot');
  const event: TransferEvent = { eventId, source, timestampMs,
    sessionId: text(row.sessionId, 'sessionId'), modelName: text(row.modelName, 'modelName', 200),
    projectKey: text(row.projectKey, 'projectKey'), projectName: text(row.projectName, 'projectName'),
    workspacePath: optionalText(row, 'workspacePath', 2048), sessionTitle: optionalText(row, 'sessionTitle', 1024),
    inputTokens: count(row.inputTokens, 'inputTokens'), outputTokens: count(row.outputTokens, 'outputTokens'),
    cacheReadTokens: count(row.cacheReadTokens, 'cacheReadTokens'), cacheCreationTokens: count(row.cacheCreationTokens, 'cacheCreationTokens'),
    reasoningTokens: count(row.reasoningTokens, 'reasoningTokens') };
  if (row.recordedCost !== undefined) {
    if (source === 'codex') fail('Codex exports have no recorded fee field');
    event.recordedCost = rate(row.recordedCost);
  }
  if (event.inputTokens + event.outputTokens + event.cacheReadTokens + event.cacheCreationTokens + event.reasoningTokens <= 0) fail('Empty usage event');
  return event;
}
export function validateBundle(input: unknown): TransferBundle {
  const root = object(input);
  keys(root, ['format', 'version', 'exportId', 'device', 'exportedAt', 'events', 'prices', 'warnings', 'checksum']);
  if (root.format !== 'incept-token-transfer' || root.version !== 1) fail('Unsupported transfer format/version');
  if (typeof root.checksum !== 'string' || !digest.test(root.checksum)) fail('Missing transfer checksum');
  const { checksum, ...payload } = root;
  if (hash(payload) !== checksum) fail('Checksum mismatch; the export was changed or damaged');
  const device = object(root.device), deviceId = text(device.id, 'device.id', 36);
  keys(device, ['id', 'label', 'platform']);
  if (!uuid.test(deviceId) || typeof root.exportId !== 'string' || !uuid.test(root.exportId)) fail('Invalid device/export identifier');
  const exportedAt = text(root.exportedAt, 'exportedAt', 64), time = Date.parse(exportedAt);
  if (!Number.isFinite(time) || time > Date.now() + 300_000) fail('Invalid export clock');
  if (!Array.isArray(root.events) || !root.events.length || root.events.length > 250_000) fail('Expected 1–250000 usage events');
  const events = root.events.map(event => validateEvent(event, time));
  if (new Set(events.map(event => event.eventId)).size !== events.length) fail('Repeated event identifiers inside one export');
  if (!Number.isSafeInteger(events.reduce((sum, event) => sum + event.inputTokens + event.outputTokens + event.cacheReadTokens + event.cacheCreationTokens + event.reasoningTokens, 0))) fail('Total tokens exceed safe numeric precision');
  const prices: Record<string, TransferPrice> = {};
  for (const [model, value] of Object.entries(object(root.prices))) {
    text(model, 'price model', 200); if (['__proto__', 'constructor', 'prototype'].includes(model)) fail('Invalid model key');
    const entry = object(value), price: TransferPrice = { inputPerMillion: rate(entry.inputPerMillion), outputPerMillion: rate(entry.outputPerMillion) };
    keys(entry, ['inputPerMillion', 'outputPerMillion', 'cacheReadPerMillion', 'cacheWritePerMillion']);
    for (const key of ['cacheReadPerMillion', 'cacheWritePerMillion'] as const) if (entry[key] !== undefined) price[key] = rate(entry[key]);
    prices[model] = price;
  }
  if (!Array.isArray(root.warnings) || root.warnings.length > 100) fail('Invalid collector warnings');
  return { format: 'incept-token-transfer', version: 1, exportId: root.exportId, exportedAt,
    device: { id: deviceId, label: text(device.label, 'device.label', 128), platform: text(device.platform, 'device.platform', 32) },
    events, prices, warnings: root.warnings.map(warning => text(warning, 'warning', 1024)), checksum };
}
