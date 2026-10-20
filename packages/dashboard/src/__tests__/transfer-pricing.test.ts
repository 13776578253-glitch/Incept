import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { TRANSFER_SOURCES, type TransferBundle, type TransferPrice } from '../domain';
import { hash } from '../adapters/local/imports/identity';
import { previewImport, commitImport, rollbackImport } from '../adapters/local/imports/service';
import { loadImportedEvents } from '../adapters/local/imports/layer';

let home: string, storePath: string;
const context = { events: [], pricing: new Map(), aliases: {} }, device = { id: randomUUID(), label: 'Fixture', platform: 'linux' };
const price = (inputPerMillion: number): TransferPrice => ({ inputPerMillion, outputPerMillion: 2, cacheReadPerMillion: .1 });
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'dashboard-transfer-prices-')); storePath = join(home, 'imports.db'); });
afterEach(() => {
  if (!resolve(home).startsWith(join(resolve(tmpdir()), 'dashboard-transfer-prices-'))) throw new Error('Unsafe test cleanup');
  rmSync(home, { recursive: true, force: true });
});
function bundle(id: string, rate?: TransferPrice, source: typeof TRANSFER_SOURCES[number] = 'codex'): TransferBundle {
  const prices: Record<string, TransferPrice> = rate ? { 'price-fixture': rate } : {};
  const payload = { format: 'incept-token-transfer' as const, version: 1 as const, exportId: randomUUID(), device, exportedAt: new Date().toISOString(),
    events: [{ eventId: hash(id), source, sessionId: id, timestampMs: Date.parse('2025-10-10T01:00:00Z'),
      modelName: 'price-fixture', projectKey: 'fixture', projectName: 'Fixture', inputTokens: 1_000_000, outputTokens: 0,
      cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0 }], prices, warnings: [] };
  return { ...payload, checksum: hash(payload) };
}
function commit(input: TransferBundle) {
  const options = { storePath, context }; return commitImport(previewImport(input, {}, options).previewId, options);
}

it.each(TRANSFER_SOURCES)('accepts, persists, replays and rolls back %s while retaining the original v1 contract', source => {
  const input = bundle(source, price(1), source), first = commit(input);
  expect(commit(input).id).toBe(first.id);
  expect(loadImportedEvents([], new Map(), {}, storePath).events[0]).toMatchObject({ sourceId: source, cost: 1 });
  rollbackImport(first.id, storePath);
  expect(loadImportedEvents([], new Map(), {}, storePath).events).toHaveLength(0);
});

it('uses each batch own rates, then the newest active catalog for otherwise unpriced records', () => {
  commit(bundle('unpriced'));
  const firstCatalog = commit(bundle('first-catalog', price(1)));
  commit(bundle('second-catalog', price(2)));
  const output = loadImportedEvents([], new Map(), {}, storePath).events;
  expect(output.map(event => event.cost)).toEqual([2, 1, 2]);
  expect(previewImport(bundle('new-unpriced'), {}, { storePath, context }).models[0].priced).toBe(true);
  rollbackImport(firstCatalog.id, storePath);
  expect(loadImportedEvents([], new Map(), {}, storePath).events.map(event => event.cost)).toEqual([2, 2]);
});

it('recomputes inherited prices after rollback and never mutates the receiver catalog', () => {
  commit(bundle('unpriced'));
  const first = commit(bundle('first', price(1))), second = commit(bundle('second', price(2)));
  const receiver = new Map([['price-fixture', price(3)]]);
  expect(loadImportedEvents([], receiver, {}, storePath).events.map(event => event.cost)).toEqual([3, 3, 3]);
  expect(receiver.get('price-fixture')?.inputPerMillion).toBe(3);
  rollbackImport(second.id, storePath);
  expect(loadImportedEvents([], new Map(), {}, storePath).events.map(event => event.cost)).toEqual([1, 1]);
  rollbackImport(first.id, storePath);
  expect(loadImportedEvents([], new Map(), {}, storePath).events[0].missingPricing).toBe(true);
  expect(previewImport(bundle('new-unpriced'), {}, { storePath, context }).models[0].priced).toBe(false);
});
