import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { UsageIdentityIndex } from '../adapters/local/usage-identity-index';
import { hash } from '../adapters/local/imports/identity';
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
  let index = new UsageIdentityIndex(db);
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
    const index = new UsageIdentityIndex(db);
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
  } finally { db.close(); }
});

it('rolls back index and audit together when persistence fails', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const index = new UsageIdentityIndex(db);
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
    .toMatchObject({ status: 'partial', reasons: ['V2_RANGE_EVIDENCE_MISSING'] });
  expect(coverageFromV2({ ...manifest, reader: 'aiusage' }))
    .toMatchObject({ status: 'partial', reasons: ['V2_USAGE_COVERAGE_UNPROVEN'] });
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
    expect(backfillUsageIdentity(source, output, 1)).toMatchObject({ complete: true, mapped: 0, conflicts: 2 });

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
    expect(await runMaintenance(['backfill-usage-identity', '--source=' + source, '--output=' + output, '--limit=1'], {}))
      .toMatchObject({ revision, complete: false, processed: 1 });
    expect(backfillUsageIdentity(source, output, 1)).toMatchObject({ revision, complete: true, processed: 1, mapped: 2 });
    expect(backfillUsageIdentity(source, output, 1)).toMatchObject({ complete: true, processed: 0, mapped: 2 });
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
