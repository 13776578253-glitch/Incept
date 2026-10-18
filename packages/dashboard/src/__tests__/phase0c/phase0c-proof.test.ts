import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { zstdCompressSync } from 'node:zlib';
import { build } from 'esbuild';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TRANSFER_SOURCES, dateWindow, type TransferSource } from '../../domain';
import { hash, stableJson } from '../../adapters/local/imports/identity';
import { loadImportedEvents } from '../../adapters/local/imports/layer';
import { ImportStore } from '../../adapters/local/imports/store';
import { rollbackImport } from '../../adapters/local/imports/service';
import { summarizeUsageEvents } from '../../adapters/local/aggregation/summarize';
import { applyCommandCodeQuota } from '../../adapters/local/pricing-schedule';
import { PHASE0_AT, PHASE0_NOW, PHASE0_DEVICE, PHASE0_MODEL, PHASE0_PRICE, phase0Export, phase0Import,
  phase0Rehash, writePhase0Source, writePhase0Index, writePhase0Home, writePhase0Pricing } from '../fixtures/sync-agent-phase0';
import { collectCodexEvents } from '../../adapters/local/collectors/codex';
import { logicalIdentity, type Scope, type PriceBasis, type AdoptionProof } from '../phase0b/phase0b-contract';
import { scan, seal, inventory, type Bridge, type Manifest } from './phase0c-evidence';
import { LineageServer, LineageClient } from './phase0c-lineage';

let home: string, server: LineageServer, servers: LineageServer[];
const scopeFor = (source: TransferSource): Scope => ({ deviceId: PHASE0_DEVICE, source,
  sessionId: source === 'commandcode' ? 'cc-phase0-commandcode' : 'phase0-' + source, originId: 'origin:' + source });
const basis = (): PriceBasis => ({ rates: { [PHASE0_MODEL]: PHASE0_PRICE, 'deepseek-v4-pro': PHASE0_PRICE }, aliases: {},
  schedule: 'commandcode-peak-v1', provenance: 'synthetic-captured-v1' });
const parentOf = (manifest: Manifest) => ({ id: manifest.manifestHash, hash: manifest.manifestHash });
const patch = (value: Manifest, update: Partial<Manifest>) => { const { manifestHash, ...body } = value; void manifestHash; return seal({ ...body, ...update }); };
const input = (instance = server) => instance.view().reduce((sum, row) => sum + row.inputTokens, 0);
function another(label: string) { const instance = new LineageServer(join(home, 'sync-agent-phase0c-' + label)); servers.push(instance); return instance; }
async function observed(source: TransferSource, parent?: Manifest, options: Parameters<typeof scan>[4] = {}) {
  return scan(home, scopeFor(source), basis(), parent ? parentOf(parent) : null, options);
}
async function baseline(source: TransferSource, options: Parameters<typeof scan>[4] = {}) {
  server.register(scopeFor(source)); const first = await observed(source, undefined, options);
  expect(first.status).toBe('complete');
  expect(await server.submit('baseline-' + source, first, PHASE0_DEVICE)).toMatchObject({ status: 'committed', code: 'baseline-observed' });
  return first;
}
function sql(path: string, query: string) { const db = new DatabaseSync(path); try { db.exec(query); } finally { db.close(); } }
function write(path: string, value: string | Buffer) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); }
function proof(manifest: Manifest, checksum: string, kind: AdoptionProof['kind'] = 'registered-origin'): AdoptionProof {
  return { ...manifest.scope, kind, batchChecksum: checksum, evidenceHash: hash(['Owner-bound exact references', manifest.manifestHash, checksum]) };
}
function comparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(comparable).sort((a, b) => stableJson(a).localeCompare(stableJson(b), 'en'));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    key === 'source' && typeof item === 'string' && item.includes(' / ') ? item.split(' / ').sort().join(' / ') : comparable(item)]));
  return value;
}
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'sync-agent-phase0c-')); servers = [];
  server = another('server'); writePhase0Pricing(home);
});
afterEach(() => {
  for (const instance of servers) instance.close();
  if (!resolve(home).startsWith(resolve(tmpdir()) + '\\sync-agent-phase0c-') && !resolve(home).startsWith(resolve(tmpdir()) + '/sync-agent-phase0c-')) throw new Error('UNSAFE_TEST_CLEANUP');
  rmSync(home, { recursive: true, force: true });
});

