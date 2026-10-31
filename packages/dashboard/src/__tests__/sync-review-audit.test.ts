import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CompatibleSyncService } from '../adapters/local/imports/sync/legacy';
import { makeManifest, syncScopeId } from '../adapters/local/imports/sync/contract';
import { hash } from '../adapters/local/imports/identity';
import { auditAcceptedReviews, auditReport } from '../sync/review-audit';
import { runMaintenance } from '../sync/maintenance';
import { fromEvents } from './phase1/fixtures';
import type { SyncHeader, SyncRecord, SyncScope } from '../domain/sync';
import type { TransferEvent } from '../domain';

const OWNER = { role: 'owner' as const, subject: 'owner-test', reason: 'Review audit fixture' };
const DEVICE = { role: 'device' as const, deviceId: '02421821-b6f6-4292-8271-9546f7d65ddd' };

function event(sessionId: string, id: string, at: number, input = 100): TransferEvent {
  return { eventId: hash([sessionId, id]), source: 'antigravity', sessionId, timestampMs: at,
    modelName: 'test-model', projectKey: 'test', projectName: 'Test', workspacePath: 'D:\\Test',
    inputTokens: input, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0 };
}

function seedAcceptedReview(service: CompatibleSyncService, scope: SyncScope, parent: SyncHeader, candidate: ReturnType<typeof fromEvents>, options: { code?: string; alterRange?: boolean } = {}) {
  let header = candidate.header;
  if (options.alterRange) {
    const { generationId: _generation, manifestHash: _manifest, ...body } = header.manifest;
    const manifest = makeManifest({ ...body, ranges: body.ranges.map(range => range.commitment
      ? { ...range, commitment: { ...range.commitment, count: 0 } }
      : range.previous ? { ...range, previous: { ...range.previous, retainedRoot: '0'.repeat(64) } } : range) });
    header = { ...header, manifest };
  }
  const scopeId = syncScopeId(scope), manifest = header.manifest;
  service.db.prepare('INSERT INTO sync_manifests VALUES(?,?,?,?)').run(manifest.manifestHash, scopeId, manifest.generationId, JSON.stringify(header));
  const review = service.db.prepare('INSERT INTO sync_reviews(scope_id,manifest_id,code,header_json,created_at,proposal_hash) VALUES(?,?,?,?,?,?)')
    .run(scopeId, manifest.manifestHash, options.code ?? 'PREFIX_LOST', JSON.stringify(header), 1, hash(['proposal', manifest.manifestHash]));
  const observation = service.db.prepare('INSERT OR IGNORE INTO sync_observations VALUES(?,?,?,?,?)');
  const member = service.db.prepare('INSERT INTO sync_review_members VALUES(?,?,?)');
  candidate.records.forEach((record, position) => {
    const id = hash(record);
    observation.run(id, JSON.stringify(record), record.event.timestampMs, record.event.source, record.event.sessionId);
    member.run(review.lastInsertRowid, position, id);
  });
  const tokenTotal = candidate.records.reduce((sum, record) => sum + record.event.inputTokens + record.event.outputTokens, 0);
  service.db.prepare('INSERT INTO sync_generations(id,scope_id,parent_id,manifest_id,basis_json,mappings_json,token_total) VALUES(?,?,?,?,?,?,?)')
    .run(manifest.generationId, scopeId, parent.manifest.generationId, manifest.manifestHash, JSON.stringify(header.basis), JSON.stringify(header.mappings), tokenTotal);
  service.db.prepare('UPDATE sync_scopes SET head_manifest=?,head_generation=?,visible_generation=?,fenced=0,token_total=? WHERE scope_id=?')
    .run(manifest.manifestHash, manifest.generationId, manifest.generationId, tokenTotal, scopeId);
  const receipt = { batchId: header.batchId, payloadHash: hash(header), generationId: manifest.generationId,
    manifestHash: manifest.manifestHash, dataRevision: service.revision(), status: 'committed', outcome: 'updated', code: 'owner-reviewed' };
  service.db.prepare('INSERT INTO sync_receipts VALUES(?,?,?,?)').run(scope.deviceId, header.batchId, hash(header), JSON.stringify(receipt));
  service.db.prepare('INSERT INTO sync_receipt_clock VALUES(?,?,?)').run(scope.deviceId, header.batchId, Date.now());
  service.db.prepare('INSERT INTO sync_review_resolutions VALUES(?,?)').run(review.lastInsertRowid,
    JSON.stringify({ actor: OWNER, disposition: 'accepted-successor', committedSuccessor: manifest.manifestHash }));
  return { reviewId: Number(review.lastInsertRowid), header, manifest, records: candidate.records };
}

