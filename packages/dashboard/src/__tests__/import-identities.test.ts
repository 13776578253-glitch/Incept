import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TransferBundle } from '../domain';
import { exportTokenData } from '../adapters/local/imports/exporter';
import { previewImport, commitImport, rollbackImport, importHistory } from '../adapters/local/imports/service';
import { loadImportedEvents } from '../adapters/local/imports/layer';
import { collectImportContext } from '../adapters/local/imports/context';
import { hash } from '../adapters/local/imports/identity';
import { ImportStore } from '../adapters/local/imports/store';

// Real index and raw fixtures reproduce the historical transition across independent processes.
let home: string, storePath: string;
const at = Date.parse('2025-10-10T01:00:00Z'), context = { events: [], pricing: new Map(), aliases: {} };
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'dashboard-identities-')); storePath = join(home, 'receiver.db'); });
afterEach(() => {
  if (!resolve(home).startsWith(join(resolve(tmpdir()), 'dashboard-identities-'))) throw new Error('Unsafe test cleanup');
  rmSync(home, { recursive: true, force: true });
});
const options = () => ({ storePath, context });
function writeIndex() {
  const directory = join(home, '.aiusage'); mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, 'cache.db'));
  try {
    db.exec('CREATE TABLE records(ts INTEGER,tool TEXT,model TEXT,input_tokens INTEGER,output_tokens INTEGER,cache_read_tokens INTEGER,cache_write_tokens INTEGER,thinking_tokens INTEGER,cost REAL,session_id TEXT,source_file TEXT,cwd TEXT)');
    db.prepare('INSERT INTO records VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(at, 'claude', 'identity-fixture-model', 100, 20, 10, 0, 0, .2, 'fixture-session', join(home, '.claude/projects/fixture/session.jsonl'), 'D:/fixture');
  } finally { db.close(); }
}
function writeRaw(ids = ['message-one'], models = ['identity-fixture-model'], costUSD = .2) {
  const directory = join(home, '.claude', 'projects', 'fixture'); mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'session.jsonl'), ids.map((id, index) => JSON.stringify({ type: 'assistant',
    sessionId: 'fixture-session', timestamp: new Date(at).toISOString(), cwd: 'D:/fixture', costUSD,
    message: { id, model: models[index] ?? models[0], usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 10 } } })).join('\n'));
}
function rehash(bundle: TransferBundle): TransferBundle {
  return { ...bundle, checksum: hash({ ...bundle, checksum: undefined }) };
}
function legacyIndex(bundle: TransferBundle) {
  return rehash({ ...bundle, events: bundle.events.map(event => ({ ...event, eventId: hash([event.timestampMs, event.source,
    event.modelName, event.inputTokens, event.cacheReadTokens, event.cacheCreationTokens, event.outputTokens, event.reasoningTokens, event.sessionId, undefined]) })) });
}
function importBundle(bundle: TransferBundle) { const preview = previewImport(bundle, {}, options()); return commitImport(preview.previewId, options()); }

describe('indexed/native transfer identity compatibility', () => {
  for (const legacy of [false, true]) {
    it(`does not double-count after restoring native logs (legacy index: ${legacy})`, () => {
      writeIndex(); const indexed = exportTokenData({ home });
      importBundle(legacy ? legacyIndex(indexed) : indexed);
      writeRaw(); const raw = exportTokenData({ home });
      expect(raw.events).toHaveLength(1);
      const preview = previewImport(raw, {}, options());
      expect(preview).toMatchObject({ added: 0, duplicateImported: 1, conflicts: 0 });
      const second = commitImport(preview.previewId, options());
      expect(loadImportedEvents([], new Map(), {}, storePath).events).toHaveLength(1);
      expect(loadImportedEvents([], new Map(), {}, storePath).events[0]).toMatchObject({ inputTokens: 100, outputTokens: 20, cacheReadTokens: 10, cost: .2 });
      rollbackImport(second.id, storePath);
      expect(loadImportedEvents([], new Map(), {}, storePath).events).toHaveLength(1);
      rollbackImport(importHistory(storePath).find(item => item.status === 'active')!.id, storePath);
      expect(loadImportedEvents([], new Map(), {}, storePath).events).toHaveLength(0);
    });
  }
  it('matches an old raw aggregate identity without discarding the independent request ID', () => {
    writeRaw(); const raw = exportTokenData({ home });
    const old = rehash({ ...raw, events: raw.events.map(event => ({ ...event, eventId: hash([event.source, event.sessionId, event.timestampMs,
      event.inputTokens, event.outputTokens, event.cacheReadTokens, event.cacheCreationTokens, event.reasoningTokens]) })) });
    importBundle(old);
    expect(previewImport(raw, {}, options())).toMatchObject({ added: 0, duplicateImported: 1, conflicts: 0 });
  });
  it('retains independent requests with identical timestamps and counters', () => {
    writeRaw(['message-one', 'message-two']);
    const raw = exportTokenData({ home });
    expect(raw.events).toHaveLength(2); expect(new Set(raw.events.map(item => item.eventId)).size).toBe(2);
    expect(previewImport(raw, {}, options())).toMatchObject({ added: 2, addedTokens: 260, conflicts: 0 });
    importBundle(raw);
    expect(loadImportedEvents([], new Map(), {}, storePath).events).toHaveLength(2);
  });
  it('blocks ambiguous bridges from one index record to two native requests', () => {
    writeIndex(); importBundle(legacyIndex(exportTokenData({ home })));
    writeRaw(['message-one', 'message-two']); const raw = exportTokenData({ home });
    const preview = previewImport(raw, {}, options());
    expect(preview.conflicts).toBe(2);
    expect(() => commitImport(preview.previewId, options())).toThrow('Conflicting usage');
    expect(importHistory(storePath)).toHaveLength(1);
  });
  it('still blocks changes to an already recorded fee across a bridge', () => {
    writeIndex(); importBundle(legacyIndex(exportTokenData({ home })));
    writeRaw(['message-one'], undefined, .3);
    expect(previewImport(exportTokenData({ home }), {}, options()).conflicts).toBe(1);
  });
  it('matches local native logs against previously exported index records', () => {
    writeIndex(); const indexed = legacyIndex(exportTokenData({ home })); writeRaw();
    const native = collectImportContext(home);
    expect(previewImport(indexed, {}, { storePath, context: native })).toMatchObject({ added: 0, duplicateLocal: 1, conflicts: 0 });
  });
  it('reads existing double-representation batches only once and retains immutable receipts', () => {
    writeIndex(); const indexed = legacyIndex(exportTokenData({ home })); importBundle(indexed);
    writeRaw(); const raw = exportTokenData({ home });
    const first = importHistory(storePath)[0], store = new ImportStore(storePath);
    try { store.saveBatch({ receipt: { ...first, id: 'historical-second', checksum: raw.checksum }, bundle: raw, mappings: {} }, hash({})); }
    finally { store.close(); }
    expect(loadImportedEvents([], new Map(), {}, storePath).events).toHaveLength(1);
    expect(importHistory(storePath)).toHaveLength(2);
    rollbackImport('historical-second', storePath);
    expect(loadImportedEvents([], new Map(), {}, storePath).events).toHaveLength(1);
  });
});
