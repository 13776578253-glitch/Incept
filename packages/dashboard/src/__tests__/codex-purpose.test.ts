import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { CODEX_AUTO_REVIEW_MODEL, isCodexAutoReviewModel } from '../adapters/local/collectors/codex-purpose';
import { collectIndexedAgentEvents } from '../adapters/local/collectors/aiusage';
import { priceSyncRecord } from '../adapters/local/imports/sync/pricing';
import type { SyncBasis, SyncRecord, SyncScope } from '../domain/sync';

const scope: SyncScope = { deviceId: 'device', source: 'codex', sessionId: 'fixture', originId: 'origin' };
const record = (modelName: string): SyncRecord => ({ envelopeHash: '', event: {
  eventId: 'event', source: 'codex', sessionId: 'fixture', timestampMs: Date.parse('2026-10-19T00:00:00Z'),
  modelName, projectKey: 'project', projectName: 'Project', inputTokens: 80, cacheReadTokens: 20,
  outputTokens: 15, reasoningTokens: 5, cacheCreationTokens: 0,
} });
const basis = (rate: number): SyncBasis => ({ schedule: 'commandcode-peak-v1', aliases: {}, rates: Object.fromEntries(
  ['codex-auto-review', CODEX_AUTO_REVIEW_MODEL, 'ordinary-model'].map(name => [name, {
    inputPerMillion: rate, outputPerMillion: rate, cacheReadPerMillion: rate,
  }]),
) });

it('identifies only the two exact auto-review model names, ignoring case', () => {
  expect(isCodexAutoReviewModel('CODEX-AUTO-REVIEW')).toBe(true);
  expect(isCodexAutoReviewModel('Codex-Auto-Review-Unpriced')).toBe(true);
  for (const name of ['codex-auto-review-other', ' codex-auto-review', 'codex-auto-review\n', 'ordinary-model']) {
    expect(isCodexAutoReviewModel(name)).toBe(false);
  }
});

it.each([0, 2])('keeps review usage unpriced despite an old %s rate or recorded cost', rate => {
  for (const name of ['codex-auto-review', 'CODEX-AUTO-REVIEW-UNPRICED']) {
    const input = record(name); input.event.recordedCost = 99;
    const prices = basis(rate); prices.aliases[name] = 'ordinary-model';
    const result = priceSyncRecord(scope, input, prices, {}, 'Fixture');
    expect(result).toMatchObject({ modelName: CODEX_AUTO_REVIEW_MODEL, missingPricing: true,
      apiEquivalentCost: null, costSource: 'calculated', inputTokens: 80, cacheReadTokens: 20, outputTokens: 15, reasoningTokens: 5 });
    expect(result.cost).toBe(0); // Numeric storage placeholder; missingPricing and null distinguish unknown from free.
  }
});

it('continues pricing ordinary models normally', () => {
  const result = priceSyncRecord(scope, record('ordinary-model'), basis(2), {}, 'Fixture');
  expect(result.missingPricing).toBe(false);
  expect(result.apiEquivalentCost).toBeCloseTo(0.00024);
  expect(result.cost).toBeCloseTo(0.00024);
});

it('canonicalizes indexed review names without losing tokens or trusting indexed cost', () => {
  const home = mkdtempSync(join(tmpdir(), 'incept-codex-purpose-'));
  try {
    mkdirSync(join(home, '.aiusage'));
    const db = new DatabaseSync(join(home, '.aiusage', 'cache.db'));
    try {
      db.exec('CREATE TABLE records (ts INTEGER, tool TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER, cache_write_tokens INTEGER, thinking_tokens INTEGER, cost REAL, session_id TEXT, source_file TEXT, cwd TEXT)');
      const insert = db.prepare('INSERT INTO records VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
      for (const [index, model] of ['codex-auto-review', 'CODEX-AUTO-REVIEW-UNPRICED', 'ordinary-model'].entries()) {
        insert.run(Date.parse('2026-10-19T00:00:00Z') + index, 'codex', model, 100, 20, 20, 0, 5, 99, 'fixture-' + index, '', 'D:/fixture');
      }
    } finally { db.close(); }
    const result = collectIndexedAgentEvents(home, new Map(Object.entries(basis(2).rates)));
    expect(result.errors).toEqual([]);
    expect(result.events).toHaveLength(3);
    for (const event of result.events.slice(0, 2)) {
      expect(event).toMatchObject({ modelName: CODEX_AUTO_REVIEW_MODEL, missingPricing: true, cost: 0,
        costSource: 'calculated', inputTokens: 80, cacheReadTokens: 20, outputTokens: 15, reasoningTokens: 5 });
    }
    expect(result.events[2]).toMatchObject({ modelName: 'ordinary-model', missingPricing: false });
    expect(result.events[2].cost).toBeCloseTo(0.00024);
  } finally {
    if (!resolve(home).startsWith(join(resolve(tmpdir()), 'incept-codex-purpose-'))) throw new Error('Unsafe fixture cleanup');
    rmSync(home, { recursive: true, force: true });
  }
});