describe('Phase 0C: finite baselines, real collectors and since-enrollment chains', () => {
  it.each(TRANSFER_SOURCES)('%s enrolls observed baseline, then accepts append and no-op without duplicate counts', async source => {
    writePhase0Source(home, source); const first = await baseline(source);
    writePhase0Source(home, source, { count: 2 }); const next = await observed(source, first);
    const receipt = await server.submit('append', next, PHASE0_DEVICE);
    expect(receipt).toMatchObject({ status: 'committed', code: 'since-enrollment' }); expect(input()).toBe(200);
    for (let i = 0; i < 5; i++) expect(await server.submit('append', next, PHASE0_DEVICE)).toEqual(receipt);
    const unchanged = await observed(source, next);
    expect(await server.submit('no-op', unchanged, PHASE0_DEVICE)).toMatchObject({ status: 'committed', code: 'unchanged' });
    expect(input()).toBe(200); expect(server.view()).toHaveLength(2);
  });
  it('AIUsage fallback enrolls and appends only an exact preserved logical row prefix', async () => {
    writePhase0Index(home, 'claudeCode'); const first = await baseline('claudeCode', { reader: 'aiusage' });
    sql(join(home, '.aiusage/cache.db'), 'INSERT INTO records SELECT ts-8*86400000,tool,model,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,thinking_tokens,cost,session_id,source_file,cwd FROM records');
    const next = await observed('claudeCode', first, { reader: 'aiusage' });
    expect(await server.submit('fallback-append', next, PHASE0_DEVICE)).toMatchObject({ status: 'committed' }); expect(input()).toBe(200);
    expect(Math.min(...server.view().map(row => row.timestampMs))).toBe(PHASE0_AT - 8 * 86_400_000);
  });
  it.each(['antigravity-cli', 'antigravity-ide'])('Antigravity %s directory is in the manifest and read by the real collector', async variant => {
    writePhase0Source(home, 'antigravity'); const file = inventory(home, 'antigravity')[0];
    const target = file.replace('/antigravity/', '/' + variant + '/'); mkdirSync(dirname(join(home, target)), { recursive: true });
    renameSync(join(home, file), join(home, target)); const first = await baseline('antigravity');
    expect(first.files[0].locator).toBe(target); expect(input()).toBe(100);
  });
  it('multiple sessions in one OpenCode DB retain independent logical ranges', async () => {
    writePhase0Source(home, 'opencode'); const file = join(home, inventory(home, 'opencode')[0]);
    sql(file, "INSERT INTO session SELECT 'other',title,directory FROM session; INSERT INTO message SELECT 'other-row','other',time_created,data FROM message");
    const first = await baseline('opencode'); expect(input()).toBe(100); expect(first.recordCount).toBe(1);
    sql(file, "DELETE FROM message WHERE session_id='other'; DELETE FROM session WHERE id='other'");
    expect((await server.submit('other-session-removed', await observed('opencode', first), PHASE0_DEVICE)).status).toBe('committed'); expect(input()).toBe(100);
  });
  it('compressed Codex is readable by the real collector but explicitly restricted by this continuity adapter', async () => {
    writePhase0Source(home, 'codex'); const file = join(home, inventory(home, 'codex')[0]);
    writeFileSync(file + '.zst', zstdCompressSync(readFileSync(file))); rmSync(file);
    const real = collectCodexEvents(home, new Map([[PHASE0_MODEL, PHASE0_PRICE]]), new Set());
    expect(real.errors).toEqual([]); expect(real.events[0].inputTokens).toBe(100);
    server.register(scopeFor('codex')); const first = await observed('codex'); expect(first.status).toBe('COMPRESSED_ARCHIVE_UNSUPPORTED');
    expect((await server.submit('compressed', first, PHASE0_DEVICE)).status).toBe('review-required'); expect(input()).toBe(0);
  });
  it('Gemini identical current bytes have different verdicts with persisted different parents; first observation remains historically unknown', async () => {
    writePhase0Source(home, 'geminiCli'); const a = await baseline('geminiCli');
    const second = another('world-b'); second.register(scopeFor('geminiCli'));
    writePhase0Source(home, 'geminiCli', { count: 2 }); const b = await observed('geminiCli');
    expect((await second.submit('world-b-baseline', b, PHASE0_DEVICE)).status).toBe('committed');
    writePhase0Source(home, 'geminiCli'); const nextA = await observed('geminiCli', a), nextB = await observed('geminiCli', b);
    expect(nextA.files).toEqual(nextB.files); expect(nextA.observations).toEqual(nextB.observations);
    expect((await server.submit('world-a-next', nextA, PHASE0_DEVICE)).code).toBe('unchanged');
    expect(await second.submit('world-b-next', nextB, PHASE0_DEVICE)).toMatchObject({ status: 'review-required', code: 'PREFIX_LOST' });
    expect(input(second)).toBe(200);
    const fresh = another('fresh'); fresh.register(scopeFor('geminiCli'));
    expect((await fresh.submit('fresh', await observed('geminiCli'), PHASE0_DEVICE)).code).toBe('baseline-observed');
    expect(fresh.state().versions[0].parent).toBe(null);
    const legacy = join(home, 'legacy.db'); const bundle = phase0Export(home); phase0Import(bundle, legacy);
    const withV1 = another('unknown-v1'); withV1.attachLegacy(legacy); withV1.register(scopeFor('geminiCli'));
    expect((await withV1.submit('unknown-v1', await observed('geminiCli'), PHASE0_DEVICE)).code).toBe('V1_ADOPTION_REVIEW_REQUIRED');
    expect(input(withV1)).toBe(100); expect(withV1.state().versions).toHaveLength(0);
  });
  it('an eight-day-old native event appended today is accepted by prefix, not timestamp cutoff', async () => {
    writePhase0Source(home, 'claudeCode'); const first = await baseline('claudeCode');
    const file = join(home, inventory(home, 'claudeCode')[0]), row = JSON.parse(readFileSync(file, 'utf8').trim());
    row.message.id = 'late-old'; row.timestamp = new Date(PHASE0_AT - 8 * 86_400_000).toISOString();
    appendFileSync(file, JSON.stringify(row) + '\n');
    const next = await observed('claudeCode', first);
    expect((await server.submit('late-old', next, PHASE0_DEVICE)).status).toBe('committed'); expect(input()).toBe(200);
  });
});