function seedLegacyMember(service: CompatibleSyncService, scope: SyncScope, record: SyncRecord) {
  const observation = hash(record);
  service.db.prepare('INSERT INTO sync_observations VALUES(?,?,?,?,?)').run(observation, JSON.stringify(record), record.event.timestampMs, record.event.source, record.event.sessionId);
  service.db.prepare('INSERT INTO sync_legacy_batches VALUES(?,?,?,?,?,?,?,?)').run('legacy-audit', 1, 'checksum', 'immutable', 'active', '{}',
    JSON.stringify({ device: { id: scope.deviceId, label: 'legacy' } }), '{}');
  service.db.prepare('INSERT INTO sync_legacy_members VALUES(?,?,?,?,?,?)').run('legacy-audit', 0, observation, 'canonical', 'variant', 'test');
}

describe('accepted review historical replay', () => {
  let dir: string, service: CompatibleSyncService, scope: SyncScope, baseline: SyncHeader;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'incept-review-audit-'));
    service = new CompatibleSyncService(join(dir, 'sync.db'));
    scope = { deviceId: DEVICE.deviceId, source: 'antigravity', sessionId: 'audit-session', originId: 'audit-origin' };
    service.register(scope, 'audit scope', OWNER);
    const first = fromEvents([event(scope.sessionId, 'a', 1793000000000), event(scope.sessionId, 'b', 1793000001000)], scope, undefined, 'baseline');
    service.ingest(first.header, first.records, DEVICE);
    baseline = first.header;
  });

  afterEach(() => { service.close(); rmSync(dir, { recursive: true, force: true }); });

  it('replays against the historical parent even after the current head advanced', async () => {
    const candidate = fromEvents([event(scope.sessionId, 'a', 1793000000000), event(scope.sessionId, 'b', 1793000001000), event(scope.sessionId, 'c', 1793000002000)], scope, baseline, 'review-candidate');
    const seeded = seedAcceptedReview(service, scope, baseline, candidate);
    const rows = auditAcceptedReviews(service.db, { id: seeded.reviewId });
    expect(rows).toHaveLength(1);
    expect(rows[0].result).toBe('pass');
    expect(rows[0].members).toMatchObject({ expected: 3, observed: 3, contiguous: true, sequenceHash: true });
    expect(rows[0].stages.range).toEqual({ ok: true });
    expect(rows[0].stages.records).toEqual({ ok: true });
    expect(rows[0].currentHead.recordCount).toBe(3);
    expect(auditReport(rows).ok).toBe(true);
    const cli = await runMaintenance(['audit-accepted-reviews', `--source=${service.path}`], {});
    expect(cli).toMatchObject({ ok: true, summary: { total: 1, pass: 1, fail: 0, unprovable: 0 } });
  });

  it('reports a range proof failure but keeps the record replay result separate', () => {
    const candidate = fromEvents([event(scope.sessionId, 'a', 1793000000000), event(scope.sessionId, 'b', 1793000001000), event(scope.sessionId, 'c', 1793000002000)], scope, baseline, 'bad-range');
    const seeded = seedAcceptedReview(service, scope, baseline, candidate, { alterRange: true });
    const rows = auditAcceptedReviews(service.db, { id: seeded.reviewId });
    expect(rows[0].result).toBe('fail');
    expect(rows[0].resultCode).toBe('PREFIX_LOST');
    expect(rows[0].stages.range).toEqual({ ok: false, code: 'PREFIX_LOST' });
    expect(rows[0].stages.records).toEqual({ ok: true });
    expect(auditReport(rows).ok).toBe(false);
  });

  it('marks missing member evidence as unprovable instead of passing', () => {
    const candidate = fromEvents([event(scope.sessionId, 'a', 1793000000000), event(scope.sessionId, 'b', 1793000001000), event(scope.sessionId, 'c', 1793000002000)], scope, baseline, 'missing-member');
    const seeded = seedAcceptedReview(service, scope, baseline, candidate);
    const missing = seeded.records[1];
    service.db.prepare('DELETE FROM sync_observations WHERE id=?').run(hash(missing));
    const rows = auditAcceptedReviews(service.db, { id: seeded.reviewId });
    expect(rows[0].result).toBe('unprovable');
    expect(rows[0].unprovable).toBe('MISSING_REVIEW_MEMBERS');
    expect(rows[0].members.observed).toBe(2);
  });

  it('reports a missing expected v1 adoption as a finding', () => {
    const legacy = fromEvents([event(scope.sessionId, 'legacy', 1792999999000)], scope, undefined, 'legacy').records[0];
    seedLegacyMember(service, scope, legacy);
    const candidate = fromEvents([event(scope.sessionId, 'a', 1793000000000), event(scope.sessionId, 'b', 1793000001000), event(scope.sessionId, 'c', 1793000002000)], scope, baseline, 'missing-adoption');
    const seeded = seedAcceptedReview(service, scope, baseline, candidate);
    const rows = auditAcceptedReviews(service.db, { id: seeded.reviewId });
    expect(rows[0].result).toBe('fail');
    expect(rows[0].resultCode).toBe('V1_ADOPTION_REVIEW_REQUIRED');
    expect(rows[0].adoption.missing).toBe(1);
  });
});
