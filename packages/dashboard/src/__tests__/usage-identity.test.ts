import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { UsageIdentityIndex } from '../adapters/local/usage-identity-index';
import { hash } from '../adapters/local/imports/identity';
import { makeManifest, syncScopeId } from '../adapters/local/imports/sync/contract';
import { CompatibleSyncService } from '../adapters/local/imports/sync/legacy';
import { coverageFromV2 } from '../sync/usage-coverage';
import { backfillUsageIdentity } from '../sync/usage-identity-backfill';
import { runMaintenance } from '../sync/maintenance';
import type { TransferEvent } from '../domain';
import { fromEvents } from './fixtures/events';

const response = { kind: 'response/1', value: 'response-a' } as const;
const message = { kind: 'message/1', value: 'message-a' } as const;
const evidence = { actor: 'capture', reference: 'observation-a' };
const owner = { role: 'owner', subject: 'test', reason: 'exercise backfill' } as const;
const scope = { deviceId: '02421821-b6f6-4292-8271-9546f7d65ddd', source: 'antigravity',
  sessionId: 'usage-session', originId: 'usage-origin' } as const;

let directory: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'incept-usage-identity-')); });
afterEach(() => { rmSync(directory, { recursive: true, force: true }); });

it('keeps the allocated identity when a preferred alias appears and audits only changed bindings', () => {
  const path = join(directory, 'identity.db');
  let db = new DatabaseSync(path);
  let index = UsageIdentityIndex.initialize(db);
  const initial = index.resolve('origin-a', [response], evidence);
  expect(initial.status).toBe('resolved');
  db.close();
  db = new DatabaseSync(path);
  try {
    index = new UsageIdentityIndex(db);
    expect(index.resolve('origin-a', [message, response], evidence)).toEqual(initial);
    expect(index.resolve('origin-a', [response, message], evidence)).toEqual(initial);
    expect(index.resolve('origin-b', [response], evidence)).not.toEqual(initial);
    expect(db.prepare('SELECT COUNT(*) n FROM usage_identity_audit').get()?.n).toBe(3);
  } finally { db.close(); }
});

it('leaves a conflict untouched and applies an audited correction with the expected binding', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const index = UsageIdentityIndex.initialize(db);
    index.resolve('origin', [response], evidence);
    index.resolve('origin', [message], evidence);
    const previous = index.lookup('origin', response)!, next = index.lookup('origin', message)!;
    expect(index.resolve('origin', [response, message], evidence)).toEqual({ status: 'conflict', eventIds: [previous, next].sort() });
    const correction = { origin: 'origin', anchor: response, expectedEventId: previous,
      eventId: next, evidence: { actor: 'owner', reference: 'review-1' } };
    expect(() => index.correctBinding({ ...correction, expectedEventId: 'stale' })).toThrow('IDENTITY_BINDING_CHANGED');
    expect(index.correctBinding(correction)).toBe(true);
    expect(index.correctBinding(correction)).toBe(false);
    expect(index.lookup('origin', response)).toBe(next);
    expect(db.prepare('SELECT previous_event_id,event_id,actor,evidence FROM usage_identity_audit ORDER BY id DESC LIMIT 1').get())
      .toEqual({ previous_event_id: previous, event_id: next, actor: 'owner', evidence: 'review-1' });
    expect(db.prepare('SELECT COUNT(*) n FROM usage_identity_audit').get()?.n).toBe(3);
    expect(index.correctBinding({ ...correction, expectedEventId: next, eventId: 'split-id', split: true })).toBe(true);
    expect(index.lookup('origin', response)).toBe('split-id');
    expect(index.lookup('origin', message)).toBe(next);
    expect(() => index.resolve(' ', [response], evidence)).toThrow('IDENTITY_EVIDENCE_REQUIRED');
    expect(() => index.correctBinding({ ...correction, anchor: { ...response, value: ' ' } })).toThrow('IDENTITY_EVIDENCE_REQUIRED');
  } finally { db.close(); }
});

