import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as files from '../adapters/local/files';
import { collectCodexEvents } from '../adapters/local/collectors/codex';
import { collectIndexedAgentEvents } from '../adapters/local/collectors/aiusage';
import { exportTokenData } from '../adapters/local/imports/exporter';
import type { RawUsageEvent } from '../adapters/local/types';

let home = '';
const pricing = new Map([['priced-model', { inputPerMillion: 2, outputPerMillion: 10, cacheReadPerMillion: .2 }]]);
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'dashboard-usage-audit-')); });
afterEach(() => {
  vi.restoreAllMocks();
  const target = resolve(home);
  if (!target.startsWith(join(resolve(tmpdir()), 'dashboard-usage-audit-'))) throw new Error('Unsafe fixture cleanup');
  rmSync(target, { recursive: true, force: true });
});

// Fixtures deliberately use filenames unrelated to the session_meta identity.
function rollout(name: string, entries: object[], archive = false, sessionId = 'shared-session') {
  const dir = join(home, '.codex', archive ? 'archived_sessions' : 'sessions');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name + '.jsonl'), [
    { type: 'session_meta', payload: { id: sessionId } },
    { type: 'turn_context', payload: { model: 'priced-model' } }, ...entries,
  ].map(value => JSON.stringify(value)).join('\n'));
}
function count(minute: number, total: Record<string, number>, last?: Record<string, number>) {
  return { timestamp: `2026-10-14T10:${String(minute).padStart(2, '0')}:00Z`, type: 'event_msg',
    payload: { type: 'token_count', info: { total_token_usage: total, last_token_usage: last } } };
}
const usage = (input: number, output: number, cache = 0, reasoning = 0) => ({ input_tokens: input,
  output_tokens: output, cached_input_tokens: cache, reasoning_output_tokens: reasoning });
const total = (events: RawUsageEvent[]) => events.reduce((sum, event) => sum + event.inputTokens
  + event.outputTokens + event.cacheReadTokens + event.cacheCreationTokens + event.reasoningTokens, 0);
const collect = () => collectCodexEvents(home, pricing, new Set());

it('shares cumulative watermarks across resumed files regardless of scan order and repeated collection', () => {
  rollout('z-parent', [count(0, usage(100, 20, 60, 5))]);
  rollout('a-resume_original-id_new-rollout-id', [count(1, usage(150, 30, 90, 8)), count(2, usage(170, 34, 100, 9))]);
  const first = collect();
  expect(first.events.map(event => total([event]))).toEqual([120, 60, 24]);
  expect(total(first.events)).toBe(204);
  const walk = files.walkFiles;
  vi.spyOn(files, 'walkFiles').mockImplementation((...args) => walk(...args).reverse());
  expect(collect().events).toEqual(first.events);
  expect(collect().events).toEqual(first.events);
});

it('orders overlapping file histories by event time and removes archive copies before differencing', () => {
  const parent = [count(0, usage(100, 20)), count(2, usage(200, 40))];
  rollout('parent', parent);
  rollout('copy', parent, true);
  rollout('resume', [count(1, usage(150, 30)), count(3, usage(210, 42))]);
  expect(collect().events.map(event => total([event]))).toEqual([120, 60, 60, 12]);
  expect(total(collect().events)).toBe(252);
  expect(collect().parsedFiles.size).toBe(3);
});

it('uses only available last usage on reset and resumes differences from the new epoch', () => {
  rollout('reset', [count(0, usage(100, 20, 60, 5)), count(1, usage(40, 8, 20, 2), { input_tokens: 7, output_tokens: 3 }),
    count(2, usage(50, 10, 25, 3))]);
  const events = collect().events;
  expect(events[1]).toMatchObject({ inputTokens: 7, outputTokens: 3, cacheReadTokens: 0, reasoningTokens: 0 });
  expect(total(events)).toBe(142);
  rollout('missing-last', [count(0, usage(100, 20)), count(1, usage(40, 8)), count(2, usage(50, 10))], false, 'another-session');
  expect(total(collect().events.filter(event => event.sessionId === 'another-session'))).toBe(132);
});

it('does not subtract an unrelated session or invent a missing parent baseline', () => {
  rollout('parent', [count(0, usage(100, 20))]);
  rollout('fork', [count(1, usage(150, 30))], false, 'new-session');
  expect(total(collect().events)).toBe(300);
});

