import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransferBundle, TransferEvent } from '../domain';
import { hash } from '../adapters/local/imports/identity';
import { validateBundle } from '../adapters/local/imports/validation';
import { exportTokenData } from '../adapters/local/imports/exporter';
import { previewImport, commitImport, rollbackImport, importHistory } from '../adapters/local/imports/service';
import { loadImportedEvents } from '../adapters/local/imports/layer';
import { summarizeUsageEvents } from '../adapters/local/aggregation/summarize';
import type { ImportContext } from '../adapters/local/imports/context';
import type { RawUsageEvent } from '../adapters/local/types';

let home: string, storePath: string;
const device = { id: randomUUID(), label: 'Second computer', platform: 'win32' };
const at = Date.parse('2025-10-10T01:00:00Z');
const event = (id = 'one', patch: Partial<TransferEvent> = {}): TransferEvent => ({ eventId: hash(id), source: 'codex', sessionId: 'session-one',
  timestampMs: at, modelName: 'remote-model', projectKey: 'remote-project', projectName: 'Shared project', workspacePath: 'E:\\Shared',
  inputTokens: 100, outputTokens: 20, cacheReadTokens: 60, cacheCreationTokens: 0, reasoningTokens: 5, ...patch });
function bundle(events = [event()], patch: Partial<TransferBundle> = {}): TransferBundle {
  const payload = { format: 'incept-token-transfer' as const, version: 1 as const, exportId: randomUUID(), device,
    exportedAt: new Date().toISOString(), events, prices: {}, warnings: [], ...patch };
  const { checksum: _old, ...data } = payload as TransferBundle;
  return { ...data, checksum: hash(data) };
}
const context = (events: RawUsageEvent[] = []): ImportContext => ({ events, pricing: new Map(), aliases: {} });
function native(row = event()): RawUsageEvent {
  return { ...row, sourceId: row.source, sourceLabel: 'Codex CLI', dateKey: '2025-10-10', monthKey: '2025-10', cost: 0, missingPricing: true };
}
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'dashboard-import-')); storePath = join(home, 'imports.db'); });
afterEach(() => {
  vi.useRealTimers(); vi.unstubAllEnvs();
  if (!resolve(home).startsWith(join(resolve(tmpdir()), 'dashboard-import-'))) throw new Error('Unsafe test cleanup');
  rmSync(home, { recursive: true, force: true });
});
describe('validated cross-device imports', () => {
  it('persists batches across fresh reads, commits idempotently, and rolls back without deleting history', () => {
    const options = { storePath, context: context() }, input = bundle();
    const preview = previewImport(input, {}, options); expect(preview.added).toBe(1); expect(preview.addedTokens).toBe(185);
    const receipt = commitImport(preview.previewId, options);
    expect(commitImport(preview.previewId, options).id).toBe(receipt.id);
    expect(importHistory(storePath)).toHaveLength(1);
    expect(loadImportedEvents([], new Map(), {}, storePath).events).toHaveLength(1);
    const rolled = rollbackImport(receipt.id, storePath);
    expect(rolled.status).toBe('rolled_back'); expect(rolled.rolledBackAt).toBeTruthy();
    expect(loadImportedEvents([], new Map(), {}, storePath).events).toHaveLength(0);
    expect(importHistory(storePath)[0].id).toBe(receipt.id);
    expect(rollbackImport(receipt.id, storePath)).toEqual(rolled);
    expect(commitImport(previewImport(input, {}, options).previewId, options).id).not.toBe(receipt.id);
  });
  it('deduplicates repeated full snapshots and keeps shared records when an earlier batch is rolled back', () => {
    const options = { storePath, context: context() };
    const first = commitImport(previewImport(bundle(), {}, options).previewId, options);
    const next = previewImport(bundle([event(), event('two', { timestampMs: at + 1000 })]), {}, options);
    expect(next).toMatchObject({ added: 1, duplicateImported: 1, addedTokens: 185 });
    const second = commitImport(next.previewId, options);
    rollbackImport(first.id, storePath);
    expect(loadImportedEvents([], new Map(), {}, storePath).events).toHaveLength(2);
    rollbackImport(second.id, storePath);
    expect(loadImportedEvents([], new Map(), {}, storePath).events).toHaveLength(0);
  });
  it('matches copied native records with aliases, and native logs always take precedence', () => {
    const ctx = context([native(event('one', { modelName: 'canonical-model' }))]); ctx.aliases = { 'remote-model': 'canonical-model' };
    const options = { storePath, context: ctx };
    const preview = previewImport(bundle(), {}, options);
    expect(preview).toMatchObject({ added: 0, duplicateLocal: 1, conflicts: 0 });
    commitImport(preview.previewId, options);
    expect(loadImportedEvents(ctx.events, ctx.pricing, ctx.aliases, storePath).events).toHaveLength(0);
    expect(ctx.events).toHaveLength(1);
  });
  it('replaces an exactly matching historical index with imported raw usage without doubling tokens', () => {
    const indexed = native(); delete indexed.eventId;
    const ctx = context([indexed]), options = { storePath, context: ctx };
    const preview = previewImport(bundle(), {}, options);
    expect(preview).toMatchObject({ added: 0, duplicateLocal: 1 });
    commitImport(preview.previewId, options);
    const output = loadImportedEvents(ctx.events, ctx.pricing, {}, storePath);
    expect(output.events).toHaveLength(1); expect(output.replacedIndexed.has(indexed)).toBe(true);
    const remaining = ctx.events.filter(event => !output.replacedIndexed.has(event));
    expect(summarizeUsageEvents([...remaining, ...output.events], home, output.pricing, at).totals.totalTokens).toBe(185);
    rollbackImport(importHistory(storePath)[0].id, storePath);
    expect(loadImportedEvents(ctx.events, ctx.pricing, {}, storePath).replacedIndexed.size).toBe(0);
  });
  it('blocks conflicting usage and invalidates a preview when relevant active records change', () => {
    const options = { storePath, context: context() };
    const pending = previewImport(bundle(), {}, options);
    commitImport(previewImport(bundle(), {}, options).previewId, options);
    expect(() => commitImport(pending.previewId, options)).toThrow('Matching data changed');
    const conflicting = previewImport(bundle([event('one', { outputTokens: 21 })]), {}, options);
    expect(conflicting.conflicts).toBe(1);
    expect(() => commitImport(conflicting.previewId, options)).toThrow('Conflicting usage');
    expect(importHistory(storePath)).toHaveLength(1);
  });
  it('rejects changed recorded fees for an existing request instead of silently keeping an obsolete cost', () => {
    const options = { storePath, context: context() };
    const first = bundle([event('cc', { source: 'commandcode', recordedCost: .1 })]);
    commitImport(previewImport(first, {}, options).previewId, options);
    expect(previewImport(bundle([event('cc', { source: 'commandcode', recordedCost: .2 })]), {}, options).conflicts).toBe(1);
  });
  it('requires explicit project mapping and prevents a repeated event from being remapped silently', () => {
    const ctx = context([native(event('local', { projectKey: 'local-project', projectName: 'Shared project' }))]);
    const options = { storePath, context: ctx };
    const preview = previewImport(bundle(), {}, options);
    expect(preview.projects[0].suggestedTarget).toBe('local-project');
    expect(() => previewImport(bundle(), { 'remote-project': 'missing' }, options)).toThrow('unavailable');
    commitImport(preview.previewId, options);
    const imported = loadImportedEvents(ctx.events, ctx.pricing, {}, storePath).events[0];
    expect(imported.projectKey).toContain(device.id); expect(imported.projectKey).not.toBe('local-project');
    expect(previewImport(bundle(), { 'remote-project': 'local-project' }, options).conflicts).toBe(1);
  });
  it('supports explicit local attribution while keeping independent device sessions separate', () => {
    const ctx = context([native(event('local', { projectKey: 'local-project' }))]), options = { storePath, context: ctx };
    commitImport(previewImport(bundle(), { 'remote-project': 'local-project' }, options).previewId, options);
    const imported = loadImportedEvents(ctx.events, ctx.pricing, {}, storePath).events;
    const data = summarizeUsageEvents([...ctx.events, ...imported], home, new Map(), at);
    expect(data.totals.sessionCount).toBe(2); expect(data.projects).toHaveLength(1);
    expect(new Set(data.sessions.map(session => session.sessionKey)).size).toBe(2);
    expect(data.sessions.some(session => session.deviceLabel === device.label)).toBe(true);
  });
  it('preserves recorded fees, falls back to captured rates and prefers receiver rates without mutating configuration', () => {
    const captured = { inputPerMillion: 1, outputPerMillion: 2, cacheReadPerMillion: .1 };
    const input = bundle([event(), event('cc', { source: 'commandcode', recordedCost: .5 })], { prices: { 'remote-model': captured } });
    const options = { storePath, context: context() };
    expect(previewImport(input, {}, options).models[0].priced).toBe(true);
    commitImport(previewImport(input, {}, options).previewId, options);
    const pricing = new Map([['remote-model', { ...captured, inputPerMillion: 3 }]]);
    const output = loadImportedEvents([], pricing, {}, storePath);
    expect(output.events[0].cost).toBeCloseTo(.000356); expect(output.events[1].cost).toBe(.5);
    expect(pricing.size).toBe(1);
    expect(loadImportedEvents([], new Map(), {}, storePath).events[0].cost).toBeCloseTo(.000156);
  });
  it('shares pricing across multiple batches so older batches without rates benefit from newer catalogs', () => {
    const captured = { inputPerMillion: 2, outputPerMillion: 10, cacheReadPerMillion: .2 };
    const oldBatch = bundle([event('old-event', { modelName: 'shared-model', sessionId: 'old-session' })], { prices: {} });
    const newBatch = bundle([event('new-event', { modelName: 'other-model', sessionId: 'new-session' })], { prices: { 'shared-model': captured } });
    const options = { storePath, context: context() };
    commitImport(previewImport(oldBatch, {}, options).previewId, options);
    commitImport(previewImport(newBatch, {}, options).previewId, options);
    const output = loadImportedEvents([], new Map(), {}, storePath);
    const oldEv = output.events.find(e => e.sessionId === 'old-session');
    expect(oldEv?.missingPricing).toBe(false);
    expect(oldEv?.cost).toBeGreaterThan(0);
  });
  it('rejects corruption, invalid counts, extra fields, repeated IDs and expired previews', () => {
    const valid = bundle(); expect(validateBundle(JSON.parse(JSON.stringify(valid)))).toEqual(valid);
    expect(() => validateBundle({ ...valid, events: [event('changed')] })).toThrow('Checksum mismatch');
    expect(() => validateBundle(bundle([event('one', { inputTokens: -1 })]))).toThrow('inputTokens');
    expect(() => validateBundle(bundle([event(), event()]))).toThrow('Repeated event');
    expect(() => validateBundle(bundle([event()], { secret: 'invalid' } as Partial<TransferBundle>))).toThrow('Unexpected transfer field');
    const options = { storePath, context: context() }, preview = previewImport(valid, {}, options);
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 31 * 60_000);
    expect(() => commitImport(preview.previewId, options)).toThrow('Preview expired');
    expect(importHistory(storePath)).toHaveLength(0);
  });
  it('exports raw Codex and CommandCode repeatedly with stable identities and sanitized fields', () => {
    const codex = join(home, '.codex', 'sessions'), cc = join(home, '.commandcode', 'projects', 'other-project');
    mkdirSync(codex, { recursive: true }); mkdirSync(cc, { recursive: true });
    const codexRows = [ { type: 'session_meta', payload: { id: 'native-session', cwd: 'E:/Shared' } },
      { type: 'turn_context', payload: { model: 'raw-model' } }, { timestamp: new Date(at).toISOString(), type: 'event_msg',
        payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 60, output_tokens: 20, reasoning_output_tokens: 5 } } } } ];
    writeFileSync(join(codex, 'rollout.jsonl'), codexRows.map(row => JSON.stringify(row)).join('\n'));
    const row = (id: string) => JSON.stringify({ id, timestamp: at, model: 'raw-cc', usage: { inputTokens: 100, cacheReadTokens: 50, outputTokens: 10, costUsd: .2 }, message: { content: 'PRIVATE BODY' } });
    const ccFile = join(cc, 'cc-session.jsonl'); writeFileSync(ccFile, row('cc-one') + '\n');
    const first = exportTokenData({ home });
    expect(first.events).toHaveLength(2); expect(JSON.stringify(first)).not.toContain('PRIVATE BODY');
    expect(first.events.find(event => event.source === 'commandcode')?.recordedCost).toBe(.2);
    appendFileSync(ccFile, row('cc-two') + '\n');
    const second = exportTokenData({ home }); expect(second.events).toHaveLength(3);
    expect(first.device.id).toBe(second.device.id);
    expect(second.events.map(event => event.eventId)).toEqual(expect.arrayContaining(first.events.map(event => event.eventId)));
    expect(JSON.parse(readFileSync(join(home, '.incept', 'token-device.json'), 'utf8')).id).toBe(first.device.id);
  });
});
