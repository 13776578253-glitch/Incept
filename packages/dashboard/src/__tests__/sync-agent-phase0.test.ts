import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TRANSFER_SOURCES, type TransferSource } from '../domain';
import { canonicalTransferId, hasWeakIdentity, identityIndex } from '../adapters/local/imports/matching';
import { recordHash } from '../adapters/local/imports/identity';
import { previewImport, commitImport, importHistory, rollbackImport } from '../adapters/local/imports/service';
import { loadImportedEvents } from '../adapters/local/imports/layer';
import { collectImportContext } from '../adapters/local/imports/context';
import { readActiveBatches } from '../adapters/local/imports/store';
import { summarizeUsageEvents } from '../adapters/local/aggregation/summarize';
import { PHASE0_AT, PHASE0_NOW, phase0Context, phase0Export, phase0Import, phase0Rehash, phase0Summary,
  writePhase0Home, writePhase0Index, writePhase0Pricing, writePhase0Source } from './fixtures/sync-agent-phase0';

let home: string, path: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'sync-agent-phase0-')); path = join(home, 'isolated-receiver.db'); });
afterEach(() => {
  const target = resolve(home), parent = resolve(tmpdir());
  if (!target.startsWith(parent + '\\sync-agent-phase0-') && !target.startsWith(parent + '/sync-agent-phase0-')) throw new Error('Unsafe fixture cleanup');
  rmSync(target, { recursive: true, force: true });
});
const options = () => ({ storePath: path, context: phase0Context() });
const imported = () => loadImportedEvents([], new Map(), {}, path).events;
const one = (source: TransferSource) => phase0Export(home).events.find(event => event.source === source)!;

