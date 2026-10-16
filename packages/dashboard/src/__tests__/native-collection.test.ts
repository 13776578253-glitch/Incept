import { appendFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectAntigravityEvents } from '../adapters/local/collectors/antigravity';
import { collectClaudeEvents } from '../adapters/local/collectors/claude';
import { collectOpenCodeEvents } from '../adapters/local/collectors/opencode-usage';
import { collectZCodeEvents } from '../adapters/local/collectors/zcode';
import { collectCcusageFallback } from '../adapters/local/collectors/ccusage';
import { collectGeminiEvents } from '../adapters/local/collectors/gemini';
import { collectAiusageAndRawAgentEvents } from '../adapters/local/collectors/agents';
import { canonicalModelName, readLocalOverrides } from '../adapters/local/overrides';
import { canPriceUsage, loadLocalPricingMap, lookupPricing } from '../adapters/local/pricing';
import { exportTokenData } from '../adapters/local/imports/exporter';

let home = '';
const price = new Map();
const at = Date.parse('2026-10-12T04:00:00Z');
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'dashboard-native-')); });
afterEach(() => {
  vi.unstubAllEnvs(); vi.restoreAllMocks();
  if (!resolve(home).startsWith(join(resolve(tmpdir()), 'dashboard-native-'))) throw new Error('Unsafe test cleanup');
  rmSync(home, { recursive: true, force: true });
});
function varint(value: number) {
  const bytes = [];
  while (value >= 128) { bytes.push(value % 128 + 128); value = Math.floor(value / 128); }
  return Buffer.from([...bytes, value]);
}
function pb(...entries: Array<[number, number | string | Buffer]>) {
  return Buffer.concat(entries.flatMap(([number, value]) => {
    if (typeof value === 'number') return [varint(number * 8), varint(value)];
    const bytes = typeof value === 'string' ? Buffer.from(value) : value;
    return [varint(number * 8 + 2), varint(bytes.length), bytes];
  }));
}
function nativeDb() {
  const directory = join(home, '.gemini', 'antigravity', 'conversations'); mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(join(directory, 'native.db'));
  db.exec('CREATE TABLE gen_metadata (idx INTEGER, data BLOB); CREATE TABLE steps (idx INTEGER, metadata BLOB); CREATE TABLE trajectory_metadata_blob (data BLOB)');
  return db;
}
const tokens = (id: string, input = 100) => pb([1, 9876], [2, input], [3, 20], [5, 60], [9, 5], [11, id]);
const generation = (id: string, input = 100) => pb([1, pb([3, 9876], [19, 'model-from-native'], [4, tokens(id, input)],
  [9, pb([4, pb([1, at / 1000])])])], [2, 0]);

