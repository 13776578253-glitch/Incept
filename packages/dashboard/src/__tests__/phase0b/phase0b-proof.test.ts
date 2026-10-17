import { appendFileSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TRANSFER_SOURCES, dateWindow, type TransferSource, type TransferBundle } from '../../domain';
import { hash, stableJson } from '../../adapters/local/imports/identity';
import { ImportStore } from '../../adapters/local/imports/store';
import { loadImportedEvents } from '../../adapters/local/imports/layer';
import { previewImport, commitImport, rollbackImport } from '../../adapters/local/imports/service';
import { collectImportContext } from '../../adapters/local/imports/context';
import { summarizeUsageEvents } from '../../adapters/local/aggregation/summarize';
import { applyCommandCodeQuota } from '../../adapters/local/pricing-schedule';
import { PHASE0_AT, PHASE0_NOW, PHASE0_PRICE, PHASE0_MODEL, PHASE0_DEVICE, phase0Context, phase0Export,
  phase0Import, phase0Rehash, writePhase0Home, writePhase0Index, writePhase0Pricing, writePhase0Source } from '../fixtures/sync-agent-phase0';
import { capture, inventory, type OriginRegistry } from './phase0b-evidence';
import { Phase0bShadow } from './phase0b-shadow';
import { classifyAdoption, fingerprint, generation, logicalIdentity, pricedObservation, scopeId,
  type AdoptionProof, type PriceBasis, type Scope, type SessionGeneration } from './phase0b-contract';

let home: string, legacyPath: string, shadow: Phase0bShadow, sequence = 0;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'sync-agent-phase0b-')); legacyPath = join(home, 'phase0b-legacy.db');
  shadow = new Phase0bShadow(join(home, 'sync-agent-phase0b-shadow')); sequence = 0;
});
afterEach(() => {
  shadow.close();
  const target = resolve(home), parent = resolve(tmpdir());
  if (!target.startsWith(parent + '\\sync-agent-phase0b-') && !target.startsWith(parent + '/sync-agent-phase0b-')) throw new Error('UNSAFE_TEST_CLEANUP');
  rmSync(target, { recursive: true, force: true });
});
const basis = (): PriceBasis => ({ rates: { [PHASE0_MODEL]: { ...PHASE0_PRICE }, 'phase0-corrected-model': { ...PHASE0_PRICE } },
  aliases: {}, schedule: 'commandcode-peak-v1', provenance: 'Synthetic registry v1' });
const scopeFor = (source: TransferSource, sessionId = source === 'commandcode' ? 'cc-phase0-commandcode' : 'phase0-' + source): Scope => ({
  deviceId: PHASE0_DEVICE, source, sessionId, originId: 'registered-origin:' + source + ':' + sessionId,
});
async function observed(source: TransferSource, parent: string | null = null, options: { reader?: 'aiusage'; scope?: Scope } = {}) {
  const scope = options.scope ?? scopeFor(source), registry: OriginRegistry = { scope, paths: inventory(home, options.reader ?? source) };
  const scan = await capture(home, join(home, 'phase0b-frozen-' + sequence++), registry, { reader: options.reader });
  return generation({ scope, parent, observations: scan.observations, evidence: scan.evidence, basis: basis(), mappings: {},
    operation: 'replace-complete-session', removedAnchors: [] });
}
function certified(value: SessionGeneration, expectedInputs: number[]) {
  const result = changed(value, { evidence: { ...value.evidence, coverage: 'fixture-certified' } });
  shadow.certifyFixture(result, expectedInputs); return result;
}
function changed(value: SessionGeneration, patch: Partial<SessionGeneration>) {
  const payload = { scope: value.scope, parent: value.parent, observations: value.observations, evidence: value.evidence,
    basis: value.basis, mappings: value.mappings, operation: value.operation, removedAnchors: value.removedAnchors };
  return generation({ ...payload, ...patch });
}
const totalInput = () => shadow.view().reduce((sum, event) => sum + event.inputTokens, 0);
function proof(bundle: TransferBundle, value: SessionGeneration, kind: AdoptionProof['kind'] = 'registered-origin'): AdoptionProof {
  return { kind, ...value.scope, batchChecksum: bundle.checksum, evidenceHash: hash(['fixture registration', value.scope, bundle.checksum]) };
}
function adoptAll(bundle: TransferBundle, receiptId: string, value: SessionGeneration) {
  const positions = bundle.events.flatMap((event, index) => event.source === value.scope.source && event.sessionId === value.scope.sessionId ? [index] : []);
  expect(shadow.adopt(receiptId, positions, value, proof(bundle, value))).toBe('auto-adopt');
}
// Aggregate parity compares semantic arrays as sets. The runtime currently leaves tied rows in
// insertion order, and an adopted generation has a new provenance order; numeric fields stay exact.
function comparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(comparable).sort((a, b) => stableJson(a).localeCompare(stableJson(b), 'en'));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    key === 'source' && typeof item === 'string' && item.includes(' / ') ? item.split(' / ').sort().join(' / ') : comparable(item)]));
  return value;
}

