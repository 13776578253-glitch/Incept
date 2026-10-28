import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CompatibleSyncService } from '../adapters/local/imports/sync/legacy';
import { __testOnlyAllowReviewAcceptance } from '../adapters/local/imports/sync/store';
import { syncScopeId } from '../adapters/local/imports/sync/contract';
import { hash } from '../adapters/local/imports/identity';
import { fromEvents } from './phase1/fixtures';
import type { SyncHeader, SyncScope } from '../domain/sync';
import type { TransferEvent } from '../domain';

const OWNER = { role: 'owner' as const, subject: 'owner-test', reason: 'Safe acceptance test' };
const DEVICE = { role: 'device' as const, deviceId: '02421821-b6f6-4292-8271-9546f7d65ddd' };

function event(sessionId: string, id: string, at: number): TransferEvent {
  return { eventId: hash([sessionId, id]), source: 'antigravity', sessionId, timestampMs: at,
    modelName: 'test-model', projectKey: 'test', projectName: 'Test', workspacePath: 'D:\\Test',
    inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0 };
}

describe('atomic review acceptance', () => {
  let dir: string, service: CompatibleSyncService, scope: SyncScope, baseline: SyncHeader;

  function seedLegacy() {
    const record = fromEvents([event(scope.sessionId, 'legacy', 1792999999000)], scope, undefined, 'legacy').records[0];
    const observation = hash(record);
    service.db.prepare('INSERT INTO sync_observations VALUES(?,?,?,?,?)').run(observation, JSON.stringify(record), record.event.timestampMs, record.event.source, record.event.sessionId);
    service.db.prepare('INSERT INTO sync_legacy_batches VALUES(?,?,?,?,?,?,?,?)').run('legacy-accept', 1, 'checksum', 'immutable', 'active', '{}',
      JSON.stringify({ device: { id: scope.deviceId, label: 'legacy' } }), '{}');
    service.db.prepare('INSERT INTO sync_legacy_members VALUES(?,?,?,?,?,?)').run('legacy-accept', 0, observation, 'canonical', 'variant', 'test');
  }
  function clearLegacy() {
    service.db.prepare('DELETE FROM sync_legacy_members').run();
    service.db.prepare('DELETE FROM sync_legacy_batches').run();
  }
  function createReview(batch = 'review-b') {
    seedLegacy();
    const candidate = fromEvents([event(scope.sessionId, 'a', 1793000000000), event(scope.sessionId, 'b', 1793000001000), event(scope.sessionId, 'c', 1793000002000)], scope, baseline, batch);
    service.begin(candidate.header, DEVICE);
    service.stage(DEVICE.deviceId, candidate.header.batchId, 0, candidate.records, DEVICE);
    const receipt = service.commit(DEVICE.deviceId, candidate.header.batchId, DEVICE);
    expect(receipt.status).toBe('review-required');
    expect(receipt.code).toBe('V1_ADOPTION_REVIEW_REQUIRED');
    clearLegacy();
    const reviewRow = service.db.prepare('SELECT id FROM sync_reviews WHERE manifest_id=?').get(candidate.header.manifest.manifestHash) as {id:number}|undefined;
    if(!reviewRow) throw new Error('review row missing');
    const reviewId = Number(reviewRow.id);
    return { candidate, reviewId };
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'incept-review-accept-'));
    service = new CompatibleSyncService(join(dir, 'sync.db'));
    scope = { deviceId: DEVICE.deviceId, source: 'antigravity', sessionId: 'accept-session', originId: 'accept-origin' };
    service.register(scope, 'accept scope', OWNER);
    const first = fromEvents([event(scope.sessionId, 'a', 1793000000000), event(scope.sessionId, 'b', 1793000001000)], scope, undefined, 'baseline');
    service.ingest(first.header, first.records, DEVICE);
    baseline = first.header;
    __testOnlyAllowReviewAcceptance(['V1_ADOPTION_REVIEW_REQUIRED']);
  });

  afterEach(() => { __testOnlyAllowReviewAcceptance([]); service.close(); rmSync(dir, { recursive: true, force: true }); });

  it('validates and commits an accepted review once, with receipt and resolution', () => {
    const { candidate, reviewId } = createReview();
    const before = service.revision();
    const result = service.acceptReview(reviewId, OWNER);
    expect(result.ok).toBe(true);
    expect(result.committedSuccessor).toBe(candidate.header.manifest.manifestHash);
    expect(result.receipt.status).toBe('committed');
    expect(result.receipt.code).toBe('owner-reviewed');
    expect(service.revision()).toBe(before + 1);
    expect(service.db.prepare('SELECT head_manifest FROM sync_scopes WHERE scope_id=?').get(syncScopeId(scope)))
      .toMatchObject({ head_manifest: candidate.header.manifest.manifestHash });
    expect(service.db.prepare('SELECT COUNT(*) n FROM sync_current').get()).toMatchObject({ n: 3 });
    expect(service.db.prepare('SELECT COUNT(*) n FROM sync_review_resolutions WHERE review_id=?').get(reviewId)).toMatchObject({ n: 1 });
    expect(service.db.prepare("SELECT COUNT(*) n FROM sync_audit WHERE operation='review-accepted' AND reference=?").get(candidate.header.manifest.manifestHash)).toMatchObject({ n: 1 });
    let again: unknown;
    try { service.acceptReview(reviewId, OWNER); } catch (error) { again = error; }
    expect((again as { code?: string } | undefined)?.code).toBe('REVIEW_ALREADY_RESOLVED');
  });

  it('refuses an accepted review whose parent is no longer the current head', () => {
    const { reviewId } = createReview();
    const later = fromEvents([event(scope.sessionId, 'a', 1793000000000), event(scope.sessionId, 'b', 1793000001000), event(scope.sessionId, 'd', 1793000003000)], scope, baseline, 'later-valid');
    service.begin(later.header, DEVICE);
    service.stage(DEVICE.deviceId, later.header.batchId, 0, later.records, DEVICE);
    expect(service.commit(DEVICE.deviceId, later.header.batchId, DEVICE).status).toBe('committed');
    const before = service.revision();
    let error: unknown;
    try { service.acceptReview(reviewId, OWNER); } catch (caught) { error = caught; }
    expect((error as { code?: string } | undefined)?.code).toBe('REVIEW_OUT_OF_ORDER');
    expect(service.revision()).toBe(before);
    expect(service.db.prepare('SELECT COUNT(*) n FROM sync_review_resolutions WHERE review_id=?').get(reviewId)).toMatchObject({ n: 0 });
  });

  it('rolls back the generation and head when a conflicting receipt exists', () => {
    const { candidate, reviewId } = createReview();
    service.db.prepare('UPDATE sync_receipts SET payload_hash=?,receipt_json=? WHERE device_id=? AND batch_id=?')
      .run('0'.repeat(64),JSON.stringify({ batchId: candidate.header.batchId, payloadHash: '0'.repeat(64), generationId: candidate.header.manifest.generationId,
        manifestHash: candidate.header.manifest.manifestHash, dataRevision: service.revision(), status: 'committed', outcome: 'updated', code: 'owner-reviewed' }),
      DEVICE.deviceId,candidate.header.batchId);
    const before = service.revision();
    let error: unknown;
    try { service.acceptReview(reviewId, OWNER); } catch (caught) { error = caught; }
    expect((error as { code?: string } | undefined)?.code).toBe('RECEIPT_PAYLOAD_MISMATCH');
    expect(service.revision()).toBe(before);
    expect(service.db.prepare('SELECT COUNT(*) n FROM sync_generations WHERE manifest_id=?').get(candidate.header.manifest.manifestHash)).toMatchObject({ n: 0 });
    expect(service.db.prepare('SELECT COUNT(*) n FROM sync_review_resolutions WHERE review_id=?').get(reviewId)).toMatchObject({ n: 0 });
  });

  it('refuses a generation collision before writing', () => {
    const { candidate, reviewId } = createReview();
    service.db.prepare('INSERT INTO sync_generations(id,scope_id,parent_id,manifest_id,basis_json,mappings_json,token_total) VALUES(?,?,?,?,?,?,?)')
      .run(hash(['collision-generation']), hash(['sync-scope/2', scope.deviceId, scope.source, scope.sessionId]), baseline.manifest.generationId,
        candidate.header.manifest.manifestHash, '{}', '{}', 0);
    let error: unknown;
    try { service.acceptReview(reviewId, OWNER); } catch (caught) { error = caught; }
    expect((error as { code?: string } | undefined)?.code).toBe('GENERATION_COLLISION');
    expect(service.db.prepare('SELECT COUNT(*) n FROM sync_review_resolutions WHERE review_id=?').get(reviewId)).toMatchObject({ n: 0 });
  });
});
