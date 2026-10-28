import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CompatibleSyncService } from '../adapters/local/imports/sync/legacy';
import { fromEvents } from './phase1/fixtures';
import { hash } from '../adapters/local/imports/identity';
import type { SyncHeader } from '../domain/sync';
import type { TransferEvent } from '../domain';

const SESSIONS = [
  { id: 1, sessionId: 'b099a18e-13f1-47f3-bfc3-7bfa77bca914' },
  { id: 2, sessionId: '21c61e02-664d-4541-b404-832dd624b686' },
  { id: 3, sessionId: 'ada318b0-10e0-48db-963e-5616044a2ea8' },
  { id: 4, sessionId: 'fcdd7add-659f-4f00-bc3e-ef32b5d21269' },
];

function makeEvent(sessionId: string, id: string, timestampMs: number, input = 100, output = 50): TransferEvent {
  return {
    eventId: hash([sessionId, id]),
    source: 'antigravity',
    sessionId,
    timestampMs,
    modelName: 'claude-3-5-sonnet',
    projectKey: 'incept',
    projectName: 'Incept',
    workspacePath: 'D:\\Incept',
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
  };
}

describe('All 4 Antigravity Sessions Protocol-Level Recovery', () => {
  let tempDir: string;
  let serviceDbPath: string;
  let service: CompatibleSyncService | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'incept-4ag-recovery-'));
    serviceDbPath = join(tempDir, 'sync.db');

    service = new CompatibleSyncService(serviceDbPath);
    const owner = { role: 'owner' as const, subject: 'owner-cli', reason: 'Initial seed' };
    const device = { role: 'device' as const, deviceId: '02421821-b6f6-4292-8271-9546f7d65ddd' };

    // Set baseline revision to 597
    service.db.prepare('UPDATE sync_meta SET data_revision = 597 WHERE id = 1').run();

    // Register and ingest 1 initial commit for each of the 4 scopes
    for (const s of SESSIONS) {
      const scope = {
        deviceId: device.deviceId,
        source: 'antigravity' as const,
        sessionId: s.sessionId,
        originId: 'origin-' + s.id,
      };

      service.register(scope, 'Antigravity Session ' + s.id, owner);
      const initEvent = makeEvent(s.sessionId, 'init-' + s.id, 1792500000000 + s.id * 1000, 500, 200);
      const initCandidate = fromEvents([initEvent], scope, undefined, 'init-batch-' + s.id);

      service.begin(initCandidate.header, device);
      service.stage(device.deviceId, initCandidate.header.batchId, 0, initCandidate.records, device);
      service.commit(device.deviceId, initCandidate.header.batchId, device);

      // Create a pending review simulating PREFIX_LOST
      const scopeId = hash(['incept-scope/1', scope.deviceId, scope.source, scope.sessionId, scope.originId]);
      const heldHeader: SyncHeader = {
        ...initCandidate.header,
        batchId: 'held-batch-' + s.id,
        manifest: {
          ...initCandidate.header.manifest,
          manifestHash: hash(['held-manifest', s.id]),
        },
      };

      service.db.prepare(
        'INSERT INTO sync_reviews(id, scope_id, manifest_id, code, header_json, created_at, proposal_hash) VALUES(?,?,?,?,?,?,?)'
      ).run(
        s.id,
        scopeId,
        heldHeader.manifest.manifestHash,
        'PREFIX_LOST',
        JSON.stringify(heldHeader),
        1792550000000 + s.id * 1000,
        hash(['proposal', s.id])
      );
    }

    // Reset revision to 597 for the test start
    service.db.prepare('UPDATE sync_meta SET data_revision = 597 WHERE id = 1').run();
  });

  afterEach(() => {
    service?.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('freezes review acceptance at the store boundary during Phase 0A', () => {
    if (!service) throw new Error('Service not initialized');
    const owner = { role: 'owner' as const, subject: 'owner-cli', reason: 'Authorize compressed prefix' };
    const device = { role: 'device' as const, deviceId: '02421821-b6f6-4292-8271-9546f7d65ddd' };

    // Populate sync_review_members for all 4 mocked reviews so acceptReview has records to commit
    for (const s of SESSIONS) {
      const scope = {
        deviceId: device.deviceId,
        source: 'antigravity' as const,
        sessionId: s.sessionId,
        originId: 'origin-' + s.id,
      };
      const initEvent = makeEvent(s.sessionId, 'init-' + s.id, 1792500000000 + s.id * 1000, 500, 200);
      const heldEvent = makeEvent(s.sessionId, 'held-' + s.id, 1792550000000 + s.id * 1000, 600, 300);
      const initCandidate = fromEvents([initEvent], scope, undefined, 'init-batch-' + s.id);
      const cand = fromEvents([initEvent, heldEvent], scope, initCandidate.header, 'held-batch-' + s.id);

      // Update the mocked review to a realistic proposal: manifest id matches its header and its parent is the committed head
      service.db.prepare('UPDATE sync_reviews SET header_json=?, manifest_id=? WHERE id=?').run(JSON.stringify(cand.header), cand.header.manifest.manifestHash, s.id);

      for (let pos = 0; pos < cand.records.length; pos++) {
        const rec = cand.records[pos];
        const obsKey = hash(rec);
        service.db.prepare('INSERT OR IGNORE INTO sync_observations VALUES(?,?,?,?,?)').run(obsKey, JSON.stringify(rec), rec.event.timestampMs, rec.event.source, rec.event.sessionId);
        service.db.prepare('INSERT INTO sync_review_members VALUES(?,?,?)').run(s.id, pos, obsKey);
      }
    }

    // The store-level guard must reject every caller while Phase 0A is active.
    for (const s of SESSIONS) {
      let error: unknown;
      try { service.acceptReview(s.id, owner); } catch (caught) { error = caught; }
      expect((error as { code?: string } | undefined)?.code).toBe('REVIEW_ACCEPTANCE_FROZEN');
    }

    // Unknown codes are refused by the same empty allowlist.
    service.db.prepare("UPDATE sync_reviews SET code='UNKNOWN_REVIEW_CODE' WHERE id=1").run();
    let unknownError: unknown;
    try { service.acceptReview(1, owner); } catch (caught) { unknownError = caught; }
    expect((unknownError as { code?: string } | undefined)?.code).toBe('REVIEW_ACCEPTANCE_FROZEN');

    expect(service.revision()).toBe(597);
    expect(service.db.prepare('SELECT COUNT(*) n FROM sync_review_resolutions').get()).toMatchObject({ n: 0 });
    expect(service.db.prepare("SELECT COUNT(*) n FROM sync_receipts WHERE batch_id LIKE 'held-batch-%'").get()).toMatchObject({ n: 0 });
  });

  it('resolves all 4 reviews and safely commits subsequent candidate delta batches', () => {
    if (!service) throw new Error('Service not initialized');
    const owner = { role: 'owner' as const, subject: 'owner-cli', reason: 'Authorize compressed prefix' };
    const device = { role: 'device' as const, deviceId: '02421821-b6f6-4292-8271-9546f7d65ddd' };

    // 1. Initial State Assertions
    expect(service.revision()).toBe(597);
    expect(service.db.prepare('SELECT COUNT(*) n FROM sync_reviews').get()).toMatchObject({ n: 4 });
    expect(service.db.prepare('SELECT COUNT(*) n FROM sync_review_resolutions').get()).toMatchObject({ n: 0 });

    // 2. Resolve all 4 reviews monotonically
    for (let i = 0; i < SESSIONS.length; i++) {
      const s = SESSIONS[i];
      service.resolveReview(s.id, owner);
      expect(service.revision()).toBe(598 + i);
    }
    expect(service.revision()).toBe(601);
    expect(service.db.prepare('SELECT COUNT(*) n FROM sync_review_resolutions').get()).toMatchObject({ n: 4 });

    // 3. Incrementally commit delta records for each of the 4 scopes
    for (let i = 0; i < SESSIONS.length; i++) {
      const s = SESSIONS[i];
      const originRow = service.db.prepare("SELECT scope_id, scope_json FROM sync_origins WHERE json_extract(scope_json, '$.sessionId') = ?").get(s.sessionId) as any;
      const scope = JSON.parse(originRow.scope_json);
      const scopeId = originRow.scope_id;

      const currentScope = service.db.prepare('SELECT head_manifest, visible_generation, token_total FROM sync_scopes WHERE scope_id = ?').get(scopeId) as any;
      const parentGen = service.db.prepare('SELECT header_json FROM sync_manifests WHERE id = ?').get(currentScope.head_manifest) as any;
      const parentHeader = JSON.parse(parentGen.header_json);

      // Build valid incremental candidate (containing retained parent record + new appended record)
      const initEvent = makeEvent(s.sessionId, 'init-' + s.id, 1792500000000 + s.id * 1000, 500, 200);
      const deltaEvent = makeEvent(s.sessionId, 'delta-' + s.id, 1792600000000 + i * 1000, 1000, 500);
      const candidate = fromEvents([initEvent, deltaEvent], scope, parentHeader, 'delta-batch-' + s.id);

      // Begin, stage, commit
      expect(service.begin(candidate.header, device).nextOffset).toBe(0);
      expect(service.stage(scope.deviceId, candidate.header.batchId, 0, candidate.records, device)).toBe(2);
      const receipt = service.commit(scope.deviceId, candidate.header.batchId, device);
      console.log('Receipt for session ' + s.sessionId + ':', receipt);
      expect(receipt.status).toBe('committed');
      expect(receipt.outcome).toBe('updated');
      expect(receipt.dataRevision).toBe(602 + i);

      // Verify scope updated
      const updatedScope = service.db.prepare('SELECT head_manifest, token_total FROM sync_scopes WHERE scope_id = ?').get(scopeId) as any;
      expect(updatedScope.head_manifest).toBe(candidate.header.manifest.manifestHash);
      expect(updatedScope.token_total).toBe(currentScope.token_total + 1500);
    }

    // 4. Final assertions
    expect(service.revision()).toBe(605);
    expect(service.db.prepare('SELECT COUNT(*) n FROM sync_receipts').get()).toMatchObject({ n: 8 }); // 4 init + 4 delta
    expect(service.db.prepare('SELECT COUNT(*) n FROM sync_current').get()).toMatchObject({ n: 8 }); // 4 init + 4 delta
    expect(service.db.prepare('PRAGMA integrity_check').get()).toMatchObject({ integrity_check: 'ok' });
  });
});