it('keeps interleaved reset streams in separate counter epochs instead of rebilling large totals', () => {
  rollout('parent', [count(0, usage(1000, 200)), count(2, usage(1010, 202)), count(4, usage(1020, 204))]);
  rollout('reset-resume', [count(1, usage(40, 8), usage(5, 1)), count(3, usage(50, 10)), count(5, usage(60, 12))]);
  expect(collect().events.map(event => total([event]))).toEqual([1200, 6, 12, 12, 12, 12]);
  expect(total(collect().events)).toBe(1254);
});

it('resumes the matching counter epoch even while another reset stream is active', () => {
  rollout('parent', [count(0, usage(1000, 200)), count(2, usage(1010, 202))]);
  rollout('reset', [count(1, usage(40, 8), usage(5, 1)), count(3, usage(50, 10))]);
  rollout('parent-resume', [count(4, usage(1020, 204))]);
  rollout('reset-resume', [count(5, usage(60, 12))]);
  expect(collect().events.map(event => total([event]))).toEqual([1200, 6, 12, 12, 12, 12]);
});

it('still deduplicates archive copies without event timestamps', () => {
  const entry = { type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: usage(100, 20) } } };
  rollout('original', [entry]); rollout('archived-copy', [entry], true);
  expect(total(collect().events)).toBe(120);
});

it('keeps distinct same-millisecond increments exportable without eventId conflicts', () => {
  rollout('same-time', [count(0, usage(100, 20)), count(0, usage(150, 30))]);
  const events = collect().events;
  expect(total(events)).toBe(180);
  expect(new Set(events.map(event => event.eventId)).size).toBe(2);
  const bundle = exportTokenData({ home, deviceId: '62fda0a5-f89b-4baf-93df-d69881b61002', label: 'Fixture' });
  expect(bundle.events).toHaveLength(2);
});

function indexedDb() {
  const dir = join(home, '.aiusage'); mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, 'cache.db'));
  db.exec('CREATE TABLE records (ts INTEGER, tool TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER, cache_write_tokens INTEGER, thinking_tokens INTEGER, cost REAL, session_id TEXT, source_file TEXT, cwd TEXT)');
  return db;
}

it('recomputes Codex index costs using exclusive tokens while retaining other recorded costs', () => {
  const db = indexedDb(), insert = db.prepare('INSERT INTO records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const ts = Date.parse('2026-09-26T00:00:00Z');
  insert.run(ts, 'codex', 'priced-model', 1_000_000, 100_000, 800_000, 0, 20_000, 3.16, 'codex', '', '');
  insert.run(ts, 'gemini', 'priced-model', 200_000, 80_000, 800_000, 0, 20_000, 7.77, 'gemini', '', '');
  db.close();
  const events = collectIndexedAgentEvents(home, pricing).events;
  expect(events[0]).toMatchObject({ inputTokens: 200_000, outputTokens: 80_000, reasoningTokens: 20_000,
    cacheReadTokens: 800_000, cost: 1.56, missingPricing: false, costSource: 'calculated' });
  expect(events[1]).toMatchObject({ cost: 7.77, missingPricing: false, costSource: 'recorded' });
});

it('excludes recorded Codex cost while retaining tokens when required rates are incomplete', () => {
  const db = indexedDb();
  db.prepare('INSERT INTO records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(Date.parse('2026-09-26T00:00:00Z'), 'codex', 'partial', 100, 20, 60, 0, 0, 3, 'session', '', '');
  db.close();
  const events = collectIndexedAgentEvents(home, new Map([['partial', { inputPerMillion: 2, outputPerMillion: 10 }]])).events;
  expect(events[0]).toMatchObject({ cost: 0, missingPricing: true, costSource: 'calculated', inputTokens: 40, cacheReadTokens: 60 });
});

it('deduplicates identical indexed rows without dropping other sessions, timestamps or token counts', () => {
  const db = indexedDb(), insert = db.prepare('INSERT INTO records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const ts = Date.parse('2026-09-26T00:00:00Z');
  const row = (time: number, session: string, input: number, file: string) =>
    insert.run(time, 'codex', 'priced-model', input, 20, 60, 0, 0, .1, session, file, '');
  row(ts, 'session', 100, 'original'); row(ts, 'session', 100, 'copy');
  row(ts + 1, 'session', 100, 'original'); row(ts, 'other', 100, 'original'); row(ts, 'session', 101, 'original');
  db.close();
  const result = collectIndexedAgentEvents(home, pricing);
  expect(result.events).toHaveLength(4);
  expect(total(result.events)).toBe(481);
  expect(result.ingestedFiles.size).toBe(2);
});