describe('repeatable native collection', () => {
  it('reports malformed Gemini sessions through the agent collector while retaining valid sessions', () => {
    const directory = join(home, '.gemini', 'tmp', 'fixture', 'chats');
    mkdirSync(directory, { recursive: true });
    const broken = join(directory, 'session-broken.json');
    writeFileSync(broken, '{invalid json');
    writeFileSync(join(directory, 'session-valid.json'), JSON.stringify({ sessionId: 'valid', messages: [{
      id: 'one', model: 'fixture-model', tokens: { input: 100, output: 20 },
    }] }));
    const gemini = collectGeminiEvents(home, price);
    expect(gemini.events).toHaveLength(1);
    expect(gemini.errors).toHaveLength(1);
    expect(gemini.errors[0]).toContain(`Failed to parse Gemini session at ${broken}:`);
    expect(collectAiusageAndRawAgentEvents(home, price).errors).toEqual(gemini.errors);
  });
  it('returns no Gemini errors when the source is absent', () => {
    expect(collectGeminiEvents(home, price)).toMatchObject({ events: [], errors: [] });
  });
  it('exports independent Antigravity requests with identical counters and timestamps', () => {
    const db = nativeDb();
    db.prepare('INSERT INTO gen_metadata VALUES (?, ?)').run(0, generation('independent-one'));
    db.prepare('INSERT INTO gen_metadata VALUES (?, ?)').run(1, generation('independent-two'));
    db.close();
    const bundle = exportTokenData({ home });
    expect(bundle.events).toHaveLength(2);
    expect(new Set(bundle.events.map(event => event.eventId)).size).toBe(2);
  });
  it('exports independent Gemini CLI message IDs with identical counters and timestamps', () => {
    const directory = join(home, '.gemini', 'tmp', 'fixture', 'chats'); mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'session-fixture.json'), JSON.stringify({ sessionId: 'fixture', messages: ['one', 'two'].map(id => ({
      id, timestamp: new Date(at).toISOString(), model: 'fixture-model', tokens: { input: 100, output: 20 },
    })) }));
    const bundle = exportTokenData({ home });
    expect(bundle.events).toHaveLength(2);
    expect(new Set(bundle.events.map(event => event.eventId)).size).toBe(2);
  });
  it('exports independent ZCode usage IDs with identical counters and timestamps', () => {
    const directory = join(home, '.zcode', 'cli', 'db'); mkdirSync(directory, { recursive: true });
    const db = new DatabaseSync(join(directory, 'db.sqlite'));
    db.exec('CREATE TABLE session (id TEXT, title TEXT, directory TEXT); CREATE TABLE model_usage (id TEXT, session_id TEXT, model_id TEXT, status TEXT, started_at INTEGER, input_tokens INTEGER, output_tokens INTEGER)');
    db.prepare('INSERT INTO session VALUES (?,?,?)').run('fixture', 'Fixture', 'D:/fixture');
    for (const id of ['one', 'two']) db.prepare('INSERT INTO model_usage VALUES (?,?,?,?,?,?,?)').run(id, 'fixture', 'fixture-model', 'completed', at, 100, 20);
    db.close();
    const bundle = exportTokenData({ home });
    expect(bundle.events).toHaveLength(2);
    expect(new Set(bundle.events.map(event => event.eventId)).size).toBe(2);
  });
  it('reads IDE Antigravity data, deduplicates generation/step copies and sees appended requests on the next collection', () => {
    const db = nativeDb();
    db.prepare('INSERT INTO gen_metadata VALUES (?, ?)').run(0, generation('response-1'));
    db.prepare('INSERT INTO steps VALUES (?, ?)').run(0, pb([9, tokens('response-1')], [8, pb([1, at / 1000])]));
    const first = collectAntigravityEvents(home, price);
    expect(first.errors).toEqual([]); expect(first.events).toHaveLength(1);
    expect(first.events[0]).toMatchObject({ modelName: 'model-from-native', inputTokens: 100, outputTokens: 15, reasoningTokens: 5, cacheReadTokens: 60 });
    db.prepare('INSERT INTO gen_metadata VALUES (?, ?)').run(1, generation('response-2', 200));
    expect(collectAntigravityEvents(home, price).events).toHaveLength(2);
    expect(first.events).toHaveLength(1);
    db.close();
  });
  it('keeps retries as distinct requests and does not guess an unknown numeric model identity', () => {
    const db = nativeDb();
    const metadata = pb([1, pb([3, 123456], [4, pb([1, 123456], [2, 10], [3, 2], [11, 'main'])],
      [17, pb([2, pb([1, 123456], [2, 4], [3, 1], [11, 'retry'])])], [9, pb([4, pb([1, at / 1000])])])]);
    db.prepare('INSERT INTO gen_metadata VALUES (?, ?)').run(0, metadata); db.close();
    const data = collectAntigravityEvents(home, price);
    expect(data.events).toHaveLength(2);
    expect(data.events.every(event => event.modelName === 'model-id:123456' && event.missingPricing)).toBe(true);
  });
  it('reuses rates only for names sharing a stored native model ID, not for similarly named different models', () => {
    const db = nativeDb();
    db.prepare('INSERT INTO gen_metadata VALUES (?, ?)').run(0, generation('base'));
    db.prepare('INSERT INTO gen_metadata VALUES (?, ?)').run(1, pb([1, pb([3, 9876], [19, 'alternate-route'], [4, tokens('alternate')], [9, pb([4, pb([1, at / 1000])])])]));
    db.prepare('INSERT INTO gen_metadata VALUES (?, ?)').run(2, pb([1, pb([3, 9877], [19, 'model-from-native-tiered'], [4, pb([1, 9877], [2, 10], [3, 2])], [9, pb([4, pb([1, at / 1000])])])]));
    db.close();
    const map = new Map([['model-from-native', { inputPerMillion: 1, outputPerMillion: 2, cacheReadPerMillion: .1 }]]);
    const data = collectAntigravityEvents(home, map);
    expect(data.events.find(event => event.modelName === 'alternate-route')?.missingPricing).toBe(false);
    expect(data.events.find(event => event.modelName === 'model-from-native-tiered')?.missingPricing).toBe(true);
  });
  it('deduplicates streaming Claude responses and reads the next appended response', () => {
    const directory = join(home, '.claude', 'projects', 'project'); mkdirSync(directory, { recursive: true });
    const file = join(directory, 'session.jsonl');
    const row = (id: string, output: number) => JSON.stringify({ type: 'assistant', sessionId: 'session', timestamp: new Date(at).toISOString(),
      message: { id, model: 'native-model', usage: { input_tokens: 10, output_tokens: output, cache_read_input_tokens: 5 } } }) + '\n';
    writeFileSync(file, row('one', 1) + row('one', 4));
    expect(collectClaudeEvents(home, price).events).toHaveLength(1);
    expect(collectClaudeEvents(home, price).events[0].outputTokens).toBe(4);
    appendFileSync(file, row('two', 3)); expect(collectClaudeEvents(home, price).events).toHaveLength(2);
  });
  it('reads native OpenCode messages and deduplicates copies in the newer message table', () => {
    const directory = join(home, '.local', 'share', 'opencode'); mkdirSync(directory, { recursive: true });
    const db = new DatabaseSync(join(directory, 'opencode.db'));
    db.exec("CREATE TABLE session (id TEXT, title TEXT, directory TEXT); CREATE TABLE message (id TEXT, session_id TEXT, time_created INTEGER, data TEXT); CREATE TABLE session_message (id TEXT, session_id TEXT, time_created INTEGER, data TEXT)");
    db.prepare('INSERT INTO session VALUES (?, ?, ?)').run('session', 'Native session', 'D:/project');
    const data = JSON.stringify({ id: 'message', role: 'assistant', modelID: 'native-model', cost: 0, tokens: { input: 10, output: 4, reasoning: 2, cache: { read: 6, write: 1 } } });
    for (const table of ['message', 'session_message']) db.prepare(`INSERT INTO ${table} VALUES (?, ?, ?, ?)`).run('message', 'session', at, data);
    db.close();
    const result = collectOpenCodeEvents(home, price);
    expect(result.events).toHaveLength(1); expect(result.events[0].cost).toBe(0); expect(result.events[0].missingPricing).toBe(false);
    expect(result.coveredSessions.has('opencode:session')).toBe(true);
  });
  it('reads local aliases and installed catalog rates without copying model constants into the adapter', () => {
    mkdirSync(join(home, '.commandcode')); const catalog = join(home, 'catalog.mjs');
    writeFileSync(catalog, 'doNotExecute();const rates={"provider/new-version":{inputCost:.15,outputCost:.6,cacheReadCost:.003}}');
    vi.stubEnv('INCEPT_COMMANDCODE_CATALOG_FILE', catalog);
    const file = join(home, 'overrides.json'); writeFileSync(file, JSON.stringify({ modelAliases: { 'old-version': 'provider/new-version' }, prices: {} }));
    const overrides = readLocalOverrides(file), map = loadLocalPricingMap(home, overrides);
    expect(canonicalModelName('provider/old-version', overrides.aliases)).toBe('provider/new-version');
    expect(lookupPricing(map, 'old-version')?.inputPerMillion).toBe(.15);
    expect(lookupPricing(map, 'provider/new-version-high')).toBeUndefined();
    expect(lookupPricing(map, 'provider/new-version.1')).toBeUndefined();
    writeFileSync(file, JSON.stringify({ prices: { 'provider/new-version': { inputPerMillion: .2, outputPerMillion: .8 } } }));
    expect(loadLocalPricingMap(home, readLocalOverrides(file)).get('provider/new-version')?.inputPerMillion).toBe(.2);
  });
  it('rereads completed ZCode usage and excludes in-progress counters', () => {
    const directory = join(home, '.zcode', 'cli', 'db'); mkdirSync(directory, { recursive: true });
    const db = new DatabaseSync(join(directory, 'db.sqlite'));
    db.exec('CREATE TABLE session (id TEXT, title TEXT, directory TEXT); CREATE TABLE model_usage (session_id TEXT, model_id TEXT, status TEXT, started_at INTEGER, input_tokens INTEGER, output_tokens INTEGER, reasoning_tokens INTEGER, cache_read_input_tokens INTEGER, cache_creation_input_tokens INTEGER)');
    db.prepare('INSERT INTO session VALUES (?, ?, ?)').run('session', 'Native ZCode', 'D:/project');
    const insert = db.prepare('INSERT INTO model_usage VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    insert.run('session', 'native-model', 'running', at, 100, 20, 5, 60, 0);
    expect(collectZCodeEvents(home, price).events).toEqual([]);
    db.exec("UPDATE model_usage SET status = 'completed'");
    expect(collectZCodeEvents(home, price).events[0]).toMatchObject({ modelName: 'native-model', inputTokens: 100, outputTokens: 20, reasoningTokens: 5, cacheReadTokens: 60 });
    insert.run('session', 'native-model', 'completed', at + 1000, 10, 2, 1, 0, 0);
    expect(collectZCodeEvents(home, price).events).toHaveLength(2); db.close();
  });
  it('does not turn missing cache prices into free cache usage or apply cyclic/invalid temporary data', () => {
    const directory = join(home, '.aiusage'); mkdirSync(directory);
    const db = new DatabaseSync(join(directory, 'cache.db'));
    db.exec("CREATE TABLE model_prices (model_key TEXT, input REAL, output REAL, cache_read REAL, cache_write REAL, status TEXT); INSERT INTO model_prices VALUES ('model', 1, 2, NULL, NULL, 'active')"); db.close();
    const map = loadLocalPricingMap(home, { aliases: {}, prices: {}, updatedAt: 0 });
    expect(canPriceUsage(map.get('model'), { inputTokens: 1, outputTokens: 1, reasoningTokens: 0, cacheReadTokens: 10, cacheCreationTokens: 0 })).toBe(false);
    const file = join(home, 'invalid.json'); writeFileSync(file, JSON.stringify({ modelAliases: { a: 'b', b: 'a' } }));
    expect(readLocalOverrides(file).error).toBeDefined(); expect(readLocalOverrides(file).aliases).toEqual({});
  });
  it('uses ccusage only for uncovered sessions and retains separate daily usage', async () => {
    const run = vi.fn(async (args: string[]) => args[1] === 'daily' ? JSON.stringify({ daily: [{ date: '2026-10-11' }, { date: '2026-10-12' }] })
      : JSON.stringify({ sessions: ['raw-session', 'fallback-session'].map(sessionId => ({ sessionId, modelBreakdowns: [{ modelName: 'model', inputTokens: 10, outputTokens: 2, cost: 1 }] })) }));
    const result = await collectCcusageFallback(['claudeCode'], { from: '2026-10-11', to: '2026-10-12' }, price, new Set(['claudeCode:raw-session']), run);
    expect(result.events).toHaveLength(2); expect(result.events.map(event => event.dateKey)).toEqual(['2026-10-11', '2026-10-12']);
    expect(result.events.every(event => event.sessionId === 'fallback-session')).toBe(true);
    expect(run.mock.calls.every(([args]) => args.includes('--offline'))).toBe(true);
  });
  it('does not replace indexed history with a partial ccusage query', async () => {
    let requests = 0;
    const run = async (args: string[]) => { if (args[1] === 'daily') return JSON.stringify({ daily: [{ date: '2026-10-11' }, { date: '2026-10-12' }] });
      if (++requests === 2) throw new Error('Read failed');
      return JSON.stringify({ sessions: [{ sessionId: 'session', modelBreakdowns: [{ modelName: 'model', inputTokens: 10 }] }] }); };
    const result = await collectCcusageFallback(['claudeCode'], { from: '2026-10-11', to: '2026-10-12' }, price, new Set(), run);
    expect(result.events).toEqual([]); expect(result.coveredSessions.size).toBe(0); expect(result.errors).not.toEqual([]);
  });
  it('reads the focused Codex model map without counting reasoning twice', async () => {
    const run = async (args: string[]) => args[1] === 'daily' ? JSON.stringify({ daily: [{ date: '2026-10-12' }] })
      : JSON.stringify({ sessions: [{ sessionId: 'session', models: { model: { inputTokens: 10, outputTokens: 5, reasoningOutputTokens: 2, cacheReadTokens: 4 } } }] });
    const result = await collectCcusageFallback(['codex'], { from: '2026-10-12', to: '2026-10-12' }, price, new Set(), run);
    expect(result.events[0]).toMatchObject({ inputTokens: 10, outputTokens: 3, reasoningTokens: 2, cacheReadTokens: 4, timestampPrecision: 'day' });
  });
});