function codexTotals(values: number[], mutate?: (rows: Record<string, unknown>[]) => void) {
  writePhase0Source(home, 'codex', { count: values.length }); const path = join(home, inventory(home, 'codex')[0]);
  const rows = readFileSync(path, 'utf8').trim().split('\n').map(row => JSON.parse(row));
  values.forEach((value, i) => { rows[i + 2].payload.info = {
    total_token_usage: { input_tokens: value, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 },
    last_token_usage: { input_tokens: i === 0 ? value : value - values[i - 1], cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 } }; });
  mutate?.(rows); writeFileSync(path, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
}
describe('Phase 0C: controlled counter updates and conservative weak session replacement', () => {
  it('Codex 100→120 retains session identity and ends at 120', async () => {
    codexTotals([100]); const first = await baseline('codex'), id = logicalIdentity(first.scope);
    codexTotals([120]); const next = await observed('codex', first);
    expect((await server.submit('120', next, PHASE0_DEVICE)).status).toBe('committed'); expect(input()).toBe(120);
    expect(logicalIdentity(next.scope)).toBe(id); expect(first.observations[0].event.eventId === next.observations[0].event.eventId).toBe(false);
  });
  it('Codex without session_meta remains a weak observed baseline; its counter rewrite needs review', async () => {
    const writeWeak = (total: number) => { codexTotals([total]); const path = join(home, inventory(home, 'codex')[0]);
      const lines = readFileSync(path, 'utf8').trim().split('\n'); writeFileSync(path, lines.slice(1).join('\n') + '\n'); };
    writeWeak(100); const first = await baseline('codex'); writeWeak(120);
    expect((await server.submit('weak-codex-edit', await observed('codex', first), PHASE0_DEVICE)).code).toBe('CODEX_SESSION_ANCHOR_REQUIRED'); expect(input()).toBe(100);
  });
  it('Codex 50/100/200→50/120/200→50/120/220 uses ordered anchored cumulative corrections', async () => {
    codexTotals([50, 100, 200]); const first = await baseline('codex'); expect(input()).toBe(200);
    codexTotals([50, 120, 200]); const middle = await observed('codex', first);
    expect((await server.submit('middle', middle, PHASE0_DEVICE)).status).toBe('committed');
    expect(server.view().map(row => row.inputTokens)).toEqual([50, 70, 80]); expect(input()).toBe(200);
    codexTotals([50, 120, 220]); const last = await observed('codex', middle);
    expect((await server.submit('last', last, PHASE0_DEVICE)).status).toBe('committed');
    expect(server.view().map(row => row.inputTokens)).toEqual([50, 70, 100]); expect(input()).toBe(220);
  });
  it.each(['commandcode', 'claudeCode', 'geminiCli', 'opencode', 'zcode'] as const)('%s accepts usage-only native-key revision with fixed surrounding evidence', async source => {
    writePhase0Source(home, source); const first = await baseline(source); writePhase0Source(home, source, { input: 120 });
    const next = await observed(source, first);
    expect((await server.submit('corrected', next, PHASE0_DEVICE)).status).toBe('committed'); expect(input()).toBe(120);
  });
  it.each(['commandcode', 'claudeCode', 'geminiCli', 'antigravity', 'zcode'] as const)('%s weak identity accepts append but rejects ambiguous old-row revision', async source => {
    writePhase0Source(home, source, { withoutId: true }); const first = await baseline(source);
    writePhase0Source(home, source, { withoutId: true, count: 2 }); const next = await observed(source, first);
    expect((await server.submit('weak-append', next, PHASE0_DEVICE)).status).toBe('committed'); expect(input()).toBe(200);
    writePhase0Source(home, source, { withoutId: true, count: 2, input: 120 });
    expect((await server.submit('weak-edit', await observed(source, next), PHASE0_DEVICE)).status).toBe('review-required'); expect(input()).toBe(200);
  });
  it('Antigravity native alias metadata revision remains an explicit unsupported automatic path', async () => {
    writePhase0Source(home, 'antigravity'); const first = await baseline('antigravity');
    writePhase0Source(home, 'antigravity', { input: 120 });
    expect(await server.submit('alias-edit', await observed('antigravity', first), PHASE0_DEVICE)).toMatchObject({ status: 'review-required', code: 'WEAK_DB_REVISION_REVIEW_REQUIRED' });
    expect(input()).toBe(100);
  });
  it.each(['anchor', 'time', 'order', 'reset'] as const)('ambiguous Codex %s rewrite is quarantined', async kind => {
    codexTotals([50, 100, 200]); const first = await baseline('codex');
    codexTotals(kind === 'reset' ? [50, 40, 200] : [50, 120, 200], rows => {
      if (kind === 'anchor') (rows[0].payload as { id: string }).id = 'wrong-session';
      if (kind === 'time') rows[3].timestamp = '2026-10-14T00:00:00Z';
      if (kind === 'order') [rows[2], rows[3]] = [rows[3], rows[2]];
    });
    expect((await server.submit('ambiguous-' + kind, await observed('codex', first), PHASE0_DEVICE)).status).toBe('review-required'); expect(input()).toBe(200);
  });
});

describe('Phase 0C: incomplete reads, loss and rotation preserve the committed generation', () => {
  it.each(TRANSFER_SOURCES)('%s valid truncation/DB deletion cannot silently remove history', async source => {
    writePhase0Source(home, source, { count: 2 }); const first = await baseline(source);
    writePhase0Source(home, source); const next = await observed(source, first);
    expect(next.status).toBe('complete'); expect((await server.submit('truncated', next, PHASE0_DEVICE)).status).toBe('review-required');
    expect(input()).toBe(200); expect(server.state().versions).toHaveLength(1);
  });
  it('a race, half-written JSONL and missing directory retain the old view', async () => {
    writePhase0Source(home, 'claudeCode'); const first = await baseline('claudeCode');
    const file = join(home, first.files[0].locator);
    const race = await observed('claudeCode', first, { duringRead: () => appendFileSync(file, '\n') });
    expect((await server.submit('race', race, PHASE0_DEVICE)).code).toBe('CHANGED_DURING_READ');
    appendFileSync(file, '{"type":'); const partial = await observed('claudeCode', first);
    expect((await server.submit('half-line', partial, PHASE0_DEVICE)).code).toBe('INCOMPLETE_JSON');
    rmSync(file); expect((await server.submit('missing', await observed('claudeCode', first), PHASE0_DEVICE)).code).toBe('MISSING_ORIGIN');
    expect(input()).toBe(100); expect(server.state().versions).toHaveLength(1);
  });
  it('SQLite VACUUM changes physical bytes while logical snapshot remains a no-op; replacement DB needs review', async () => {
    writePhase0Source(home, 'opencode'); const first = await baseline('opencode'); const file = join(home, first.files[0].locator);
    sql(file, 'PRAGMA user_version=23; VACUUM'); const next = await observed('opencode', first);
    expect(hash(first.files[0].bytes) === hash(next.files[0].bytes)).toBe(false); expect(first.files[0].root).toBe(next.files[0].root);
    expect((await server.submit('vacuum', next, PHASE0_DEVICE)).code).toBe('unchanged');
    const replacement = file + '.replacement'; copyFileSync(file, replacement); renameSync(file, file + '.old'); renameSync(replacement, file);
    expect((await server.submit('replaced-db', await observed('opencode', next), PHASE0_DEVICE)).code).toBe('DB_REPLACED_UNVERIFIED'); expect(input()).toBe(100);
  });
  it('fallback old-row modification and fallback→native migration both require review', async () => {
    writePhase0Index(home, 'claudeCode'); const first = await baseline('claudeCode', { reader: 'aiusage' });
    sql(join(home, '.aiusage/cache.db'), 'UPDATE records SET input_tokens=120');
    expect((await server.submit('index-edit', await observed('claudeCode', first, { reader: 'aiusage' }), PHASE0_DEVICE)).code).toBe('WEAK_DB_REVISION_REVIEW_REQUIRED');
    writePhase0Source(home, 'claudeCode', { input: 120 });
    expect((await server.submit('native-restored', await observed('claudeCode', first), PHASE0_DEVICE)).code).toBe('SCOPE_BINDING_MISMATCH'); expect(input()).toBe(100);
    const exported = phase0Export(home); expect(exported.events).toHaveLength(1); expect(exported.events[0].inputTokens).toBe(120);
  });
  it('AIUsage record deletion retains its last valid session generation', async () => {
    writePhase0Index(home, 'claudeCode'); const first = await baseline('claudeCode', { reader: 'aiusage' });
    sql(join(home, '.aiusage/cache.db'), 'DELETE FROM records');
    expect((await server.submit('index-delete', await observed('claudeCode', first, { reader: 'aiusage' }), PHASE0_DEVICE)).code).toBe('DB_RECORD_DISAPPEARED');
    expect(input()).toBe(100);
  });
  it('AIUsage cache rename has no automatic rotation bridge', async () => {
    writePhase0Index(home, 'claudeCode'); const first = await baseline('claudeCode', { reader: 'aiusage' });
    const target = join(home, '.aiusage/archive/cache.db'); mkdirSync(dirname(target), { recursive: true }); renameSync(join(home, '.aiusage/cache.db'), target);
    expect((await server.submit('cache-renamed', await observed('claudeCode', first, { reader: 'aiusage' }), PHASE0_DEVICE)).code).toBe('ROTATION_UNVERIFIED'); expect(input()).toBe(100);
  });
  it.each(TRANSFER_SOURCES)('%s native/index dual representation uses the real exporter once; changing lineage reader stays under review', async source => {
    writePhase0Index(home, source, { session: scopeFor(source).sessionId });
    if (source === 'commandcode') {
      const db = new DatabaseSync(join(home, '.aiusage/cache.db'));
      try { db.prepare('UPDATE records SET source_file=?').run(join(home, '.commandcode/projects/phase0-project/phase0-commandcode.jsonl')); } finally { db.close(); }
    }
    const first = await baseline(source, { reader: 'aiusage' });
    writePhase0Source(home, source, { input: 120 }); const next = await observed(source, first);
    expect((await server.submit('restore-native', next, PHASE0_DEVICE)).code).toBe('SCOPE_BINDING_MISMATCH'); expect(input()).toBe(100);
    const exported = phase0Export(home); expect(exported.events).toHaveLength(1); expect(exported.events[0].inputTokens).toBe(120);
  });
  it('CommandCode index pointing elsewhere has no handoff proof; legacy exporter exposes both and lineage retains its prior view', async () => {
    writePhase0Index(home, 'commandcode', { session: scopeFor('commandcode').sessionId }); const first = await baseline('commandcode', { reader: 'aiusage' });
    writePhase0Source(home, 'commandcode', { input: 120 });
    const bundle = phase0Export(home); expect(bundle.events).toHaveLength(2); expect(bundle.events.reduce((sum, row) => sum + row.inputTokens, 0)).toBe(220);
    expect((await server.submit('ambiguous-index-origin', await observed('commandcode', first), PHASE0_DEVICE)).code).toBe('SCOPE_BINDING_MISMATCH'); expect(input()).toBe(100);
  });
  it('coexisting Gemini archive copy without a checked bridge returns ROTATION_UNVERIFIED', async () => {
    writePhase0Source(home, 'geminiCli'); const first = await baseline('geminiCli'), old = first.files[0];
    write(join(home, dirname(old.locator), 'archive', basename(old.locator)), Buffer.from(old.bytes, 'base64'));
    expect((await server.submit('unverified-coexist', await observed('geminiCli', first), PHASE0_DEVICE)).code).toBe('ROTATION_UNVERIFIED'); expect(input()).toBe(100);
  });
  it.each(['antigravity', 'opencode', 'zcode'] as const)('%s DB rename without a bridge returns structured ROTATION_UNVERIFIED', async source => {
    writePhase0Source(home, source); const first = await baseline(source), old = first.files[0];
    const locator = join(dirname(old.locator), 'rotated-' + basename(old.locator)); renameSync(join(home, old.locator), join(home, locator));
    expect((await server.submit('db-rename', await observed(source, first), PHASE0_DEVICE)).code).toBe('ROTATION_UNVERIFIED'); expect(input()).toBe(100);
  });
  it.each(['codex', 'commandcode', 'claudeCode', 'geminiCli'] as const)('%s rename without a registered bridge returns ROTATION_UNVERIFIED', async source => {
    writePhase0Source(home, source); const first = await baseline(source), old = first.files[0];
    const nextPath = join(dirname(old.locator), 'archive', basename(old.locator));
    mkdirSync(dirname(join(home, nextPath)), { recursive: true }); renameSync(join(home, old.locator), join(home, nextPath));
    expect((await server.submit('unverified-rename', await observed(source, first), PHASE0_DEVICE)).code).toBe('ROTATION_UNVERIFIED'); expect(input()).toBe(100);
  });
  it.each(['codex', 'claudeCode', 'geminiCli'] as const)('%s verified embedded-session archive copy coexists and then hands off with no duplication', async source => {
    writePhase0Source(home, source); const first = await baseline(source), old = first.files[0];
    const locator = join(dirname(old.locator), 'archive', basename(old.locator)).replaceAll('\\', '/');
    write(join(home, locator), Buffer.from(old.bytes, 'base64'));
    const bridge: Bridge = { parentHash: first.manifestHash, from: old.locator, to: locator, oldRoot: old.root, kind: 'embedded-session-copy' };
    const coexist = await observed(source, first, { bridges: [bridge] });
    expect((await server.submit('coexist', coexist, PHASE0_DEVICE)).status).toBe('committed'); expect(input()).toBe(100); expect(server.view()).toHaveLength(1);
    rmSync(join(home, old.locator)); const handoff = await observed(source, coexist, { bridges: [{ ...bridge, parentHash: coexist.manifestHash }] });
    expect((await server.submit('handoff', handoff, PHASE0_DEVICE)).status).toBe('committed'); expect(input()).toBe(100);
  });
  it('same-file CommandCode directory move preserves its filename namespace with a checked file identity bridge', async () => {
    writePhase0Source(home, 'commandcode'); const first = await baseline('commandcode'), old = first.files[0];
    const locator = '.commandcode/projects/archive/' + basename(old.locator); mkdirSync(dirname(join(home, locator)), { recursive: true });
    renameSync(join(home, old.locator), join(home, locator));
    const bridge: Bridge = { parentHash: first.manifestHash, from: old.locator, to: locator, oldRoot: old.root, kind: 'same-file' };
    expect((await server.submit('move', await observed('commandcode', first, { bridges: [bridge] }), PHASE0_DEVICE)).status).toBe('committed'); expect(input()).toBe(100);
  });
  it('cross-file Codex session appends a later anchored cumulative shard', async () => {
    codexTotals([50]); const first = await baseline('codex'); const old = first.files[0];
    codexTotals([50, 100]); const rows = readFileSync(join(home, old.locator), 'utf8').trim().split('\n');
    writeFileSync(join(home, old.locator), Buffer.from(old.bytes, 'base64'));
    write(join(home, '.codex/archived_sessions/new-shard.jsonl'), [rows[0], rows[1], rows[3]].join('\n') + '\n');
    expect((await server.submit('new-shard', await observed('codex', first), PHASE0_DEVICE)).status).toBe('committed'); expect(input()).toBe(100);
  });
});

describe('Phase 0C: ownership, evidence, atomic commit and durable restart', () => {
  it('rejects origin takeover, source/session binding errors, wrong parent and same-batch different payload', async () => {
    writePhase0Source(home, 'claudeCode'); const first = await baseline('claudeCode');
    expect(() => server.register({ ...first.scope, deviceId: 'other-device' })).toThrow('ORIGIN_ALREADY_OWNED');
    await expect(server.submit('wrong-device', first, 'other-device')).rejects.toThrow('DEVICE_MISMATCH');
    const next = await observed('claudeCode', first);
    expect((await server.submit('wrong-parent', patch(next, { parent: { id: 'stale', hash: first.manifestHash } }), PHASE0_DEVICE)).code).toBe('PARENT_MISMATCH');
    expect((await server.submit('wrong-source', patch(next, { scope: { ...next.scope, source: 'codex' } }), PHASE0_DEVICE)).status).toBe('review-required');
    expect((await server.submit('wrong-session', patch(next, { scope: { ...next.scope, sessionId: 'wrong' } }), PHASE0_DEVICE)).status).toBe('review-required');
    await expect(server.submit('baseline-claudeCode', next, PHASE0_DEVICE)).rejects.toThrow('BATCH_PAYLOAD_MISMATCH'); expect(input()).toBe(100);
  });
  it('complete flag, forged observations, capsule bytes and counterfeit parent hash cannot establish qualification', async () => {
    writePhase0Source(home, 'claudeCode'); const first = await baseline('claudeCode'), next = await observed('claudeCode', first);
    const forged = structuredClone(next.observations); forged[0].event.inputTokens = 500;
    const falseRows = patch(next, { observations: forged, sequenceRoot: hash(forged) });
    expect((await server.submit('false-rows', falseRows, PHASE0_DEVICE)).code).toBe('COLLECTOR_EVIDENCE_MISMATCH');
    const bytes = structuredClone(next.files); bytes[0].bytes = Buffer.from('{}\n').toString('base64');
    expect((await server.submit('false-bytes', patch(next, { files: bytes }), PHASE0_DEVICE)).code).toBe('BYTE_ROOT_MISMATCH');
    expect((await server.submit('false-parent-hash', patch(next, { parent: { id: first.manifestHash, hash: 'wrong' } }), PHASE0_DEVICE)).code).toBe('PARENT_MISMATCH');
    const file = join(home, next.files[0].locator); appendFileSync(file, '{');
    const half = await observed('claudeCode', first), claimed = patch(half, { status: 'complete' });
    expect((await server.submit('false-complete', claimed, PHASE0_DEVICE)).status).toBe('review-required'); expect(input()).toBe(100);
  });
  it('transaction failure exposes no partial generation or receipt to a second SQLite reader', async () => {
    writePhase0Source(home, 'claudeCode'); const first = await baseline('claudeCode');
    const reader = another('server'); writePhase0Source(home, 'claudeCode', { count: 2 }); const next = await observed('claudeCode', first);
    await expect(server.submit('failed', next, PHASE0_DEVICE, { failCommit: true, onStage: () => {
      expect(input(reader)).toBe(100); expect(reader.receipt(PHASE0_DEVICE, 'failed')).toBe(undefined);
    } })).rejects.toThrow('INJECTED_COMMIT_FAILURE');
    expect(input()).toBe(100); expect(server.receipt(PHASE0_DEVICE, 'failed')).toBe(undefined);
    expect((await server.submit('failed', next, PHASE0_DEVICE)).status).toBe('committed'); expect(input(reader)).toBe(200);
  });
  it('client cannot advance an acknowledged cursor with a forged or quarantined receipt', async () => {
    writePhase0Source(home, 'claudeCode'); const scope = scopeFor('claudeCode'), manifest = await observed('claudeCode'); server.register(scope);
    const client = new LineageClient(join(home, 'sync-agent-phase0c-client'), scope); client.prepare('pending', manifest);
    const receipt = await server.submit('pending', manifest, PHASE0_DEVICE);
    expect(() => client.acknowledge({ ...receipt, receiptHash: 'forged' }, server)).toThrow('COMMIT_RECEIPT_REQUIRED');
    expect(client.state().acknowledged).toBe(null); client.acknowledge(receipt, server); expect(client.state().acknowledged).toEqual(parentOf(manifest));
    appendFileSync(join(home, manifest.files[0].locator), '{'); const partial = await observed('claudeCode', manifest); client.prepare('quarantine', partial);
    const rejected = await server.submit('quarantine', partial, PHASE0_DEVICE);
    expect(() => client.acknowledge(rejected, server)).toThrow('COMMIT_RECEIPT_REQUIRED'); expect(client.state().acknowledged).toEqual(parentOf(manifest));
    expect(server.state().quarantined[JSON.stringify([PHASE0_DEVICE, 'quarantine'])]).toEqual(JSON.parse(JSON.stringify(partial)));
    client.retainConflict(rejected, server); expect(client.state().pending).toBe(undefined); expect(client.state().acknowledged).toEqual(parentOf(manifest));
    writePhase0Source(home, 'claudeCode', { count: 2 }); const repaired = await observed('claudeCode', manifest); client.prepare('repaired', repaired);
    client.acknowledge(await server.submit('repaired', repaired, PHASE0_DEVICE), server); expect(input()).toBe(200); expect(client.state().conflicts).toHaveLength(1);
  });
  it('process exit→restart loads manifests, retains pending on remote failure, and retries lost ACK idempotently', async () => {
    writePhase0Source(home, 'claudeCode'); const bundlePath = join(home, 'process.cjs');
    await build({ entryPoints: [resolve('src/__tests__/phase0c/phase0c-process.ts')], outfile: bundlePath, bundle: true, platform: 'node', format: 'cjs',
      plugins: [{ name: 'test-server-only', setup(builder) { builder.onResolve({ filter: /^server-only$/ }, () => ({ path: 'empty', namespace: 'empty' }));
        builder.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '' })); } }] });
    const inputPath = join(home, 'process-input.json'), outputPath = join(home, 'process-output.json');
    const parameters = { home, scope: scopeFor('claudeCode'), basis: basis(), server: join(home, 'sync-agent-phase0c-child-server'), client: join(home, 'sync-agent-phase0c-child-client'), batchId: 'child-baseline' };
    const invoke = (action: string) => { writeFileSync(inputPath, JSON.stringify(parameters));
      execFileSync(process.execPath, [bundlePath, action, inputPath, outputPath], { windowsHide: true, timeout: 30_000, stdio: 'pipe' });
      return JSON.parse(readFileSync(outputPath, 'utf8')); };
    const prepared = invoke('prepare'); expect(prepared.client.acknowledged).toBe(null); expect(prepared.client.pending.batchId).toBe('child-baseline');
    const failed = invoke('remote-failure'); expect(failed.inputTokens).toBe(0); expect(failed.client.acknowledged).toBe(null); expect(failed.server.versions).toHaveLength(0);
    const lost = invoke('ack-loss'); expect(lost.inputTokens).toBe(100); expect(lost.client.acknowledged).toBe(null); expect(lost.client.pending).toBeDefined();
    const retried = invoke('retry'); expect(retried.inputTokens).toBe(100); expect(retried.client.pending).toBe(undefined); expect(retried.server.versions).toHaveLength(1);
    expect(retried.client.receipt).toEqual(Object.values(lost.server.receipts)[0]);
    expect(new Set([prepared.pid, failed.pid, lost.pid, retried.pid]).size).toBe(4);
    writePhase0Source(home, 'claudeCode', { count: 2 }); parameters.batchId = 'child-append';
    const next = invoke('prepare'); expect(next.client.pending.manifest.parent).toEqual(retried.client.acknowledged);
    expect(() => invoke('crash-during-commit')).toThrow();
    const crashReader = another('child-server'); expect(input(crashReader)).toBe(100); expect(crashReader.receipt(PHASE0_DEVICE, 'child-append')).toBe(undefined);
    expect(invoke('retry').inputTokens).toBe(200);
  }, 30_000);
});