it('rolls back index and audit together when persistence fails', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const index = UsageIdentityIndex.initialize(db);
    db.exec(`CREATE TRIGGER fail_identity_audit BEFORE INSERT ON usage_identity_audit
      BEGIN SELECT RAISE(ABORT, 'audit failed'); END;`);
    expect(() => index.resolve('origin', [response], evidence)).toThrow('audit failed');
    expect(index.lookup('origin', response)).toBeUndefined();
    expect(db.prepare('SELECT COUNT(*) n FROM usage_events').get()?.n).toBe(0);
  } finally { db.close(); }
});

function fixture() {
  const event: TransferEvent = { eventId: hash('event-a'), source: scope.source, sessionId: scope.sessionId,
    timestampMs: 1793000000000, modelName: 'phase0-fixture-model', projectKey: 'test', projectName: 'Test',
    inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0 };
  return fromEvents([event, { ...event, eventId: hash('event-b') }], scope);
}

it('treats a legacy partial read or SQLite read without a key commitment as incomplete evidence', () => {
  const { manifest } = fixture().header;
  expect(coverageFromV2(manifest)).toMatchObject({ status: 'complete', ranges: [{ kind: 'keys', count: 2 }] });
  expect(coverageFromV2({ ...manifest, read: { ...manifest.read, status: 'partial' } }))
    .toMatchObject({ status: 'partial', ranges: [] });
  expect(coverageFromV2({ ...manifest, ranges: manifest.ranges.map(range => ({ ...range, commitment: undefined })) }))
    .toMatchObject({ status: 'partial', reasons: ['V2_RANGE_EVIDENCE_MISSING', 'V2_USAGE_KEY_COUNT_UNPROVEN'] });
  expect(coverageFromV2({ ...manifest, reader: 'aiusage' }))
    .toMatchObject({ status: 'partial', reasons: ['V2_USAGE_COVERAGE_UNPROVEN'] });
  expect(coverageFromV2({ ...manifest, read: { ...manifest.read, afterRoot: hash('changed') } }))
    .toMatchObject({ status: 'partial', ranges: [], reasons: ['V2_SNAPSHOT_PROOF_MISMATCH'] });
  expect(coverageFromV2({ ...manifest, recordCount: 3 }))
    .toMatchObject({ status: 'partial', reasons: ['V2_USAGE_KEY_COUNT_UNPROVEN'] });
});

it.each(['codex', 'claudeCode', 'geminiCli', 'deepseekHarness'] as const)(
  'carries only the source-specific coverage evidenced by a %s manifest', source => {
    const { records } = fixture();
    const origin = { ...scope, source };
    const { manifest } = fromEvents(records.map(({ event }) => ({ ...event, source })), origin).header;
    const expected = source === 'codex' || source === 'deepseekHarness' ? 'partial' : 'complete';
    expect(coverageFromV2(manifest)).toMatchObject({ status: expected,
      ranges: [{ kind: source === 'geminiCli' ? 'document' : 'log' }] });
  },
);

