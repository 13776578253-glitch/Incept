// Synthetic source-format fixtures. No user logs, credentials or real home paths.
import { mkdirSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { TRANSFER_SOURCES, dateWindow, type TransferBundle, type TransferSource, type UsageRange } from '../../domain';
import { exportTokenData } from '../../adapters/local/imports/exporter';
import { hash } from '../../adapters/local/imports/identity';
import { loadImportedEvents } from '../../adapters/local/imports/layer';
import { commitImport, previewImport } from '../../adapters/local/imports/service';
import { summarizeUsageEvents } from '../../adapters/local/aggregation/summarize';
import { applyCommandCodeQuota } from '../../adapters/local/pricing-schedule';

export const PHASE0_NOW = Date.parse('2026-10-16T12:00:00Z');
export const PHASE0_AT = Date.parse('2026-10-15T12:00:00Z');
export const PHASE0_DEVICE = '00000000-0000-4000-8000-000000000001';
export const PHASE0_MODEL = 'phase0-fixture-model';
export const PHASE0_PRICE = { inputPerMillion: 1, outputPerMillion: 2, cacheReadPerMillion: .5, cacheWritePerMillion: 3 };
export const phase0Context = () => ({ events: [], pricing: new Map(), aliases: {} });
export type SourceOptions = { input?: number; model?: string; at?: number; id?: string; withoutId?: boolean;
  cost?: number; count?: number; session?: string; cwd?: string };

function write(path: string, value: string) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); }
function database(path: string, action: (db: DatabaseSync) => void) {
  mkdirSync(dirname(path), { recursive: true }); const db = new DatabaseSync(path);
  try { action(db); } finally { db.close(); }
}
function varint(value: number) {
  const bytes: number[] = [];
  while (value >= 128) { bytes.push(value % 128 + 128); value = Math.floor(value / 128); }
  return Buffer.from([...bytes, value]);
}
function pb(...entries: Array<[number, number | string | Buffer]>) {
  return Buffer.concat(entries.flatMap(([field, value]) => {
    if (typeof value === 'number') return [varint(field * 8), varint(value)];
    const bytes = typeof value === 'string' ? Buffer.from(value) : value;
    return [varint(field * 8 + 2), varint(bytes.length), bytes];
  }));
}
export function writePhase0Pricing(home: string, input = 1) {
  write(join(home, '.aiusage', 'config.json'), JSON.stringify({ priceOverrides: {
    [PHASE0_MODEL]: { input, output: 2, cacheRead: .5, cacheWrite: 3 },
    'phase0-corrected-model': { input, output: 2, cacheRead: .5, cacheWrite: 3 },
  } }));
}
export function writePhase0Source(home: string, source: TransferSource, options: SourceOptions = {}) {
  const input = options.input ?? 100, model = options.model ?? PHASE0_MODEL;
  const session = options.session ?? 'phase0-' + source, cwd = options.cwd ?? 'D:/synthetic-project';
  const rows = Array.from({ length: options.count ?? 1 }, (_, i) => ({
    at: (options.at ?? PHASE0_AT) + i * 1000, id: options.withoutId ? undefined : (options.id ?? 'request') + '-' + i,
  }));
  if (source === 'codex') {
    write(join(home, '.codex', 'sessions', session + '.jsonl'), [
      { type: 'session_meta', payload: { id: session, cwd } }, { type: 'turn_context', payload: { model } },
      ...rows.map(({ at }, i) => ({ timestamp: new Date(at).toISOString(), type: 'event_msg', payload: {
        type: 'token_count', info: { total_token_usage: {
          input_tokens: (input + 10) * (i + 1), cached_input_tokens: 10 * (i + 1), output_tokens: 20 * (i + 1), reasoning_output_tokens: 0,
        }, last_token_usage: { input_tokens: input + 10, cached_input_tokens: 10, output_tokens: 20, reasoning_output_tokens: 0 } },
      } })),
    ].map(row => JSON.stringify(row)).join('\n') + '\n');
  } else if (source === 'commandcode') {
    write(join(home, '.commandcode', 'projects', 'phase0-project', session + '.jsonl'), rows.map(({ at, id }) => JSON.stringify({
      id, timestamp: at, model, usage: { inputTokens: input + 10, outputTokens: 20, cacheReadTokens: 10, costUsd: options.cost },
    })).join('\n') + '\n');
  } else if (source === 'claudeCode') {
    write(join(home, '.claude', 'projects', 'phase0-project', session + '.jsonl'), rows.map(({ at, id }) => JSON.stringify({
      type: 'assistant', sessionId: session, timestamp: new Date(at).toISOString(), cwd, costUSD: options.cost,
      message: { id, model, usage: { input_tokens: input, output_tokens: 20, cache_read_input_tokens: 10 } },
    })).join('\n') + '\n');
  } else if (source === 'deepseekHarness') {
    write(join(home, '.dsh', 'sessions', session, 'session.jsonl'), [
      { type: 'session', version: 4, id: session, cwd, createdAt: options.at ?? PHASE0_AT },
      ...rows.map(({ at, id }, i) => ({ type: 'assistant/message', seq: i + 1, time: at, data: {
        message: { role: 'assistant', id, source: { model } },
        usage: { inputTokens: input, outputTokens: 20, cacheReadTokens: 10, cacheWriteTokens: 0, totalTokens: input + 30 },
      } })),
    ].map(row => JSON.stringify(row)).join('\n') + '\n');
  } else if (source === 'geminiCli') {
    write(join(home, '.gemini', 'tmp', 'phase0-project', 'chats', 'session-' + session + '.json'), JSON.stringify({
      sessionId: session, messages: rows.map(({ at, id }) => ({ id, model, timestamp: new Date(at).toISOString(),
        tokens: { input: input + 10, output: 20, cached: 10 } })),
    }));
  } else if (source === 'opencode') {
    database(join(home, '.local', 'share', 'opencode', 'opencode.db'), db => {
      db.exec('CREATE TABLE IF NOT EXISTS session (id TEXT, title TEXT, directory TEXT); CREATE TABLE IF NOT EXISTS message (id TEXT, session_id TEXT, time_created INTEGER, data TEXT); DELETE FROM session; DELETE FROM message;');
      db.prepare('INSERT INTO session VALUES (?,?,?)').run(session, 'Synthetic session', cwd);
      const insert = db.prepare('INSERT INTO message VALUES (?,?,?,?)');
      db.exec('BEGIN');
      for (const { at, id } of rows) insert.run(id ?? randomUUID(), session, at, JSON.stringify({ id, role: 'assistant', modelID: model,
        cost: options.cost, tokens: { input, output: 20, cache: { read: 10 } } }));
      db.exec('COMMIT');
    });
  } else if (source === 'zcode') {
    database(join(home, '.zcode', 'cli', 'db', 'db.sqlite'), db => {
      db.exec('DROP TABLE IF EXISTS model_usage; DROP TABLE IF EXISTS session; CREATE TABLE session (id TEXT, title TEXT, directory TEXT);');
      db.exec(`CREATE TABLE model_usage (${options.withoutId ? '' : 'id TEXT,'} session_id TEXT, model_id TEXT, status TEXT, started_at INTEGER, input_tokens INTEGER, output_tokens INTEGER, cache_read_input_tokens INTEGER)`);
      db.prepare('INSERT INTO session VALUES (?,?,?)').run(session, 'Synthetic session', cwd);
      const insert = db.prepare(`INSERT INTO model_usage VALUES (${options.withoutId ? '?,?,?,?,?,?,?' : '?,?,?,?,?,?,?,?'})`);
      db.exec('BEGIN');
      for (const { at, id } of rows) insert.run(...(options.withoutId ? [] : [id!]), session, model, 'completed', at, input, 20, 10);
      db.exec('COMMIT');
    });
  } else if (source === 'antigravity') {
    database(join(home, '.gemini', 'antigravity', 'conversations', session + '.db'), db => {
      db.exec('CREATE TABLE IF NOT EXISTS gen_metadata (idx INTEGER, data BLOB); CREATE TABLE IF NOT EXISTS steps (idx INTEGER, metadata BLOB); CREATE TABLE IF NOT EXISTS trajectory_metadata_blob (data BLOB); DELETE FROM gen_metadata;');
      const insert = db.prepare('INSERT INTO gen_metadata VALUES (?,?)');
      db.exec('BEGIN');
      for (const [i, { at, id }] of rows.entries()) {
        const usage = pb([1, 9876], [2, input], [3, 20], [5, 10], ...(id ? [[11, id] as [number, string]] : []));
        insert.run(i, pb([1, pb([3, 9876], [19, model], [4, usage], [9, pb([4, pb([1, at / 1000])])])], [2, i]));
      }
      db.exec('COMMIT');
    });
  }
}
export function writePhase0Index(home: string, source: TransferSource, options: SourceOptions = {}) {
  database(join(home, '.aiusage', 'cache.db'), db => {
    db.exec('CREATE TABLE IF NOT EXISTS records(ts INTEGER,tool TEXT,model TEXT,input_tokens INTEGER,output_tokens INTEGER,cache_read_tokens INTEGER,cache_write_tokens INTEGER,thinking_tokens INTEGER,cost REAL,session_id TEXT,source_file TEXT,cwd TEXT); DELETE FROM records;');
    const tool = source === 'claudeCode' ? 'claude' : source === 'geminiCli' ? 'gemini' : source;
    db.prepare('INSERT INTO records VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(options.at ?? PHASE0_AT, tool,
      options.model ?? PHASE0_MODEL, (options.input ?? 100) + (source === 'codex' ? 10 : 0), 20, 10, 0, 0,
      options.cost ?? 0, options.session ?? 'phase0-' + source, 'D:/synthetic-index/source.jsonl', options.cwd ?? 'D:/synthetic-project');
  });
}
export function writePhase0Home(home: string, count = 1) {
  writePhase0Pricing(home);
  for (const source of TRANSFER_SOURCES) writePhase0Source(home, source, { count });
}
export function phase0Export(home: string) { return exportTokenData({ home, deviceId: PHASE0_DEVICE, label: 'Synthetic device' }); }
export function phase0Rehash(bundle: TransferBundle): TransferBundle { return { ...bundle, checksum: hash({ ...bundle, checksum: undefined }) }; }
export function phase0Import(bundle: TransferBundle, path: string) {
  const options = { storePath: path, context: phase0Context() };
  const preview = previewImport(bundle, {}, options);
  return commitImport(preview.previewId, options);
}
export function phase0Summary(home: string, path: string, range: UsageRange) {
  const loaded = loadImportedEvents([], new Map(), {}, path);
  const first = loaded.events.map(event => event.dateKey).sort()[0];
  const window = dateWindow(range, PHASE0_NOW, first);
  const selected = loaded.events.filter(event => event.dateKey >= window.from && event.dateKey <= window.to);
  return summarizeUsageEvents(selected.map(applyCommandCodeQuota), home, loaded.pricing, loaded.updatedAt, window);
}