describe('Phase 0C: B2 adoption plus lineage preserves real v1 statistics and B3/B4 rules', () => {
  it('existing v1 overlap stays visible until exact-reference adoption; truncated first baseline needs explicit Owner review', async () => {
    writePhase0Source(home, 'geminiCli', { count: 2 }); const bundle = phase0Export(home), legacy = join(home, 'legacy.db'), receipt = phase0Import(bundle, legacy);
    server.attachLegacy(legacy); server.register(scopeFor('geminiCli')); writePhase0Source(home, 'geminiCli'); const candidate = await observed('geminiCli');
    expect((await server.submit('first-unknown', candidate, PHASE0_DEVICE)).code).toBe('V1_ADOPTION_REVIEW_REQUIRED'); expect(input()).toBe(200);
    await expect(server.reviewLegacy(candidate, receipt.id, proof(candidate, bundle.checksum), 'owner')).rejects.toThrow('ADOPTION_REVIEW-REQUIRED');
    await expect(server.reviewLegacy(candidate, receipt.id, proof(candidate, bundle.checksum, 'owner-reviewed'), 'device')).rejects.toThrow('OWNER_REQUIRED');
    await server.reviewLegacy(candidate, receipt.id, proof(candidate, bundle.checksum, 'owner-reviewed'), 'owner');
    expect((await server.submit('owner-explicit', candidate, PHASE0_DEVICE)).code).toBe('baseline-observed'); expect(input()).toBe(100);
    expect(server.state().audit.some(row => (row as { kind?: string }).kind === 'adoption-grant')).toBe(true);
  });
  it('7d/30d/all full-object parity survives seven-source lineage adoption, replay, revision rollback and legacy rollback', async () => {
    writePhase0Home(home, 3);
    const dates = [PHASE0_NOW - 45 * 86_400_000, PHASE0_NOW - 15 * 86_400_000, PHASE0_AT];
    // Modify synthetic timestamps in each real source, preserving native anchors.
    for (const source of TRANSFER_SOURCES) for (const locator of inventory(home, source)) {
      const file = join(home, locator);
      if (locator.endsWith('.jsonl')) {
        let i = 0; const rows = readFileSync(file, 'utf8').trim().split('\n').map(line => {
          const row = JSON.parse(line); if (row.timestamp !== undefined) row.timestamp = source === 'commandcode' ? dates[i++] : new Date(dates[i++]).toISOString(); return row;
        }); writeFileSync(file, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
      } else if (source === 'geminiCli') {
        const data = JSON.parse(readFileSync(file, 'utf8')); data.messages.forEach((row: { timestamp: string }, i: number) => { row.timestamp = new Date(dates[i]).toISOString(); }); writeFileSync(file, JSON.stringify(data));
      } else if (source === 'opencode' || source === 'zcode') {
        const db = new DatabaseSync(file); try { const table = source === 'opencode' ? 'message' : 'model_usage', column = source === 'opencode' ? 'time_created' : 'started_at';
          dates.forEach((at, i) => db.prepare(`UPDATE ${table} SET ${column}=? WHERE id=?`).run(at, 'request-' + i)); } finally { db.close(); }
      } else if (source === 'antigravity') {
        const varint = (value: number) => { const bytes = []; while (value >= 128) { bytes.push(value % 128 + 128); value = Math.floor(value / 128); } return Buffer.from([...bytes, value]); };
        const db = new DatabaseSync(file); try {
          for (const row of db.prepare('SELECT idx,data FROM gen_metadata').all()) {
            const index = Number(row.idx), data = Buffer.from(row.data as Uint8Array), before = varint((PHASE0_AT + index * 1000) / 1000), after = varint(dates[index] / 1000);
            const offset = data.indexOf(before); expect(offset >= 0).toBe(true); expect(before.length).toBe(after.length); after.copy(data, offset);
            db.prepare('UPDATE gen_metadata SET data=? WHERE idx=?').run(data, index);
          }
        } finally { db.close(); }
      }
    }
    const bundle = phase0Export(home), legacyPath = join(home, 'legacy.db'), receipt = phase0Import(bundle, legacyPath);
    phase0Import(phase0Rehash({ ...bundle, exportId: randomUUID() }), legacyPath); server.attachLegacy(legacyPath);
    const legacy = loadImportedEvents([], new Map(), {}, legacyPath).events.map(applyCommandCodeQuota);
    const summarize = (rows: typeof legacy, range: '7d' | '30d' | 'all') => {
      const window = dateWindow(range, PHASE0_NOW, rows.map(row => row.dateKey).sort()[0]);
      return summarizeUsageEvents(rows.filter(row => row.dateKey >= window.from && row.dateKey <= window.to), home, new Map(), PHASE0_AT, window);
    };
    const parity = () => { for (const [range, groups] of [['7d', 1], ['30d', 2], ['all', 3]] as const) {
      const actual = summarize(server.view(), range); expect(comparable(actual)).toEqual(comparable(summarize(legacy, range)));
      expect(actual.totals.totalTokens).toBe(910 * groups); expect(actual.totals.sessionCount).toBe(7);
    } }; parity();
    const store = new ImportStore(legacyPath), batches = store.batches(); store.close(); const manifests: Manifest[] = [];
    for (const source of TRANSFER_SOURCES) {
      const manifest = await observed(source); expect(manifest.status).toBe('complete'); server.register(manifest.scope);
      for (const batch of batches) await server.reviewLegacy(manifest, batch.receipt.id, proof(manifest, batch.bundle.checksum), 'owner');
      expect((await server.submit('adopt-' + source, manifest, PHASE0_DEVICE)).status).toBe('committed'); manifests.push(manifest); parity();
    }
    expect(server.view()).toHaveLength(21);
    const restarted = another('server'); expect(restarted.state()).toEqual(server.state()); parity();
    rollbackImport(receipt.id, legacyPath); server.attachLegacy(legacyPath); parity();
    const claude = manifests.find(row => row.scope.source === 'claudeCode')!, file = join(home, claude.files[0].locator);
    const rows = readFileSync(file, 'utf8').trim().split('\n').map(row => JSON.parse(row)); rows[2].message.usage.input_tokens = 120;
    writeFileSync(file, rows.map(row => JSON.stringify(row)).join('\n') + '\n'); const revised = await observed('claudeCode', claude);
    expect((await server.submit('revision', revised, PHASE0_DEVICE)).status).toBe('committed'); expect(input()).toBe(2120);
    server.rollbackRevision(revised.manifestHash, 'owner'); parity();
    expect((await server.submit('rollback-replay', await observed('claudeCode', revised), PHASE0_DEVICE)).code).toBe('ROLLED_BACK_LINEAGE_REVIEW_REQUIRED'); parity();
    const repriced = patch(await observed('claudeCode', revised), { basis: { ...basis(), provenance: 'implicit-price-change' } });
    expect((await server.submit('implicit-reprice', repriced, PHASE0_DEVICE)).code).toBe('EXPLICIT_REPRICE_OR_MAPPING_REQUIRED'); parity();
  }, 20_000);
  it('CommandCode recorded nominal cost and peak/off-peak quota remain frozen and rollback selects prior generation', async () => {
    writePhase0Source(home, 'commandcode', { model: 'deepseek-v4-pro', cost: .2, at: Date.parse('2026-10-15T01:00:00Z') });
    const first = await baseline('commandcode'); expect(server.view()[0].nominalCost).toBe(.2); expect(server.view()[0].cost).toBe(.4);
    writePhase0Source(home, 'commandcode', { model: 'deepseek-v4-pro', cost: .3, at: Date.parse('2026-10-15T01:00:00Z') });
    const next = await observed('commandcode', first); expect((await server.submit('cost-revision', next, PHASE0_DEVICE)).status).toBe('committed');
    expect(server.view()[0].cost).toBe(.6); server.rollbackRevision(next.manifestHash, 'owner'); expect(server.view()[0].cost).toBe(.4);
    expect(applyCommandCodeQuota(server.view()[0]).cost).toBe(.4);
  });
  it('v1 baseline adoption cannot silently change captured price; explicit Owner review binds the changed basis', async () => {
    writePhase0Source(home, 'claudeCode'); const bundle = phase0Export(home), path = join(home, 'legacy-price.db'), receipt = phase0Import(bundle, path);
    server.attachLegacy(path); server.register(scopeFor('claudeCode')); const changedBasis = basis(); changedBasis.rates[PHASE0_MODEL] = { ...PHASE0_PRICE, inputPerMillion: 2 };
    const manifest = await scan(home, scopeFor('claudeCode'), changedBasis);
    await expect(server.reviewLegacy(manifest, receipt.id, proof(manifest, bundle.checksum), 'owner')).rejects.toThrow('PRICING_REVIEW_REQUIRED');
    expect(server.view()[0].cost).toBeCloseTo(.000145, 10);
    await server.reviewLegacy(manifest, receipt.id, proof(manifest, bundle.checksum, 'owner-reviewed'), 'owner');
    expect((await server.submit('explicit-price-adoption', manifest, PHASE0_DEVICE)).status).toBe('committed');
    expect(server.view()[0].cost).toBeCloseTo(.000245, 10); server.rollbackRevision(manifest.manifestHash, 'owner'); expect(server.view()[0].cost).toBeCloseTo(.000145, 10);
  });
});
