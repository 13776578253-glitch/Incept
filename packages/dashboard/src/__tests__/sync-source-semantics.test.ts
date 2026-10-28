import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CompatibleSyncService } from '../adapters/local/imports/sync/legacy';
import { makeManifest, syncScopeId } from '../adapters/local/imports/sync/contract';
import { hash } from '../adapters/local/imports/identity';
import { fromEvents } from './phase1/fixtures';
import type { SyncHeader, SyncScope } from '../domain/sync';
import type { TransferEvent } from '../domain';

const OWNER = { role: 'owner' as const, subject: 'owner-test', reason: 'Source semantics test' };
const DEVICE = { role: 'device' as const, deviceId: '02421821-b6f6-4292-8271-9546f7d65ddd' };
const BASE = 1793000000000;

function event(sessionId: string, id: string, at: number): TransferEvent {
  return { eventId: hash([sessionId, id]), source: 'antigravity', sessionId, timestampMs: at,
    modelName: 'test-model', projectKey: 'test', projectName: 'Test', workspacePath: 'D:\\Test',
    inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0 };
}

function rewrite(header: SyncHeader, mutate: (body: ReturnType<typeof manifestBody>) => ReturnType<typeof manifestBody>): SyncHeader {
  const { generationId: _generation, manifestHash: _manifest, ...body } = header.manifest;
  return { ...header, manifest: makeManifest(mutate(body)) };
}
function manifestBody(header: SyncHeader) {
  const { generationId: _generation, manifestHash: _manifest, ...body } = header.manifest;
  return body;
}

describe('Antigravity stable-key-set source semantics', () => {
  let dir: string, service: CompatibleSyncService, scope: SyncScope, baseline: SyncHeader;

  function ingest(header: SyncHeader, records: ReturnType<typeof fromEvents>['records'], batch = header.batchId) {
    const candidate = { header: { ...header, batchId: batch }, records };
    service.begin(candidate.header, DEVICE);
    service.stage(DEVICE.deviceId, candidate.header.batchId, 0, records, DEVICE);
    return service.commit(DEVICE.deviceId, candidate.header.batchId, DEVICE);
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'incept-source-semantics-'));
    service = new CompatibleSyncService(join(dir, 'sync.db'));
    scope = { deviceId: DEVICE.deviceId, source: 'antigravity', sessionId: 'semantics-session', originId: 'semantics-origin' };
    service.register(scope, 'semantics scope', OWNER);
    const first = fromEvents([event(scope.sessionId, 'a', BASE), event(scope.sessionId, 'b', BASE + 1000)], scope, undefined, 'baseline');
    expect(first.header.manifest.ranges[0].commitment?.count).toBe(2);
    ingest(first.header, first.records);
    baseline = first.header;
  });
  afterEach(() => { service.close(); rmSync(dir, { recursive: true, force: true }); });

  it('accepts an in-place metadata/root change when the usage key commitment is retained', () => {
    const child = fromEvents([event(scope.sessionId, 'a', BASE), event(scope.sessionId, 'b', BASE + 1000)], scope, baseline, 'metadata-change');
    const header = rewrite(child.header, body => ({ ...body, ranges: body.ranges.map(range => ({ ...range, envelopeRoot: hash(['metadata-envelope']) })) }));
    const receipt = ingest(header, child.records, 'metadata-change');
    expect(receipt.status).toBe('committed');
    expect(receipt.code).toBe('unchanged');
  });

  it('accepts a usage row inserted before the old order because the commitment is a set', () => {
    const child = fromEvents([event(scope.sessionId, 'c', BASE - 1000), event(scope.sessionId, 'a', BASE), event(scope.sessionId, 'b', BASE + 1000)], scope, baseline, 'prepend');
    const receipt = ingest(child.header, child.records, 'prepend');
    expect(receipt.status).toBe('committed');
    expect(receipt.code).toBe('since-enrollment');
  });

  it('returns review when an old usage record is missing and preserves the old head', () => {
    const child = fromEvents([event(scope.sessionId, 'a', BASE)], scope, baseline, 'deleted-usage');
    const receipt = ingest(child.header, child.records, 'deleted-usage');
    expect(receipt.status).toBe('review-required');
    expect(receipt.code).toBe('PREFIX_LOST');
    const scopeRow = service.db.prepare('SELECT head_manifest,token_total FROM sync_scopes WHERE scope_id=?').get(syncScopeId(scope));
    expect(scopeRow).toMatchObject({ head_manifest: baseline.manifest.manifestHash });
  });

  it('returns review when the table schema commitment changes', () => {
    const child = fromEvents([event(scope.sessionId, 'a', BASE), event(scope.sessionId, 'b', BASE + 1000)], scope, baseline, 'schema-change');
    const header = rewrite(child.header, body => ({ ...body, ranges: body.ranges.map(range => ({ ...range, commitment: { ...range.commitment!, schemaHash: 'f'.repeat(64) } })) }));
    const receipt = ingest(header, child.records, 'schema-change');
    expect(receipt.status).toBe('review-required');
    expect(receipt.code).toBe('SOURCE_REVISION_UNVERIFIED');
  });

  it('returns review when the parent predates commitments instead of silently passing', () => {
    const oldDir = mkdtempSync(join(tmpdir(), 'incept-source-legacy-'));
    const oldService = new CompatibleSyncService(join(oldDir, 'sync.db'));
    try {
      oldService.register(scope, 'legacy scope', OWNER);
      const oldBaseline = fromEvents([event(scope.sessionId, 'a', BASE), event(scope.sessionId, 'b', BASE + 1000)], scope, undefined, 'legacy-baseline');
      const legacyHeader = rewrite(oldBaseline.header, body => ({ ...body, ranges: body.ranges.map(({ commitment: _commitment, ...range }) => range) }));
      oldService.begin(legacyHeader, DEVICE);
      oldService.stage(DEVICE.deviceId, legacyHeader.batchId, 0, oldBaseline.records, DEVICE);
      expect(oldService.commit(DEVICE.deviceId, legacyHeader.batchId, DEVICE).status).toBe('committed');
      const child = fromEvents([event(scope.sessionId, 'a', BASE), event(scope.sessionId, 'b', BASE + 1000), event(scope.sessionId, 'c', BASE + 2000)], scope, legacyHeader, 'legacy-child');
      oldService.begin(child.header, DEVICE);
      oldService.stage(DEVICE.deviceId, child.header.batchId, 0, child.records, DEVICE);
      const receipt = oldService.commit(DEVICE.deviceId, child.header.batchId, DEVICE);
      expect(receipt.status).toBe('review-required');
      expect(receipt.code).toBe('UNSUPPORTED_EVIDENCE');
    } finally { oldService.close(); rmSync(oldDir, { recursive: true, force: true }); }
  });
});
