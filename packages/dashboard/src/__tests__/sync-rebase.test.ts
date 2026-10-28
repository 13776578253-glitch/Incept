import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CompatibleSyncService } from '../adapters/local/imports/sync/legacy';
import { syncScopeId } from '../adapters/local/imports/sync/contract';
import { hash } from '../adapters/local/imports/identity';
import { runMaintenance } from '../sync/maintenance';
import { fromEvents } from './phase1/fixtures';
import type { SyncHeader, SyncScope } from '../domain/sync';
import type { TransferEvent } from '../domain';

const OWNER = { role: 'owner' as const, subject: 'owner-test', reason: 'Rebase fixture' };
const DEVICE = { role: 'device' as const, deviceId: '02421821-b6f6-4292-8271-9546f7d65ddd' };
const BASE = 1793000000000;

function event(sessionId: string, id: string, at: number): TransferEvent {
  return { eventId: hash([sessionId, id]), source: 'antigravity', sessionId, timestampMs: at,
    modelName: 'test-model', projectKey: 'test', projectName: 'Test', workspacePath: 'D:\\Test',
    inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0, reasoningTokens: 0 };
}

describe('owner-approved rebase repair', () => {
  let dir: string, service: CompatibleSyncService, scope: SyncScope, baseline: SyncHeader;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'incept-rebase-'));
    service = new CompatibleSyncService(join(dir, 'sync.db'));
    scope = { deviceId: DEVICE.deviceId, source: 'antigravity', sessionId: 'rebase-session', originId: 'rebase-origin' };
    service.register(scope, 'rebase scope', OWNER);
    const first = fromEvents([event(scope.sessionId, 'a', BASE), event(scope.sessionId, 'b', BASE + 1000)], scope, undefined, 'baseline');
    service.ingest(first.header, first.records, DEVICE);
    baseline = first.header;
  });
  afterEach(() => { service.close(); rmSync(dir, { recursive: true, force: true }); });

  it('rehearses and applies a new auditable rebase generation without patching rows', async () => {
    const fresh = fromEvents([event(scope.sessionId, 'a', BASE), event(scope.sessionId, 'b', BASE + 1000), event(scope.sessionId, 'c', BASE + 2000)], scope, undefined, 'fresh-rebase');
    const candidateFile = join(dir, 'rebase-candidate.json');
    writeFileSync(candidateFile, JSON.stringify({ header: fresh.header, records: fresh.records }));
    const env = { INCEPT_SYNC_DATABASE_FILE: service.path, INCEPT_DASHBOARD_IMPORTS_FILE: join(dir, 'legacy.db'), INCEPT_DASHBOARD_HOME: dir };
    const args = ['rebase-scope', `--candidate=${candidateFile}`, `--device=${scope.deviceId}`, `--source=${scope.source}`,
      `--session=${scope.sessionId}`, `--manifest=${fresh.header.manifest.manifestHash}`, `--expect-head=${baseline.manifest.manifestHash}`,
      '--owner-confirm=I_AM_THE_OWNER', '--reason=owner approved rebase'];
    const dry = await runMaintenance(args, env) as { dryRun: boolean; newHead: string; newGeneration: string; records: number };
    expect(dry).toMatchObject({ ok: true, dryRun: true, records: 3 });
    const applied = await runMaintenance([...args, '--apply'], env) as { dryRun: boolean; receipt: { status: string }; revision: number };
    expect(applied.dryRun).toBe(false);
    expect(applied.receipt.status).toBe('committed');
    const scopeId = syncScopeId(scope);
    const row = service.db.prepare('SELECT head_manifest,head_generation,visible_generation FROM sync_scopes WHERE scope_id=?').get(scopeId);
    expect(row).toMatchObject({ head_manifest: dry.newHead, head_generation: dry.newGeneration, visible_generation: dry.newGeneration });
    expect(service.db.prepare('SELECT COUNT(*) n FROM sync_current WHERE scope_id=?').get(scopeId)).toMatchObject({ n: 3 });
    const generation = service.db.prepare("SELECT g.parent_id,json_extract(m.header_json,'$.manifest.intent') intent FROM sync_generations g JOIN sync_manifests m ON m.id=g.manifest_id WHERE g.id=?").get(dry.newGeneration) as { parent_id: string; intent: string } | undefined;
    expect(generation).toBeTruthy();
    expect(generation!.intent).toBe('rebase');
    expect(service.db.prepare("SELECT COUNT(*) n FROM sync_audit WHERE operation='owner-repair-rebase'").get()).toMatchObject({ n: 1 });
  });
});