it('records zero-member visible rebase coverage and accepted review ancestry', () => {
  const source = join(directory, 'ledger.db'), output = join(directory, 'identity.db');
  const service = new CompatibleSyncService(source);
  try {
    const baseline = fromEvents([], scope);
    const { generationId: _generation, manifestHash: _hash, ...body } = baseline.header.manifest;
    const manifest = makeManifest({ ...body, intent: 'rebase' });
    const id = syncScopeId(scope);
    service.register(scope, 'empty scope', owner);
    service.db.prepare('INSERT INTO sync_manifests VALUES (?,?,?,?)')
      .run(manifest.manifestHash, id, manifest.generationId, JSON.stringify({ ...baseline.header, manifest }));
    service.db.prepare(`INSERT INTO sync_generations (id,scope_id,manifest_id,basis_json,mappings_json,token_total)
      VALUES (?,?,?,'{}','{}',0)`).run(manifest.generationId, id, manifest.manifestHash);
    service.db.prepare('UPDATE sync_scopes SET visible_generation=? WHERE scope_id=?').run(manifest.generationId, id);
    expect(backfillUsageIdentity(source, output, 1)).toMatchObject({ complete: true, seen: 0 });
    const db = new DatabaseSync(output, { readOnly: true });
    try {
      const coverage = db.prepare('SELECT generation,evidence_json FROM usage_ledger_coverage').get();
      expect(coverage?.generation).toBe(manifest.generationId);
      expect(JSON.parse(String(coverage?.evidence_json))).toMatchObject({ status: 'complete', ranges: [{ count: 0 }] });
    } finally { db.close(); }

    const successor = makeManifest({ ...body, intent: 'rebase', parent: { generationId: manifest.generationId, manifestHash: manifest.manifestHash } });
    service.db.prepare('INSERT INTO sync_manifests VALUES (?,?,?,?)')
      .run(successor.manifestHash, id, successor.generationId, JSON.stringify({ ...baseline.header, manifest: successor }));
    service.db.prepare(`INSERT INTO sync_generations (id,scope_id,parent_id,manifest_id,basis_json,mappings_json,token_total)
      VALUES (?,?,?,?,'{}','{}',0)`).run(successor.generationId, id, manifest.generationId, successor.manifestHash);
    service.db.prepare('UPDATE sync_scopes SET visible_generation=? WHERE scope_id=?').run(successor.generationId, id);
    service.db.prepare('INSERT INTO sync_reviews VALUES (1,?,?,?,?,?,?)')
      .run(id, manifest.manifestHash, 'PREFIX_LOST', '{}', 0, 'proposal');
    service.db.prepare('INSERT INTO sync_review_resolutions VALUES (1,?)')
      .run(JSON.stringify({ disposition: 'accepted-successor', committedSuccessor: manifest.manifestHash }));
    service.db.prepare('UPDATE sync_generations SET rolled=1 WHERE id=?').run(manifest.generationId);
    service.db.exec(`
      INSERT INTO sync_observations VALUES ('legacy-observation','{}',1,'antigravity','session');
      INSERT INTO sync_legacy_batches VALUES ('active',1,'checksum','immutable','active','{}','{}','{}'),
        ('rolled-back',2,'checksum','immutable','rolled_back','{}','{}','{}');
      INSERT INTO sync_legacy_members VALUES ('active',0,'legacy-observation','canonical','variant','project'),
        ('rolled-back',0,'legacy-observation','canonical','variant','project');
      INSERT INTO sync_legacy_projection VALUES ('variant','active',0,'legacy-observation','canonical','project',1);
      INSERT INTO sync_review_members VALUES (1,0,'legacy-observation'),(1,1,'missing-observation');
    `);
    const next = join(directory, 'next.db');
    expect(backfillUsageIdentity(source, next, 1)).toMatchObject({ complete: true, seen: 0,
      history: { legacyBatches: 2, legacyMembers: 2, legacyProjection: 1, hiddenGenerations: 1,
        rolledGenerations: 1, reviews: 1, reviewMembers: 2, missingObservations: 1 } });
    const reviewed = new DatabaseSync(next, { readOnly: true });
    try {
      const coverage = reviewed.prepare('SELECT evidence_json FROM usage_ledger_coverage').get();
      expect(JSON.parse(String(coverage?.evidence_json))).toMatchObject({ status: 'partial',
        reasons: ['V2_ACCEPTED_REVIEW_IN_VISIBLE_LINEAGE'],
        acceptedReviews: [{ id: 1, code: 'PREFIX_LOST', successor: manifest.manifestHash }] });
      expect(reviewed.prepare('SELECT status FROM usage_legacy_batches WHERE id=?').get('rolled-back')?.status).toBe('rolled_back');
      expect(reviewed.prepare('SELECT projected FROM usage_legacy_members WHERE batch=?').get('rolled-back')?.projected).toBe(0);
      expect(reviewed.prepare('SELECT COUNT(*) n FROM usage_event_anchors').get()?.n).toBe(0);
    } finally { reviewed.close(); }
  } finally { service.close(); }
});