describe('Phase 0 characterization and Phase 1 admission gate', () => {
  it('runs all supported native collectors repeatedly, with stable unchanged IDs and no duplicate import after 100 commit retries', () => {
    writePhase0Home(home);
    const first = phase0Export(home), second = phase0Export(home);
    expect(first.warnings).toEqual([]);
    expect(new Set(first.events.map(event => event.source))).toEqual(new Set(TRANSFER_SOURCES));
    expect(first.events).toEqual(second.events);
    const preview = previewImport(first, {}, options());
    const receipt = commitImport(preview.previewId, options());
    for (let i = 0; i < 100; i++) expect(commitImport(preview.previewId, options())).toEqual(receipt);
    expect(previewImport(second, {}, options())).toMatchObject({ added: 0, duplicateImported: TRANSFER_SOURCES.length, conflicts: 0 });
    expect(importHistory(path)).toHaveLength(1);
    expect(imported()).toHaveLength(TRANSFER_SOURCES.length);
  });

  it.each(TRANSFER_SOURCES)('keeps a late old %s event in the next full scan', source => {
    writePhase0Pricing(home); writePhase0Source(home, source);
    const first = one(source);
    // Append an old observation after the first scan, including native SQLite rows.
    if (['opencode', 'zcode'].includes(source)) {
      const database = new DatabaseSync(join(home, source === 'opencode' ? '.local/share/opencode/opencode.db' : '.zcode/cli/db/db.sqlite'));
      try {
        const at = PHASE0_NOW - 8 * 86_400_000;
        if (source === 'opencode') database.prepare('INSERT INTO message VALUES (?,?,?,?)').run('late', 'phase0-opencode', at,
          JSON.stringify({ id: 'late', role: 'assistant', modelID: 'phase0-fixture-model', tokens: { input: 100, output: 20, cache: { read: 10 } } }));
        else database.prepare('INSERT INTO model_usage VALUES (?,?,?,?,?,?,?,?)').run('late', 'phase0-zcode', 'phase0-fixture-model', 'completed', at, 100, 20, 10);
      } finally { database.close(); }
    } else writePhase0Source(home, source, { at: PHASE0_NOW - 8 * 86_400_000, session: 'late-old', id: 'late' });
    const after = phase0Export(home);
    expect(after.events.map(event => event.eventId)).toContain(first.eventId);
    expect(after.events.some(event => event.timestampMs === PHASE0_NOW - 8 * 86_400_000)).toBe(true);
  });

  it('reproduces literal append of a week-old record after the recent CommandCode record', () => {
    writePhase0Pricing(home); writePhase0Source(home, 'commandcode');
    const file = join(home, '.commandcode/projects/phase0-project/phase0-commandcode.jsonl');
    appendFileSync(file, JSON.stringify({ id: 'late', timestamp: PHASE0_NOW - 8 * 86_400_000, model: 'phase0-fixture-model', usage: { inputTokens: 110, outputTokens: 20, cacheReadTokens: 10 } }) + '\n');
    expect(phase0Export(home).events).toHaveLength(2);
  });

  it.each(TRANSFER_SOURCES)('characterizes %s token correction identity and old-import classification', source => {
    writePhase0Pricing(home); writePhase0Source(home, source);
    const before = one(source); phase0Import(phase0Export(home), path);
    writePhase0Source(home, source, { input: 120 });
    const after = one(source), preview = previewImport(phase0Export(home), {}, options());
    if (source === 'codex') {
      // BLOCKER: counter-derived ID is considered strong, so both versions can be committed.
      expect(after.eventId === before.eventId).toBe(false); expect(hasWeakIdentity(before)).toBe(false);
      expect(preview).toMatchObject({ added: 1, conflicts: 0 });
      commitImport(preview.previewId, options());
      expect(imported().reduce((sum, event) => sum + event.inputTokens, 0)).toBe(220); // correct replacement would be 120
    } else {
      expect(after.eventId).toBe(before.eventId);
      expect(preview).toMatchObject({ added: 0, conflicts: 1 });
      expect(() => commitImport(preview.previewId, options())).toThrow('Conflicting usage');
    }
  });

  it.each(TRANSFER_SOURCES)('characterizes %s model corrections against immutable v1 imports', source => {
    writePhase0Pricing(home); writePhase0Source(home, source); const before = one(source);
    phase0Import(phase0Export(home), path);
    writePhase0Source(home, source, { model: 'phase0-corrected-model' });
    const after = one(source); expect(after.eventId).toBe(before.eventId);
    expect(recordHash(after) === recordHash(before)).toBe(false);
    expect(previewImport(phase0Export(home), {}, options()).conflicts).toBe(1);
  });

  it.each(['claudeCode', 'geminiCli', 'antigravity', 'zcode'] as const)('reproduces weak %s correction losing its match', source => {
    writePhase0Pricing(home); writePhase0Source(home, source, { withoutId: true }); const before = one(source);
    expect(hasWeakIdentity(before)).toBe(true); phase0Import(phase0Export(home), path);
    writePhase0Source(home, source, { withoutId: true, input: 120 }); const after = one(source);
    expect(canonicalTransferId(before) === canonicalTransferId(after)).toBe(false);
    expect(previewImport(phase0Export(home), {}, options())).toMatchObject({ added: 1, conflicts: 0 });
  });

  it('reproduces no-ID CommandCode line identity changing when rotation prepends a line', () => {
    writePhase0Pricing(home); writePhase0Source(home, 'commandcode', { withoutId: true }); const before = one('commandcode');
    const file = join(home, '.commandcode/projects/phase0-project/phase0-commandcode.jsonl');
    writeFileSync(file, '{}\n' + readFileSync(file, 'utf8'));
    expect(one('commandcode').eventId === before.eventId).toBe(false);
  });

  it('retains Codex identity across archive copy and rename when session_meta is present', () => {
    writePhase0Pricing(home); writePhase0Source(home, 'codex'); const before = phase0Export(home);
    const file = join(home, '.codex/sessions/phase0-codex.jsonl'), archived = join(home, '.codex/archived_sessions/renamed.jsonl');
    mkdirSync(dirname(archived), { recursive: true }); copyFileSync(file, archived);
    expect(phase0Export(home).events).toEqual(before.events);
    rmSync(file); expect(phase0Export(home).events).toEqual(before.events);
    renameSync(archived, join(dirname(archived), 'rotated.jsonl')); expect(phase0Export(home).events).toEqual(before.events);
  });

  it('bridges index/native representations once and blocks an ambiguous one-to-two bridge', () => {
    writePhase0Pricing(home); writePhase0Index(home, 'claudeCode'); const weak = one('claudeCode');
    expect(hasWeakIdentity(weak)).toBe(true); phase0Import(phase0Export(home), path);
    writePhase0Source(home, 'claudeCode'); const raw = phase0Export(home);
    expect(raw.events).toHaveLength(1); expect(previewImport(raw, {}, options())).toMatchObject({ duplicateImported: 1, conflicts: 0 });
    const independent = { ...raw.events[0], eventId: 'f'.repeat(64) };
    const ambiguous = phase0Rehash({ ...raw, events: [...raw.events, independent] });
    expect(previewImport(ambiguous, {}, options()).conflicts).toBe(2);
    expect(identityIndex([{ event: weak }], name => name).find(independent).matches).toHaveLength(1);
  });

  it.each(['commandcode', 'claudeCode', 'opencode'] as const)('detects %s recorded cost correction and rejects v1 overwrite', source => {
    writePhase0Pricing(home); writePhase0Source(home, source, { cost: .2 }); const before = one(source);
    phase0Import(phase0Export(home), path); writePhase0Source(home, source, { cost: .3 }); const after = one(source);
    expect(after.eventId).toBe(before.eventId); expect(recordHash(after) === recordHash(before)).toBe(false);
    expect(previewImport(phase0Export(home), {}, options()).conflicts).toBe(1);
    expect(imported()[0].cost).toBe(.2);
  });

  it('reproduces project/title and captured-rate changes invisible to recordHash', () => {
    writePhase0Pricing(home); writePhase0Source(home, 'geminiCli'); const before = one('geminiCli');
    expect(recordHash({ ...before, projectKey: 'moved', projectName: 'Renamed', sessionTitle: 'Changed' })).toBe(recordHash(before));
    const first = phase0Export(home); phase0Import(first, path);
    writePhase0Pricing(home, 2); const second = phase0Export(home);
    expect(JSON.stringify(second.prices) === JSON.stringify(first.prices)).toBe(false);
    expect(second.events.map(event => recordHash(event))).toEqual(first.events.map(event => recordHash(event)));
    phase0Import(second, path);
    // Oldest event supplies captured rates even while latest catalog is inherited separately.
    expect(imported()[0].cost).toBeCloseTo(.000145, 10);
    expect(phase0Summary(home, path, 'all').costs.totalCost).toBeCloseTo(.000145, 10);
  });

  it('keeps historical events after a smaller scan and preserves rollback provenance', () => {
    writePhase0Home(home); const first = phase0Export(home), receipt = phase0Import(first, path);
    const subset = phase0Rehash({ ...first, exportId: randomUUID(), events: first.events.slice(0, 1) });
    const second = phase0Import(subset, path);
    expect(imported()).toHaveLength(TRANSFER_SOURCES.length);
    rollbackImport(receipt.id, path); expect(imported()).toHaveLength(1);
    rollbackImport(second.id, path); expect(imported()).toHaveLength(0);
  });

  it('reproduces global exact-ID conflicts across device ownership and distinct source names', () => {
    writePhase0Pricing(home); writePhase0Source(home, 'claudeCode'); const first = phase0Export(home);
    phase0Import(first, path);
    const anotherDevice = phase0Rehash({ ...first, exportId: randomUUID(), device: { ...first.device, id: '00000000-0000-4000-8000-000000000002' } });
    expect(previewImport(anotherDevice, {}, options()).conflicts).toBe(1);
    const sourceCollision = { ...first.events[0], source: 'geminiCli' as const };
    expect(identityIndex([{ event: first.events[0] }], name => name).find(sourceCollision).matches).toHaveLength(1);
  });

  it('records exact 7d/30d/all token, cost and session baselines through native, repeated import and rollback', () => {
    writePhase0Home(home);
    const base = phase0Export(home);
    // Retain supported source sessions, three observations each: recent, 15 days ago, 45 days ago.
    const events = [PHASE0_AT, PHASE0_NOW - 15 * 86_400_000, PHASE0_NOW - 45 * 86_400_000].flatMap((at, group) =>
      base.events.map(event => ({ ...event, eventId: (group + 1).toString().repeat(64).slice(0, 16) + event.eventId.slice(16), timestampMs: at })));
    const bundle = phase0Rehash({ ...base, events });
    const first = phase0Import(bundle, path), second = phase0Import(phase0Rehash({ ...bundle, exportId: randomUUID() }), path);
    expect(readActiveBatches(path)).toHaveLength(2);
    for (const [range, groups] of [['7d', 1], ['30d', 2], ['all', 3]] as const) {
      const summary = phase0Summary(home, path, range);
      expect(summary.totals).toMatchObject({ inputTokens: 100 * TRANSFER_SOURCES.length * groups, outputTokens: 20 * TRANSFER_SOURCES.length * groups, cacheReadTokens: 10 * TRANSFER_SOURCES.length * groups,
        cacheCreationTokens: 0, reasoningTokens: 0, totalTokens: 130 * TRANSFER_SOURCES.length * groups, sessionCount: TRANSFER_SOURCES.length });
      expect(summary.costs.totalCost).toBeCloseTo(.000145 * TRANSFER_SOURCES.length * groups, 10);
    }
    rollbackImport(second.id, path);
    expect(phase0Summary(home, path, 'all').totals.totalTokens).toBe(390 * TRANSFER_SOURCES.length);
    rollbackImport(first.id, path); expect(phase0Summary(home, path, 'all').totals.totalTokens).toBe(0);
  });

  it('matches native/import overlap without changing the supported-source baseline', () => {
    writePhase0Home(home); const bundle = phase0Export(home), native = collectImportContext(home);
    expect(native.events).toHaveLength(TRANSFER_SOURCES.length);
    const summary = summarizeUsageEvents(native.events, home, native.pricing, PHASE0_AT);
    expect(summary.totals).toMatchObject({ inputTokens: 100 * TRANSFER_SOURCES.length, outputTokens: 20 * TRANSFER_SOURCES.length, cacheReadTokens: 10 * TRANSFER_SOURCES.length, totalTokens: 130 * TRANSFER_SOURCES.length, sessionCount: TRANSFER_SOURCES.length });
    expect(summary.costs.totalCost).toBeCloseTo(.000145 * TRANSFER_SOURCES.length, 10);
    expect(previewImport(bundle, {}, { storePath: path, context: native })).toMatchObject({ added: 0, duplicateLocal: TRANSFER_SOURCES.length, conflicts: 0 });
    phase0Import(bundle, path);
    expect(loadImportedEvents(native.events, native.pricing, {}, path).events).toHaveLength(0);
  });
});