describe('Phase 0B B1: actual source reads and explicit scope evidence', () => {
  it.each(TRANSFER_SOURCES)('%s: certified fixture correction replaces one session, input100→120', async source => {
    writePhase0Pricing(home); writePhase0Source(home, source); const scope = scopeFor(source); shadow.register(scope);
    const first = certified(await observed(source), [100]);
    expect(first.evidence.status).toBe('complete'); expect(shadow.ingest('first', first, PHASE0_DEVICE).status).toBe('committed');
    const again = await observed(source); expect(again.observations).toEqual(first.observations);
    writePhase0Source(home, source, { input: 120 });
    const second = certified(await observed(source, first.generationId), [120]);
    expect(shadow.ingest('second', second, PHASE0_DEVICE).status).toBe('committed');
    expect(totalInput()).toBe(120); expect(shadow.view()).toHaveLength(1);
    expect(shadow.db.prepare('SELECT COUNT(*) AS n FROM phase0b_versions').get()!.n).toBe(2);
  });

  it.each(TRANSFER_SOURCES)('%s: real collector output alone is quarantined without a history certificate', async source => {
    writePhase0Pricing(home); writePhase0Source(home, source); shadow.register(scopeFor(source));
    const value = await observed(source);
    expect(value.evidence.status).toBe('complete'); expect(value.evidence.coverage).toBe('snapshot-only');
    expect(shadow.ingest('unattested', value, PHASE0_DEVICE)).toMatchObject({ status: 'quarantined', code: 'HISTORY_CERTIFICATE_REQUIRED' });
    expect(totalInput()).toBe(0);
  });

  it.each(TRANSFER_SOURCES)('%s: partial source keeps previous generation', async source => {
    writePhase0Pricing(home); writePhase0Source(home, source); shadow.register(scopeFor(source));
    const first = certified(await observed(source), [100]); shadow.ingest('baseline', first, PHASE0_DEVICE);
    const paths = inventory(home, source), file = join(home, paths[0]);
    if (/\.(jsonl|json)$/.test(file)) appendFileSync(file, '{"unfinished":');
    else {
      const db = new DatabaseSync(file);
      try {
        if (source === 'opencode') db.exec("UPDATE message SET data='{' ");
        else if (source === 'zcode') db.exec("UPDATE model_usage SET status='running'");
        else db.exec("UPDATE gen_metadata SET data=x'ff'");
      } finally { db.close(); }
    }
    const value = await observed(source, first.generationId);
    expect(value.evidence.status === 'partial' || value.evidence.status === 'failed').toBe(true);
    expect(shadow.ingest('partial', value, PHASE0_DEVICE).status).toBe('quarantined'); expect(totalInput()).toBe(100);
  });

  it.each(TRANSFER_SOURCES)('%s: missing origins are unavailable, never an empty deletion', async source => {
    writePhase0Source(home, source); const registry = { scope: scopeFor(source), paths: inventory(home, source) };
    for (const path of registry.paths) rmSync(join(home, path));
    const scan = await capture(home, join(home, 'phase0b-frozen-missing'), registry);
    expect(scan.evidence).toMatchObject({ status: 'unavailable', code: 'MISSING_ORIGIN' }); expect(scan.observations).toEqual([]);
  });

  it('detects file mutation during capture instead of certifying stable content', async () => {
    writePhase0Source(home, 'commandcode'); const registry = { scope: scopeFor('commandcode'), paths: inventory(home, 'commandcode') };
    const result = await capture(home, join(home, 'phase0b-frozen-race'), registry, { duringRead: () => appendFileSync(join(home, registry.paths[0]), '{}\n') });
    expect(result.evidence).toMatchObject({ status: 'partial', code: 'CHANGED_DURING_READ', consistentRead: false });
  });

  it('verifies the frozen copy root as well as before/after roots, rejecting a mismatched copied snapshot', async () => {
    writePhase0Source(home, 'commandcode'); const registry = { scope: scopeFor('commandcode'), paths: inventory(home, 'commandcode') };
    const frozen = join(home, 'phase0b-frozen-copy-check');
    const result = await capture(home, frozen, registry, { duringRead: () => appendFileSync(join(frozen, registry.paths[0]), '{}\n') });
    expect(result.evidence.beforeHash).toBe(result.evidence.afterHash);
    expect(result.evidence.snapshotHash === result.evidence.beforeHash).toBe(false);
    expect(result.evidence.status).toBe('partial'); expect(result.evidence.consistentRead).toBe(false);
  });

  it('treats a valid truncated Gemini file as snapshot-only: minimal completeness counterexample', async () => {
    writePhase0Source(home, 'geminiCli', { count: 2 }); const first = await observed('geminiCli');
    writePhase0Source(home, 'geminiCli', { count: 1 }); const truncated = await observed('geminiCli');
    expect(first.observations).toHaveLength(2); expect(truncated.observations).toHaveLength(1);
    // Both parse and remain unchanged during reading; neither proves whether an older request was rotated away.
    expect(truncated.evidence).toMatchObject({ status: 'complete', coverage: 'snapshot-only', consistentRead: true });
    shadow.register(scopeFor('geminiCli'));
    expect(shadow.ingest('truncated', truncated, PHASE0_DEVICE).code).toBe('HISTORY_CERTIFICATE_REQUIRED');
  });

  it('two different history worlds have identical current bytes and collector evidence: no source-only complete-history decision exists', async () => {
    const intact = join(home, 'world-intact'), truncated = join(home, 'world-truncated');
    writePhase0Source(intact, 'geminiCli', { count: 1 });
    writePhase0Source(truncated, 'geminiCli', { count: 2 }); // Ground truth previously included two independent requests.
    writePhase0Source(truncated, 'geminiCli', { count: 1 }); // Perfectly valid rewrite, with no producer tombstone or rotation manifest.
    const scope = scopeFor('geminiCli');
    const first = await capture(intact, join(intact, 'phase0b-frozen'), { scope, paths: inventory(intact, 'geminiCli') });
    const second = await capture(truncated, join(truncated, 'phase0b-frozen'), { scope, paths: inventory(truncated, 'geminiCli') });
    expect(first).toEqual(second); expect(first.evidence.coverage).toBe('snapshot-only');
    expect(first.observations.reduce((sum, row) => sum + row.event.inputTokens, 0)).toBe(100);
    // A correct historical total is 100 in the first world and 200 in the second.
    // The deterministic collector receives identical input, so history certification needs additional evidence.
  });

  it('recomputes the Codex cumulative session: [50,100,200]→[50,120,200] changes two deltas with net zero', async () => {
    writePhase0Pricing(home); writePhase0Source(home, 'codex', { count: 3 });
    const file = join(home, '.codex/sessions/phase0-codex.jsonl');
    const rows = readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const rewrite = (totals: number[]) => {
      for (let i = 0; i < 3; i++) {
        const info = rows[i + 2].payload.info;
        info.total_token_usage = { input_tokens: totals[i], cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 };
        info.last_token_usage = { input_tokens: totals[i] - (totals[i - 1] ?? 0), cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 };
      }
      writeFileSync(file, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
    };
    shadow.register(scopeFor('codex')); rewrite([50, 100, 200]);
    const first = certified(await observed('codex'), [50, 50, 100]); shadow.ingest('cumulative-1', first, PHASE0_DEVICE);
    rewrite([50, 120, 200]); const next = certified(await observed('codex', first.generationId), [50, 70, 80]);
    shadow.ingest('cumulative-2', next, PHASE0_DEVICE);
    expect(shadow.view().map(row => row.inputTokens)).toEqual([50, 70, 80]); expect(totalInput()).toBe(200);
    rewrite([50, 120, 220]); const last = certified(await observed('codex', next.generationId), [50, 70, 100]);
    shadow.ingest('cumulative-3', last, PHASE0_DEVICE); expect(totalInput()).toBe(220);
  });

  it('quarantines Codex an unlocated cumulative prefix', async () => {
    writePhase0Source(home, 'codex'); const file = join(home, '.codex/sessions/phase0-codex.jsonl');
    const rows = readFileSync(file, 'utf8').trim().split('\n').map(row => JSON.parse(row));
    rows[2].payload.info.total_token_usage.input_tokens = 1110;
    writeFileSync(file, rows.map(row => JSON.stringify(row)).join('\n'));
    const result = await observed('codex'); expect(result.evidence.status).toBe('partial'); expect(result.evidence.history).toBe('unknown-prefix');
  });

  it.each(['commandcode', 'claudeCode', 'geminiCli', 'antigravity', 'zcode'] as const)('%s weak fixtures correct the SESSION entity without assuming per-event identity', async source => {
    writePhase0Source(home, source, { withoutId: true }); shadow.register(scopeFor(source));
    const first = certified(await observed(source), [100]); expect(first.observations[0].nativeAnchor).toBeUndefined();
    shadow.ingest('weak-first', first, PHASE0_DEVICE); writePhase0Source(home, source, { withoutId: true, input: 120 });
    const next = certified(await observed(source, first.generationId), [120]); shadow.ingest('weak-next', next, PHASE0_DEVICE);
    expect(logicalIdentity(first.scope)).toBe(logicalIdentity(next.scope)); expect(totalInput()).toBe(120);
  });

  it('AIUsage correction is a certified weak session replacement; unknown history remains quarantined', async () => {
    writePhase0Index(home, 'claudeCode'); shadow.register(scopeFor('claudeCode'));
    const first = certified(await observed('claudeCode', null, { reader: 'aiusage' }), [100]); shadow.ingest('index-first', first, PHASE0_DEVICE);
    writePhase0Index(home, 'claudeCode', { input: 120 });
    const snapshot = await observed('claudeCode', first.generationId, { reader: 'aiusage' });
    expect(shadow.ingest('index-unknown', snapshot, PHASE0_DEVICE).code).toBe('HISTORY_CERTIFICATE_REQUIRED'); expect(totalInput()).toBe(100);
    const next = certified(snapshot, [120]); shadow.ingest('index-certified', next, PHASE0_DEVICE); expect(totalInput()).toBe(120);
  });

  it('a corrupt DB is failed and Gemini fallback mtime is partial evidence', async () => {
    writePhase0Source(home, 'opencode'); writeFileSync(join(home, inventory(home, 'opencode')[0]), 'not sqlite');
    expect((await observed('opencode')).evidence.status).toBe('failed');
    writePhase0Source(home, 'geminiCli'); const file = join(home, inventory(home, 'geminiCli')[0]);
    const data = JSON.parse(readFileSync(file, 'utf8')); delete data.messages[0].timestamp; writeFileSync(file, JSON.stringify(data));
    expect((await observed('geminiCli')).evidence).toMatchObject({ status: 'partial', code: 'ESTIMATED_TIMESTAMP' });
  });

  it('weak/no-ID line insertion and rename need scope evidence rather than line IDs', async () => {
    writePhase0Source(home, 'commandcode', { withoutId: true }); const first = await observed('commandcode');
    expect(first.observations[0].nativeAnchor).toBeUndefined();
    const paths = inventory(home, 'commandcode'), file = join(home, paths[0]); writeFileSync(file, '{}\n' + readFileSync(file, 'utf8'));
    const inserted = await observed('commandcode'); expect(inserted.observations[0].event.eventId === first.observations[0].event.eventId).toBe(false);
    const registry = { scope: scopeFor('commandcode'), paths };
    renameSync(file, join(dirname(file), 'renamed.jsonl'));
    expect((await capture(home, join(home, 'phase0b-frozen-rename'), registry)).evidence.status).toBe('unavailable');
  });

  it('rejects ambiguous neighboring weak rows and registers AIUsage only as weak snapshot evidence', async () => {
    writePhase0Source(home, 'claudeCode', { withoutId: true }); const file = join(home, inventory(home, 'claudeCode')[0]);
    appendFileSync(file, readFileSync(file, 'utf8'));
    expect((await observed('claudeCode')).evidence.code).toBe('AMBIGUOUS_SOURCE_ROWS');
    writePhase0Index(home, 'claudeCode'); const index = await observed('claudeCode', null, { reader: 'aiusage' });
    expect(index.evidence.coverage).toBe('snapshot-only'); expect(index.observations[0].nativeAnchor).toBeUndefined();
  });

  it.each(TRANSFER_SOURCES)('%s: explicit old timestamp is retained by a certified generation', async source => {
    writePhase0Source(home, source, { at: PHASE0_NOW - 8 * 86_400_000 }); shadow.register(scopeFor(source));
    const value = certified(await observed(source), [100]); shadow.ingest('late', value, PHASE0_DEVICE);
    expect(shadow.view()[0].timestampMs).toBe(PHASE0_NOW - 8 * 86_400_000);
  });
});

describe('Phase 0B B2: legacy adoption, one projection and recoverable journal', () => {
  it('requires verified origin binding, records adoption, and handles v1 100→v2 120→v1 rollback', async () => {
    writePhase0Pricing(home); writePhase0Source(home, 'codex'); const bundle = phase0Export(home), receipt = phase0Import(bundle, legacyPath);
    shadow.migrate(legacyPath); const baseline = certified(await observed('codex'), [100]); shadow.register(baseline.scope);
    expect(classifyAdoption(bundle.events, baseline, bundle.device.id, bundle.checksum)).toBe('review-required');
    expect(shadow.ingest('before-adopt', baseline, PHASE0_DEVICE).code).toBe('LEGACY_ADOPTION_REQUIRED'); expect(totalInput()).toBe(100);
    adoptAll(bundle, receipt.id, baseline); shadow.ingest('adopted', baseline, PHASE0_DEVICE); expect(totalInput()).toBe(100);
    const adoptionLog = shadow.db.prepare("SELECT payload FROM phase0b_log WHERE op_id LIKE 'adopt:%'").get()!;
    expect(JSON.parse(String(adoptionLog.payload)).audit).toMatchObject({ actor: 'fixture-owner', reason: 'registered-origin' });
    writePhase0Source(home, 'codex', { input: 120 }); const next = certified(await observed('codex', baseline.generationId), [120]);
    shadow.ingest('corrected', next, PHASE0_DEVICE); shadow.rollbackLegacy(receipt.id); expect(totalInput()).toBe(120);
    shadow.rollbackRevision(next.generationId); expect(totalInput()).toBe(100);
    shadow.rollbackRevision(baseline.generationId); expect(totalInput()).toBe(0);
  });

  it('two overlapping v1 batches keep the entity supported after either rollback', () => {
    writePhase0Home(home); const bundle = phase0Export(home), first = phase0Import(bundle, legacyPath);
    const second = phase0Import(phase0Rehash({ ...bundle, exportId: randomUUID() }), legacyPath);
    shadow.migrate(legacyPath); expect(totalInput()).toBe(700);
    shadow.rollbackLegacy(first.id); expect(totalInput()).toBe(700); shadow.rollbackLegacy(second.id); expect(totalInput()).toBe(0);
  });

  it('migration resumes after interruption, retains rolled batches/order/receipts and rebuilds twice without changes', () => {
    writePhase0Home(home); const bundle = phase0Export(home), first = phase0Import(bundle, legacyPath);
    phase0Import(phase0Rehash({ ...bundle, exportId: randomUUID() }), legacyPath); rollbackImport(first.id, legacyPath);
    expect(() => shadow.migrate(legacyPath, 1)).toThrow('MIGRATION_INTERRUPTED'); expect(totalInput()).toBe(0);
    shadow.close(); shadow = new Phase0bShadow(join(home, 'sync-agent-phase0b-shadow'));
    shadow.migrate(legacyPath); expect(totalInput()).toBe(700); const dump = shadow.dump(), revision = shadow.revision;
    shadow.migrate(legacyPath); shadow.rebuild(); shadow.rebuild();
    expect(shadow.dump()).toEqual(dump); expect(shadow.revision).toBe(revision);
    const stored = shadow.db.prepare("SELECT payload FROM phase0b_log WHERE op_id=?").get('legacy:' + first.id)!;
    expect(JSON.parse(String(stored.payload)).batch.receipt.status).toBe('rolled_back');
  });

  it('rebuild recovers a deliberately cleared projection and revision from the immutable journal', async () => {
    writePhase0Source(home, 'codex'); const value = certified(await observed('codex'), [100]); shadow.register(value.scope);
    shadow.ingest('baseline', value, PHASE0_DEVICE); const before = shadow.dump();
    shadow.db.exec('DELETE FROM phase0b_projection; UPDATE phase0b_meta SET revision=0'); shadow.rebuild();
    expect(shadow.dump()).toEqual(before); expect(totalInput()).toBe(100);
  });

  it('observes a later real v1 rollback without changing immutable imported payload or resurrecting membership', () => {
    writePhase0Home(home); const bundle = phase0Export(home), receipt = phase0Import(bundle, legacyPath);
    shadow.migrate(legacyPath); expect(totalInput()).toBe(700); rollbackImport(receipt.id, legacyPath);
    shadow.migrate(legacyPath); expect(totalInput()).toBe(0); const before = shadow.dump(); shadow.migrate(legacyPath); shadow.rebuild();
    expect(shadow.dump()).toEqual(before);
  });

  it('v2 batch retries100 times return the same receipt and a changed payload under the ID is rejected', async () => {
    writePhase0Source(home, 'claudeCode'); shadow.register(scopeFor('claudeCode')); const value = certified(await observed('claudeCode'), [100]);
    const receipt = shadow.ingest('stable-batch', value, PHASE0_DEVICE), before = shadow.dump();
    for (let i = 0; i < 100; i++) expect(shadow.ingest('stable-batch', value, PHASE0_DEVICE)).toEqual(receipt);
    expect(shadow.dump()).toEqual(before);
    expect(() => shadow.ingest('stable-batch', changed(value, { parent: value.generationId }), PHASE0_DEVICE)).toThrow('BATCH_ID_REUSED');
  });

  it.each(['after-log', 'after-version', 'after-projection', 'before-receipt'])('full replacement failure at %s is atomic, retry commits once', async failAt => {
    writePhase0Source(home, 'codex'); shadow.register(scopeFor('codex')); const first = certified(await observed('codex'), [100]);
    shadow.ingest('first', first, PHASE0_DEVICE); writePhase0Source(home, 'codex', { input: 120 });
    const next = certified(await observed('codex', first.generationId), [120]), before = shadow.dump(), revision = shadow.revision;
    const reader = new DatabaseSync(join(shadow.directory, 'phase0b-shadow.db'), { readOnly: true });
    let observations = 0;
    shadow.onStage = () => {
      expect(reader.prepare('SELECT revision FROM phase0b_meta').get()!.revision).toBe(revision);
      const rows = reader.prepare('SELECT payload FROM phase0b_projection').all().map(row => JSON.parse(String(row.payload)));
      expect(rows.reduce((sum, row) => sum + row.inputTokens, 0)).toBe(100); observations++;
    };
    try { expect(() => shadow.ingest('next', next, PHASE0_DEVICE, { failAt })).toThrow('INJECTED_FAILURE'); }
    finally { shadow.onStage = undefined; reader.close(); }
    expect(observations > 0).toBe(true); expect(shadow.dump()).toEqual(before); expect(shadow.revision).toBe(revision);
    const receipt = shadow.ingest('next', next, PHASE0_DEVICE); expect(totalInput()).toBe(120); expect(receipt.dataRevision > revision).toBe(true);
    shadow.close(); shadow = new Phase0bShadow(join(home, 'sync-agent-phase0b-shadow'));
    expect(shadow.ingest('next', next, PHASE0_DEVICE)).toEqual(receipt); expect(totalInput()).toBe(120);
  });

  it('weak→strong one-to-one is preserved; one-to-many and source rename require review/conflict', async () => {
    writePhase0Pricing(home); writePhase0Index(home, 'claudeCode'); const indexed = phase0Export(home); phase0Import(indexed, legacyPath);
    writePhase0Source(home, 'claudeCode'); const raw = phase0Export(home); phase0Import(raw, legacyPath);
    shadow.migrate(legacyPath); expect(totalInput()).toBe(100);
    const candidate = certified(await observed('claudeCode'), [100]); shadow.register(candidate.scope);
    const old = indexed.events;
    expect(classifyAdoption(old, candidate, indexed.device.id, indexed.checksum, proof(indexed, candidate))).toBe('auto-adopt');
    const two = changed(candidate, { observations: [...candidate.observations, { ...candidate.observations[0], nativeAnchor: 'second' }] });
    expect(classifyAdoption(old, two, indexed.device.id, indexed.checksum, proof(indexed, candidate))).toBe('review-required');
    expect(classifyAdoption([...old, { ...old[0], eventId: hash('second weak representation') }], candidate, indexed.device.id,
      indexed.checksum, proof(indexed, candidate))).toBe('review-required');
    expect(classifyAdoption(old, changed(candidate, { scope: { ...candidate.scope, source: 'geminiCli' } }), indexed.device.id, indexed.checksum, proof(indexed, candidate))).toBe('conflict');
  });

  it('device spoofing, origin substitution, cross-device adoption and device-driven adoption are rejected', async () => {
    writePhase0Source(home, 'claudeCode'); const bundle = phase0Export(home), receipt = phase0Import(bundle, legacyPath); shadow.migrate(legacyPath);
    const value = certified(await observed('claudeCode'), [100]); shadow.register(value.scope);
    expect(() => shadow.ingest('spoof', value, 'another-device')).toThrow('DEVICE_ID_MISMATCH');
    const other = changed(value, { scope: { ...value.scope, deviceId: 'another-device' } });
    expect(classifyAdoption(bundle.events, other, bundle.device.id, bundle.checksum, proof(bundle, other))).toBe('conflict');
    expect(() => shadow.adopt(receipt.id, [0], value, proof(bundle, value), 'device')).toThrow('OWNER_ADOPTION_REQUIRED');
    const moved = changed(value, { scope: { ...value.scope, originId: 'unbound-origin' }, evidence: { ...value.evidence, originId: 'unbound-origin' } });
    expect(shadow.ingest('substitution', moved, PHASE0_DEVICE).code).toBe('BINDING_ORIGIN_MISMATCH'); expect(totalInput()).toBe(100);
  });

  it('persists ambiguous adoption review without hiding legacy data or losing evidence on rebuild', async () => {
    writePhase0Pricing(home); writePhase0Source(home, 'claudeCode'); const bundle = phase0Export(home), receipt = phase0Import(bundle, legacyPath);
    shadow.migrate(legacyPath); const first = certified(await observed('claudeCode'), [100]); shadow.register(first.scope);
    const two = changed(first, { observations: [...first.observations, { ...first.observations[0], nativeAnchor: 'different',
      event: { ...first.observations[0].event, eventId: hash('second request') } }] });
    expect(shadow.adopt(receipt.id, [0], two, proof(bundle, two))).toBe('review-required');
    expect(shadow.db.prepare('SELECT COUNT(*) AS n FROM phase0b_conflicts').get()!.n).toBe(1); expect(totalInput()).toBe(100);
    const before = shadow.dump(); shadow.rebuild(); expect(shadow.dump()).toEqual(before);
  });

  it('same anchor in another session/device/source remains a separate identity namespace', () => {
    const first = scopeFor('opencode');
    expect(new Set([logicalIdentity(first, 'same'), logicalIdentity({ ...first, sessionId: 'other' }, 'same'),
      logicalIdentity({ ...first, deviceId: 'other' }, 'same'), logicalIdentity({ ...first, source: 'zcode' }, 'same')]).size).toBe(4);
    expect(scopeId(first)).toBe(scopeId({ ...first, originId: 'renamed-origin' }));
  });

  it('executes ID collisions across independently registered devices without overwriting, rejects copied origin ownership', async () => {
    writePhase0Source(home, 'claudeCode'); const first = certified(await observed('claudeCode'), [100]); shadow.register(first.scope);
    shadow.ingest('one', first, PHASE0_DEVICE);
    expect(() => shadow.register({ ...first.scope, deviceId: 'other-device' })).toThrow('ORIGIN_ALREADY_OWNED');
    const scope = { ...first.scope, deviceId: 'other-device', originId: 'independent-physical-origin' };
    const second = certified(changed(first, { scope, evidence: { ...first.evidence, originId: scope.originId } }), [100]);
    shadow.register(scope); shadow.ingest('two', second, scope.deviceId);
    expect(shadow.view()).toHaveLength(2); expect(totalInput()).toBe(200);
    expect(new Set(shadow.view().map(event => event.deviceId)).size).toBe(2);
  });

  it('stale parent and mutated generation body preserve the previous visible set', async () => {
    writePhase0Source(home, 'codex'); const first = certified(await observed('codex'), [100]); shadow.register(first.scope); shadow.ingest('first', first, PHASE0_DEVICE);
    const stale = certified(changed(first, { parent: 'unknown-generation' }), [100]);
    expect(shadow.ingest('stale', stale, PHASE0_DEVICE).code).toBe('STALE_PARENT');
    expect(shadow.ingest('tampered', { ...first, parent: 'mutated-without-rehash' }, PHASE0_DEVICE).code).toBe('GENERATION_HASH_MISMATCH');
    expect(totalInput()).toBe(100);
  });
});

describe('Phase 0B B3/B4: frozen revisions, explicit reprice and scoped rollback', () => {
  it.each(['input', 'model', 'project', 'cost'] as const)('%s changes the full fingerprint and one current entity', async field => {
    writePhase0Source(home, 'claudeCode'); shadow.register(scopeFor('claudeCode'));
    const first = certified(await observed('claudeCode'), [100]); shadow.ingest('first', first, PHASE0_DEVICE);
    const event = { ...first.observations[0].event };
    if (field === 'input') event.inputTokens = 120;
    if (field === 'model') event.modelName = 'phase0-corrected-model';
    if (field === 'project') { event.projectKey = 'changed-project'; event.projectName = 'Changed project'; event.sessionTitle = 'Changed title'; }
    if (field === 'cost') event.recordedCost = .3;
    const observation = { ...first.observations[0], event };
    expect(fingerprint(first.observations[0], first.basis) === fingerprint(observation, first.basis)).toBe(false);
    const value = certified(changed(first, { parent: first.generationId, observations: [observation] }), [field === 'input' ? 120 : 100]);
    shadow.ingest('next', value, PHASE0_DEVICE); expect(shadow.view()).toHaveLength(1);
    expect(shadow.view()[0].inputTokens).toBe(field === 'input' ? 120 : 100);
    if (field === 'cost') expect(shadow.view()[0].cost).toBe(.3);
    if (field === 'project') expect(shadow.view()[0].projectName).toContain('Changed project');
  });

  it('v2 captured pricing is frozen; explicit audited reprice and its rollback are distinct from usage correction', async () => {
    writePhase0Source(home, 'geminiCli'); shadow.register(scopeFor('geminiCli'));
    const first = certified(await observed('geminiCli'), [100]); shadow.ingest('first', first, PHASE0_DEVICE);
    expect(shadow.view()[0].cost).toBeCloseTo(.000145, 10);
    const newBasis = basis(); newBasis.rates[PHASE0_MODEL].inputPerMillion = 2;
    const newPrice = changed(first, { parent: first.generationId, basis: newBasis });
    expect(shadow.ingest('implicit-price', newPrice, PHASE0_DEVICE).code).toBe('EXPLICIT_REPRICE_REQUIRED');
    expect(() => shadow.repriceForOwner('device-price', newPrice, 'device')).toThrow('OWNER_REPRICE_REQUIRED');
    shadow.repriceForOwner('explicit-price', newPrice, 'owner'); expect(shadow.view()[0].cost).toBeCloseTo(.000245, 10);
    shadow.rollbackRevision(newPrice.generationId); expect(shadow.view()[0].cost).toBeCloseTo(.000145, 10);
  });

  it('preserves existing v1/native live-price overrides as a separate compatibility lane', () => {
    writePhase0Pricing(home); writePhase0Source(home, 'geminiCli'); const bundle = phase0Export(home); phase0Import(bundle, legacyPath); shadow.migrate(legacyPath);
    const original = shadow.view([], new Map([[PHASE0_MODEL, PHASE0_PRICE]]));
    const rates = new Map([[PHASE0_MODEL, { ...PHASE0_PRICE, inputPerMillion: 2 }]]);
    const overridden = shadow.view([], rates), oracle = loadImportedEvents([], rates, {}, legacyPath).events;
    expect(original[0].cost).toBeCloseTo(.000145, 10); expect(overridden[0].cost).toBeCloseTo(.000245, 10);
    expect(overridden).toEqual(oracle);
  });

  it('recorded, API-equivalent and CommandCode nominal/peak costs retain separate semantics', async () => {
    writePhase0Source(home, 'commandcode', { model: 'deepseek-v4-pro', cost: .2, at: Date.parse('2026-10-15T01:00:00Z') });
    const value = await observed('commandcode'), prices = basis(); prices.rates['deepseek-v4-pro'] = PHASE0_PRICE;
    const row = pricedObservation(value.scope, value.observations[0], prices);
    expect(row).toMatchObject({ cost: .4, nominalCost: .2, isPeak: true, peakMultiplier: 2, costSource: 'recorded' });
    expect(row.apiEquivalentCost).toBeCloseTo(.00029, 10);
    const offPeak = { ...value.observations[0], event: { ...value.observations[0].event, timestampMs: PHASE0_AT } };
    expect(pricedObservation(value.scope, offPeak, prices)).toMatchObject({ cost: .2, nominalCost: .2, isPeak: false });
    expect(applyCommandCodeQuota(row).cost).toBe(.4);
    expect(pricedObservation(value.scope, value.observations[0], { ...prices, rates: {} })).toMatchObject({ cost: .4, apiEquivalentCost: null });
  });

  it('alias version changes require explicit reprice and keep the raw model separate', async () => {
    writePhase0Source(home, 'claudeCode'); shadow.register(scopeFor('claudeCode')); const first = certified(await observed('claudeCode'), [100]);
    shadow.ingest('alias-first', first, PHASE0_DEVICE); const aliasBasis = basis(); aliasBasis.aliases[PHASE0_MODEL] = 'phase0-corrected-model';
    const changedAlias = changed(first, { parent: first.generationId, basis: aliasBasis });
    expect(shadow.ingest('alias-implicit', changedAlias, PHASE0_DEVICE).code).toBe('EXPLICIT_REPRICE_REQUIRED');
    shadow.repriceForOwner('alias-explicit', changedAlias, 'owner'); expect(shadow.view()[0].modelName).toBe('phase0-corrected-model');
    expect(changedAlias.observations[0].event.modelName).toBe(PHASE0_MODEL);
  });

  it('only an explicit complete replacement removes scoped records; rollback restores prior generation and revoke retains history', async () => {
    writePhase0Source(home, 'claudeCode', { count: 2 }); shadow.register(scopeFor('claudeCode'));
    const first = certified(await observed('claudeCode'), [100, 100]); shadow.ingest('first', first, PHASE0_DEVICE);
    const remove = certified(changed(first, { parent: first.generationId, observations: first.observations.slice(0, 1),
      removedAnchors: [first.observations[1].nativeAnchor!] }), [100]);
    expect(shadow.ingest('missing-removal-proof', changed(remove, { removedAnchors: [] }), PHASE0_DEVICE).code).toBe('REMOVAL_SCOPE_MISMATCH');
    const invalid = changed(remove, { operation: 'observe' });
    // Certificate is about the snapshot/observations, never about a client operation flag.
    expect(shadow.ingest('implicit-removal', invalid, PHASE0_DEVICE).code).toBe('EXPLICIT_SESSION_REPLACEMENT_REQUIRED');
    shadow.ingest('explicit-removal', remove, PHASE0_DEVICE); expect(totalInput()).toBe(100);
    shadow.rollbackRevision(remove.generationId); expect(totalInput()).toBe(200);
    shadow.revoke(PHASE0_DEVICE); expect(totalInput()).toBe(200);
    expect(() => shadow.ingest('revoked-new-batch', first, PHASE0_DEVICE)).toThrow('DEVICE_REVOKED');
    expect(() => shadow.ingest('first', first, PHASE0_DEVICE)).toThrow('DEVICE_REVOKED');
  });

  it('an explicitly certified empty generation tombstones only its own session, and rollback reveals its ancestor', async () => {
    writePhase0Source(home, 'claudeCode'); const first = certified(await observed('claudeCode'), [100]); shadow.register(first.scope);
    shadow.ingest('first', first, PHASE0_DEVICE);
    const empty = certified(changed(first, { parent: first.generationId, observations: [], removedAnchors: [first.observations[0].nativeAnchor!] }), []);
    shadow.ingest('explicit-empty', empty, PHASE0_DEVICE); expect(totalInput()).toBe(0);
    shadow.rollbackRevision(empty.generationId); expect(totalInput()).toBe(100);
    expect(shadow.ingest('replay-rolled-empty', empty, PHASE0_DEVICE).code).toBe('ROLLED_BACK_GENERATION'); expect(totalInput()).toBe(100);
  });

  it.each(['partial', 'unavailable', 'failed'] as const)('%s empty scan cannot clear old data', async status => {
    writePhase0Source(home, 'codex'); shadow.register(scopeFor('codex')); const first = certified(await observed('codex'), [100]);
    shadow.ingest('first', first, PHASE0_DEVICE);
    const value = changed(first, { parent: first.generationId, observations: [], evidence: { ...first.evidence, status } });
    expect(shadow.ingest('empty-' + status, value, PHASE0_DEVICE).status).toBe('quarantined'); expect(totalInput()).toBe(100);
  });
});

describe('Phase 0B D: statistical parity through real v1 import and the unified shadow view', () => {
  it('CommandCode peak/off-peak model, project and daily totals match through legacy adoption', async () => {
    writePhase0Source(home, 'commandcode', { model: 'deepseek-v4-pro', cost: .2, at: Date.parse('2026-10-15T01:00:00Z') });
    const initial = phase0Export(home), offPeak = { ...initial.events[0], eventId: hash('off-peak'), timestampMs: PHASE0_AT };
    const bundle = phase0Rehash({ ...initial, events: [...initial.events, offPeak], prices: { 'deepseek-v4-pro': PHASE0_PRICE } });
    const receipt = phase0Import(bundle, legacyPath); shadow.migrate(legacyPath);
    const legacy = loadImportedEvents([], new Map(), {}, legacyPath).events.map(applyCommandCodeQuota);
    const snapshot = await observed('commandcode'), price = basis(); price.rates['deepseek-v4-pro'] = PHASE0_PRICE;
    const value = certified(changed(snapshot, { basis: price, observations: bundle.events.map(event => ({ event, nativeAnchor: event.eventId })) }), [100, 100]);
    shadow.register(value.scope); adoptAll(bundle, receipt.id, value); shadow.ingest('peak-adopt', value, PHASE0_DEVICE);
    const summary = (rows: typeof legacy) => summarizeUsageEvents(rows, home, new Map(), PHASE0_AT);
    expect(comparable(summary(shadow.view()))).toEqual(comparable(summary(legacy)));
    const result = summary(shadow.view()); expect(result.costs.totalCost).toBeCloseTo(.6, 10);
    expect(result.models[0].billing?.peak?.cost).toBeCloseTo(.4, 10); expect(result.models[0].billing?.offPeak?.cost).toBeCloseTo(.2, 10);
  });
  it('7d/30d/all, all token categories, sessions, costs, model/project/peak detail and mappings match without double reads', async () => {
    writePhase0Home(home); const original = phase0Export(home);
    const events = [PHASE0_AT, PHASE0_NOW - 15 * 86_400_000, PHASE0_NOW - 45 * 86_400_000].flatMap((at, group) => original.events.map(event => ({ ...event,
      eventId: hash([group, event.eventId]), timestampMs: at, cacheCreationTokens: 5, reasoningTokens: 3 })));
    const bundle = phase0Rehash({ ...original, events }), receipt = phase0Import(bundle, legacyPath);
    phase0Import(phase0Rehash({ ...bundle, exportId: randomUUID() }), legacyPath); shadow.migrate(legacyPath);
    const legacy = loadImportedEvents([], new Map(), {}, legacyPath).events.map(applyCommandCodeQuota);
    const summarize = (rows: typeof legacy, range: '7d' | '30d' | 'all') => {
      const window = dateWindow(range, PHASE0_NOW, rows.map(row => row.dateKey).sort()[0]);
      return summarizeUsageEvents(rows.filter(row => row.dateKey >= window.from && row.dateKey <= window.to), home, new Map(), PHASE0_AT, window);
    };
    const assertParity = () => {
      for (const [range, groups] of [['7d', 1], ['30d', 2], ['all', 3]] as const) {
        const expected = summarize(legacy, range), actual = summarize(shadow.view(), range);
        expect(comparable(actual)).toEqual(comparable(expected));
        expect(actual.totals).toMatchObject({ inputTokens: 700 * groups, outputTokens: 140 * groups, cacheReadTokens: 70 * groups,
          cacheCreationTokens: 35 * groups, reasoningTokens: 21 * groups, totalTokens: 966 * groups, sessionCount: 7 });
        expect(actual.costs.totalCost).toBeCloseTo(.001162 * groups, 10);
      }
    };
    assertParity();
    const store = new ImportStore(legacyPath); const batches = store.batches().reverse(); store.close();
    for (const source of TRANSFER_SOURCES) {
      const initial = await observed(source), observations = bundle.events.filter(event => event.source === source).map(event => ({ event,
        nativeAnchor: source === 'codex' ? undefined : event.eventId }));
      const value = certified(changed(initial, { observations }), [100, 100, 100]); shadow.register(value.scope);
      for (const batch of batches) adoptAll(batch.bundle, batch.receipt.id, value);
      shadow.ingest('unified-' + source, value, PHASE0_DEVICE);
    }
    shadow.switchProjection(); assertParity(); expect(shadow.view()).toHaveLength(21);
    expect(shadow.db.prepare('SELECT switched FROM phase0b_meta').get()!.switched).toBe(1);
    const before = shadow.dump(); shadow.rebuild(); expect(shadow.dump()).toEqual(before); assertParity();
    shadow.rollbackLegacy(receipt.id); assertParity();
  });

  it('manual mappings and native priority remain identical to the current loader', async () => {
    writePhase0Pricing(home); writePhase0Source(home, 'claudeCode'); const bundle = phase0Export(home), native = collectImportContext(home);
    const target = { ...native.events[0], projectKey: 'mapped-target', projectName: 'Mapped project', sessionId: 'target-session', eventId: hash('target') };
    const mappings = { [bundle.events[0].projectKey]: target.projectKey }, context = { ...phase0Context(), events: [target] };
    const preview = previewImport(bundle, mappings, { context, storePath: legacyPath }); commitImport(preview.previewId, { context, storePath: legacyPath });
    shadow.migrate(legacyPath);
    const expected = loadImportedEvents([target], new Map(), {}, legacyPath).events.map(applyCommandCodeQuota);
    const actual = shadow.view([target]).filter(event => event.eventId !== target.eventId);
    expect(actual).toEqual(expected); expect(actual[0].projectKey).toBe('mapped-target'); expect(actual[0].projectName).toBe('Mapped project');
    const withNative = shadow.view(native.events, native.pricing, native.aliases);
    expect(withNative).toHaveLength(1); expect(withNative[0].inputTokens).toBe(100);
    const candidate = certified(changed(await observed('claudeCode'), { mappings }), [100]); shadow.register(candidate.scope);
    const batches = new ImportStore(legacyPath); const receipt = batches.receipts()[0]; batches.close();
    adoptAll(bundle, receipt.id, candidate); shadow.ingest('mapped-adoption', candidate, PHASE0_DEVICE);
    expect(shadow.view([target]).find(event => event.eventId !== target.eventId)).toMatchObject({ projectKey: 'mapped-target', projectName: 'Mapped project', cost: expected[0].cost });
    expect(shadow.view(native.events, native.pricing, native.aliases)).toHaveLength(1);
  });
});