it('retains unresolved members when legacy anchors collide or are missing', () => {
  const source = join(directory, 'ledger.db'), output = join(directory, 'identity.db');
  const service = new CompatibleSyncService(source);
  try {
    const { header, records } = fixture();
    service.register(scope, 'usage scope', owner);
    service.begin(header, owner);
    service.stage(scope.deviceId, header.batchId, 0, records, owner);
    expect(service.commit(scope.deviceId, header.batchId, owner).status).toBe('committed');
    // Simulate a historical ledger whose visible members predate the anchor guarantees.
    const update = service.db.prepare(`UPDATE sync_observations SET record_json=? WHERE id=(
      SELECT observation_id FROM sync_current WHERE position=?)`);
    update.run(JSON.stringify({ ...records[1], nativeKey: records[0].nativeKey }), 1);
    expect(backfillUsageIdentity(source, output, 1)).toMatchObject({ complete: false });
    const db = new DatabaseSync(output, { readOnly: true });
    try {
      const anchor = { kind: 'native/2', value: records[0].nativeKey!.keyHash } as const;
      const index = new UsageIdentityIndex(db);
      expect(index.lookup(scope.originId, anchor)).toBeUndefined();
      expect(backfillUsageIdentity(source, output, 1)).toMatchObject({ complete: true, mapped: 0, conflicts: 2 });
      expect(index.lookup(scope.originId, anchor)).toBeUndefined();
      expect(db.prepare('SELECT members FROM usage_identity_conflicts').get()?.members).toBe(2);
      expect(db.prepare('SELECT COUNT(*) n FROM usage_event_anchors').get()?.n).toBe(0);
      expect(db.prepare('SELECT COUNT(*) n FROM usage_identity_audit').get()?.n).toBe(0);
    } finally { db.close(); }
    const writer = new DatabaseSync(output);
    try {
      const anchor = { kind: 'native/2', value: records[0].nativeKey!.keyHash } as const;
      expect(new UsageIdentityIndex(writer).resolve(scope.originId, [anchor], evidence))
        .toEqual({ status: 'unresolved-anchor', anchor });
      expect(writer.prepare('SELECT COUNT(*) n FROM usage_event_anchors').get()?.n).toBe(0);
    } finally { writer.close(); }

    update.run(JSON.stringify({ ...records[1], nativeKey: undefined }), 1);
    const next = join(directory, 'identity-next.db');
    expect(backfillUsageIdentity(source, next, 100)).toMatchObject({ complete: true, mapped: 1, unproven: 1, conflicts: 0 });
    expect(() => backfillUsageIdentity(source, output, 1)).toThrow('IDENTITY_BACKFILL_INPUT_CHANGED');
  } finally { service.close(); }
});

it('backfills in bounded batches, preserves distinct requests, and rejects a changed ledger', async () => {
  const source = join(directory, 'ledger.db'), output = join(directory, 'identity.db');
  const service = new CompatibleSyncService(source);
  try {
    const { header, records } = fixture();
    service.register(scope, 'usage scope', owner);
    service.begin(header, owner);
    service.stage(scope.deviceId, header.batchId, 0, records, owner);
    expect(service.commit(scope.deviceId, header.batchId, owner).status).toBe('committed');
    const revision = service.revision();
    await expect(runMaintenance(['backfill-usage-identity', '--source=' + source, '--output=' + output, '--limit'], {}))
      .rejects.toThrow('MISSING_LIMIT');
    expect(await runMaintenance(['backfill-usage-identity', '--source=' + source, '--output=' + output, '--limit=1'], {}))
      .toMatchObject({ revision, complete: false, processed: 1 });
    expect(backfillUsageIdentity(source, output, 1)).toMatchObject({ revision, complete: false, scanComplete: true, processed: 1, bindingsWritten: 1 });
    expect(backfillUsageIdentity(source, output, 1)).toMatchObject({ complete: true, processed: 0, mapped: 2 });
    expect(backfillUsageIdentity(source, output, 1)).toMatchObject({ complete: true, bindingsWritten: 0, mapped: 2 });
    const db = new DatabaseSync(output, { readOnly: true });
    try {
      expect(db.prepare('SELECT COUNT(DISTINCT event_id) n FROM usage_ledger_identity_disposition').get()?.n).toBe(2);
      expect(db.prepare('SELECT COUNT(*) n FROM usage_ledger_coverage').get()?.n).toBe(1);
      expect(db.prepare('SELECT COUNT(*) n FROM usage_identity_audit').get()?.n).toBe(2);
    } finally { db.close(); }
    expect(service.revision()).toBe(revision);
    service.bump();
    expect(() => backfillUsageIdentity(source, output, 1)).toThrow('IDENTITY_BACKFILL_INPUT_CHANGED');
  } finally { service.close(); }
});
