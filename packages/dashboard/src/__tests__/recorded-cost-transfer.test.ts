import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { usageEvent } from '../adapters/local/collectors/common';
import { exportTokenData } from '../adapters/local/imports/exporter';
import { previewImport, commitImport } from '../adapters/local/imports/service';
import { loadImportedEvents } from '../adapters/local/imports/layer';
import type { ImportContext } from '../adapters/local/imports/context';

// Exercise source files and persistent imports without consulting the user's home directory.
const at = Date.parse('2025-10-10T01:00:00Z'), model = 'recorded-cost-transfer-fixture';
let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'dashboard-recorded-cost-')); });
afterEach(() => {
  if (!resolve(home).startsWith(join(resolve(tmpdir()), 'dashboard-recorded-cost-'))) throw new Error('Unsafe test cleanup');
  rmSync(home, { recursive: true, force: true });
});

function writeNative(source: 'claudeCode' | 'opencode', cost: unknown) {
  if (source === 'claudeCode') {
    const directory = join(home, '.claude', 'projects', 'fixture'); mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'session.jsonl'), JSON.stringify({ type: 'assistant', sessionId: 'fixture-session',
      timestamp: new Date(at).toISOString(), cwd: 'D:/fixture/project', costUSD: cost,
      message: { id: 'fixture-message', model, usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 10 } } }));
    return;
  }
  const directory = join(home, '.local', 'share', 'opencode'); mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, 'opencode.db'));
  try {
    db.exec('CREATE TABLE session (id TEXT, title TEXT, directory TEXT); CREATE TABLE message (id TEXT, session_id TEXT, time_created INTEGER, data TEXT)');
    db.prepare('INSERT INTO session VALUES (?,?,?)').run('fixture-session', 'Fixture session', 'D:/fixture/project');
    db.prepare('INSERT INTO message VALUES (?,?,?,?)').run('fixture-message', 'fixture-session', at,
      JSON.stringify({ id: 'fixture-message', role: 'assistant', modelID: model, cost, tokens: { input: 100, output: 20, cache: { read: 10 } } }));
  } finally { db.close(); }
}

describe('native recorded-cost transfer', () => {
  for (const source of ['claudeCode', 'opencode'] as const) {
    it.each([.2, 0])(`${source} retains a recorded fee of %s through export and import`, cost => {
      writeNative(source, cost);
      const bundle = exportTokenData({ home });
      expect(bundle.events).toHaveLength(1);
      expect(bundle.events[0]).toMatchObject({ source, recordedCost: cost });
      const storePath = join(home, 'receiver.db');
      const context: ImportContext = { events: [], pricing: new Map(), aliases: {} };
      const preview = previewImport(JSON.parse(JSON.stringify(bundle)), {}, { storePath, context });
      expect(preview).toMatchObject({ added: 1, addedTokens: 130, conflicts: 0 });
      expect(preview.models[0].priced).toBe(true);
      commitImport(preview.previewId, { storePath, context });
      const prices = new Map([[model, { inputPerMillion: 99, outputPerMillion: 99, cacheReadPerMillion: 99 }]]);
      for (const pricing of [new Map(), prices]) {
        const loaded = loadImportedEvents([], pricing, {}, storePath).events;
        expect(loaded).toHaveLength(1);
        expect(loaded[0]).toMatchObject({ sourceId: source, cost, costSource: 'recorded', missingPricing: false });
      }
    });
    it.each([undefined, -1, 'invalid'])(`${source} does not export missing or invalid fees (%s) as recorded`, cost => {
      writeNative(source, cost);
      const bundle = exportTokenData({ home });
      expect(bundle.events[0].recordedCost).toBeUndefined();
      const storePath = join(home, 'receiver.db');
      const context: ImportContext = { events: [], pricing: new Map(), aliases: {} };
      const preview = previewImport(bundle, {}, { storePath, context });
      expect(preview.models[0].priced).toBe(false);
      commitImport(preview.previewId, { storePath, context });
      const loaded = loadImportedEvents([], new Map(), {}, storePath).events[0];
      expect(loaded).toMatchObject({ cost: 0, costSource: 'calculated', missingPricing: true });
      const repriced = loadImportedEvents([], new Map([[model, { inputPerMillion: 1, outputPerMillion: 2, cacheReadPerMillion: .1 }]]), {}, storePath).events[0];
      expect(repriced.missingPricing).toBe(false);
      expect(repriced.costSource).toBe('calculated');
      expect(repriced.cost).toBeCloseTo(.000141);
    });
    it(`${source} exports calculated rates without freezing their estimated fee as recorded`, () => {
      writeNative(source, undefined);
      mkdirSync(join(home, '.aiusage'), { recursive: true });
      writeFileSync(join(home, '.aiusage', 'config.json'), JSON.stringify({ priceOverrides: {
        [model]: { input: 1, output: 2, cacheRead: .1, cacheWrite: 0 },
      } }));
      const bundle = exportTokenData({ home });
      expect(bundle.events[0].recordedCost).toBeUndefined();
      expect(bundle.prices[model]).toMatchObject({ inputPerMillion: 1, outputPerMillion: 2, cacheReadPerMillion: .1 });
      const storePath = join(home, 'receiver.db');
      const context: ImportContext = { events: [], pricing: new Map(), aliases: {} };
      commitImport(previewImport(bundle, {}, { storePath, context }).previewId, { storePath, context });
      expect(loadImportedEvents([], new Map(), {}, storePath).events[0].cost).toBeCloseTo(.000141);
      const receiverPrices = new Map([[model, { inputPerMillion: 3, outputPerMillion: 4, cacheReadPerMillion: .2 }]]);
      expect(loadImportedEvents([], receiverPrices, {}, storePath).events[0]).toMatchObject({ costSource: 'calculated', missingPricing: false });
      expect(loadImportedEvents([], receiverPrices, {}, storePath).events[0].cost).toBeCloseTo(.000382);
    });
  }
  it('keeps Codex exports free of a recorded fee field', () => {
    const directory = join(home, '.codex', 'sessions'); mkdirSync(directory, { recursive: true });
    const rows = [{ type: 'session_meta', payload: { id: 'codex-fixture', cwd: 'D:/fixture/project' } },
      { type: 'turn_context', payload: { model } }, { type: 'event_msg', timestamp: new Date(at).toISOString(), costUSD: .2,
        payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 100, output_tokens: 20 } } } }];
    writeFileSync(join(directory, 'rollout.jsonl'), rows.map(row => JSON.stringify(row)).join('\n'));
    const bundle = exportTokenData({ home });
    expect(bundle.events).toHaveLength(1);
    expect(bundle.events[0].source).toBe('codex');
    expect(bundle.events[0].recordedCost).toBeUndefined();
  });
  it.each(['claudeCode', 'opencode', 'antigravity', 'zcode', 'geminiCli'] as const)('marks calculated %s costs without treating them as recorded', sourceId => {
    const input = { sourceId, sourceLabel: sourceId, sessionId: 'fixture', modelName: model, timestampMs: at, inputTokens: 100, outputTokens: 20 };
    const pricing = new Map([[model, { inputPerMillion: 1, outputPerMillion: 2 }]]);
    expect(usageEvent(input, pricing)).toMatchObject({ costSource: 'calculated', missingPricing: false });
    expect(usageEvent({ ...input, recordedCost: .2 }, pricing)).toMatchObject({ costSource: 'recorded', cost: .2, missingPricing: false });
  });
});
