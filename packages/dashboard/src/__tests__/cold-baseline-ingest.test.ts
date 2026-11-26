import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { TransferBundle, TransferEvent, TransferSource } from '../domain';
import { hash } from '../adapters/local/imports/identity';
import { ImportStore } from '../adapters/local/imports/store';
import { makeManifest, merkleRoot, sequenceHash, syncEnvelope } from '../adapters/local/imports/sync/contract';
import { CompatibleSyncService } from '../adapters/local/imports/sync/legacy';
import { backfillUsageIdentity } from '../sync/usage-identity-backfill';
import { reconcileColdBaseline } from '../sync/cold-baseline-reconcile';
import { runMaintenance } from '../sync/maintenance';
import type { Wave1IngestResult } from '../sync/cold-baseline-ingest';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'incept-wave1-ingest-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function makeEvent(overrides: Partial<TransferEvent> & {
  source: TransferSource;
  sessionId: string;
  timestampMs: number;
  tag: string;
}): TransferEvent {
  return {
    eventId: hash(['wave1-test', overrides.tag, overrides.source, overrides.sessionId, overrides.timestampMs]),
    source: overrides.source,
    sessionId: overrides.sessionId,
    timestampMs: overrides.timestampMs,
    modelName: overrides.modelName ?? 'gpt-5.6-terra',
    projectKey: overrides.projectKey ?? 'proj:1111111111111111',
    projectName: overrides.projectName ?? 'Incept',
    inputTokens: overrides.inputTokens ?? 1000,
    outputTokens: overrides.outputTokens ?? 200,
    cacheReadTokens: overrides.cacheReadTokens ?? 3000,
    cacheCreationTokens: overrides.cacheCreationTokens ?? 0,
    reasoningTokens: overrides.reasoningTokens ?? 50,
    ...(overrides.recordedCost !== undefined ? { recordedCost: overrides.recordedCost } : {}),
  };
}

function makeBundle(deviceId: string, label: string, events: TransferEvent[]): TransferBundle {
  const payload = {
    format: 'incept-token-transfer' as const,
    version: 1 as const,
    exportId: '00000000-0000-4000-8000-000000000001',
    device: { id: deviceId, label, platform: 'win32' },
    exportedAt: '2026-10-15T00:00:00.000Z',
    events,
    prices: {},
    warnings: [],
  };
  return { ...payload, checksum: hash(payload) };
}

describe('cold-baseline-ingest (Wave 1)', () => {
  const cutoffIso = '2026-11-26T00:00:00+08:00';
  const cutoffMs = Date.parse(cutoffIso);

  it('commits only fresh V1 scopes as canonical V4 scopes, leaves existing/sealed scopes untouched, and passes identity backfill with zero conflicts', async () => {
    const dir = makeTempDir();
    const v4Path = join(dir, 'v4-copy.db');
    const localV1Path = join(dir, 'local-v1.db');
    const prodV1Path = join(dir, 'prod-v1.db');
    const identityOut = join(dir, 'identity-sidecar.db');

    // Seed V4 with 1 existing sealed session via real CompatibleSyncService (must NEVER be touched).
    const existingEvent = makeEvent({
      tag: 'existing-sealed',
      source: 'codex',
      sessionId: 'sealed-session-1',
      timestampMs: cutoffMs - 86_400_000 * 60,
      inputTokens: 500,
      outputTokens: 100,
      cacheReadTokens: 1000,
      reasoningTokens: 0,
    });
    const existingScope = {
      deviceId: '00000000-0000-4000-8000-0000000000aa',
      source: existingEvent.source,
      sessionId: existingEvent.sessionId,
      originId: hash(['incept-origin/1', existingEvent.source, existingEvent.sessionId]),
    };
    const existingRec = { event: existingEvent, envelopeHash: '' };
    existingRec.envelopeHash = syncEnvelope(existingRec);
    const seq = sequenceHash([existingRec]);
    const loc = hash(['existing-sealed-loc']);
    const snap = hash([[loc, seq]]);
    const basis = { rates: {}, aliases: {}, schedule: 'commandcode-peak-v1' as const };
    const existingHeader = {
      batchId: 'seed-existing-1',
      basis,
      mappings: {},
      manifest: makeManifest({
        version: 2,
        scope: existingScope,
        reader: 'aiusage',
        collectorVersion: 'incept-collector/1',
        epoch: 0,
        parent: null,
        read: { status: 'complete', inventoryHash: hash([loc]), beforeRoot: snap, afterRoot: snap, snapshotRoot: snap },
        ranges: [{ locatorHash: loc, identityHash: hash(['id']), root: seq, envelopeRoot: hash([existingRec.envelopeHash]), byteLength: 128, kind: 'sqlite' }],
        recordCount: 1,
        sequenceHash: seq,
        basisHash: hash(basis),
        mappingsHash: hash({}),
        merkleRoot: merkleRoot([existingRec]),
        intent: 'observe',
      }),
    };
    const seedActor = { role: 'owner' as const, subject: 'test-owner', reason: 'Seed test fixture' };
    const seedSvc = new CompatibleSyncService(v4Path);
    seedSvc.register(existingScope, 'existing', seedActor);
    seedSvc.begin(existingHeader, seedActor);
    seedSvc.stage(existingScope.deviceId, existingHeader.batchId, 0, [existingRec], seedActor);
    seedSvc.commit(existingScope.deviceId, existingHeader.batchId, seedActor);
    seedSvc.db.prepare('UPDATE sync_meta SET data_revision=4355 WHERE id=1').run();
    seedSvc.close();

    // Seed local V1 with 2 fresh events that intentionally share the SAME timestampMs (proves zero pointKey conflict!).
    const sharedTs = cutoffMs - 86_400_000 * 40;
    const fresh1 = makeEvent({ tag: 'f1', source: 'codex', sessionId: 'other-pc-sess-1', timestampMs: sharedTs, inputTokens: 1000, outputTokens: 200, cacheReadTokens: 3000, reasoningTokens: 50 });
    const fresh2 = makeEvent({ tag: 'f2', source: 'codex', sessionId: 'other-pc-sess-1', timestampMs: sharedTs, inputTokens: 2000, outputTokens: 300, cacheReadTokens: 4000, reasoningTokens: 100 });
    const freshCc = makeEvent({ tag: 'cc1', source: 'commandcode', sessionId: 'other-pc-cc-1', timestampMs: cutoffMs - 86_400_000 * 50, modelName: 'deepseek-v4.1-flash', inputTokens: 500, outputTokens: 150, cacheReadTokens: 1500, reasoningTokens: 0 });
    const localBundle = makeBundle('00000000-0000-4000-8000-0000000000bb', '13776-PC', [fresh1, fresh2, freshCc]);
    const localV1 = new ImportStore(localV1Path);
    localV1.saveBatch({
      receipt: {
        id: 'batch-13776',
        deviceId: localBundle.device.id,
        deviceLabel: localBundle.device.label,
        exportId: localBundle.exportId,
        checksum: localBundle.checksum,
        importedAt: '2026-10-13T00:00:00.000Z',
        status: 'active',
        received: 3,
        added: 3,
        duplicateLocal: 0,
        duplicateImported: 0,
        addedTokens: 12800,
      },
      bundle: localBundle,
      mappings: {},
    }, hash({}));
    localV1.close();

    // Seed prod V1 with duplicate of batch-13776 + a second batch containing:
    // - extra record in existing sealed-session-1 (MUST be skipped!)
    // - 1 genuinely fresh session (MUST be committed!)
    const sealedExtra = makeEvent({ tag: 'sealed-extra', source: 'codex', sessionId: 'sealed-session-1', timestampMs: cutoffMs - 86_400_000 * 60 - 5000, inputTokens: 999, outputTokens: 1, cacheReadTokens: 0, reasoningTokens: 0 });
    const prodFresh = makeEvent({ tag: 'pf1', source: 'codex', sessionId: 'prod-only-legacy-1', timestampMs: cutoffMs - 86_400_000 * 45, inputTokens: 800, outputTokens: 100, cacheReadTokens: 1100, reasoningTokens: 0 });
    const prodBundle2 = makeBundle('00000000-0000-4000-8000-0000000000aa', 'DESKTOP-4SPOU3F', [sealedExtra, prodFresh]);
    const prodV1 = new ImportStore(prodV1Path);
    prodV1.saveBatch({
      receipt: {
        id: 'batch-13776-dup',
        deviceId: localBundle.device.id,
        deviceLabel: localBundle.device.label,
        exportId: localBundle.exportId,
        checksum: localBundle.checksum,
        importedAt: '2026-10-13T00:00:00.000Z',
        status: 'active',
        received: 3,
        added: 3,
        duplicateLocal: 0,
        duplicateImported: 0,
        addedTokens: 12800,
      },
      bundle: localBundle,
      mappings: {},
    }, hash({}));
    prodV1.saveBatch({
      receipt: {
        id: 'batch-desktop',
        deviceId: prodBundle2.device.id,
        deviceLabel: prodBundle2.device.label,
        exportId: prodBundle2.exportId,
        checksum: prodBundle2.checksum,
        importedAt: '2026-10-15T00:00:00.000Z',
        status: 'active',
        received: 2,
        added: 2,
        duplicateLocal: 0,
        duplicateImported: 0,
        addedTokens: 3000,
      },
      bundle: prodBundle2,
      mappings: {},
    }, hash({}));
    prodV1.close();

    // 1. Dry-run first.
    const dry = await runMaintenance([
      'ingest-cold-baseline-v1',
      `--target-v4=${v4Path}`,
      `--v1-imports=${localV1Path},${prodV1Path}`,
      `--cutoff=${cutoffIso}`,
      '--expected-records=4',
      '--expected-tokens=14800',
      '--owner-confirm=I_AM_THE_OWNER',
      '--reason=Wave 1 dry-run test',
    ]) as Wave1IngestResult;

    expect(dry.ok).toBe(true);
    expect(dry.dryRun).toBe(true);
    expect(dry.planned.scopesToCommit).toBe(3);
    expect(dry.planned.tokens.records).toBe(4);
    expect(dry.planned.tokens.totalTokens).toBe(14800);
    expect(dry.planned.skippedDuplicateBatches).toBe(1);
    expect(dry.planned.skippedExistingScopes).toBe(1);

    // 2. Apply to isolated V4 copy.
    const applied = await runMaintenance([
      'ingest-cold-baseline-v1',
      `--target-v4=${v4Path}`,
      `--v1-imports=${localV1Path},${prodV1Path}`,
      `--cutoff=${cutoffIso}`,
      '--expected-records=4',
      '--expected-tokens=14800',
      '--apply',
      '--owner-confirm=I_AM_THE_OWNER',
      '--reason=Wave 1 isolated rehearsal',
    ]) as Wave1IngestResult;

    expect(applied.ok).toBe(true);
    expect(applied.dryRun).toBe(false);
    expect(applied.after!.committedScopes).toBe(3);
    expect(applied.after!.visible.records).toBe(5);
    expect(applied.after!.visible.totalTokens).toBe(1600 + 14800);
    expect(applied.invariants).toEqual({
      expectedGuardrailMatch: true,
      preExistingScopesUntouched: true,
      deltaMatchesPlanned: true,
      bySourceExactMatch: true,
      byDateExactMatch: true,
      activeLegacyBatchesZero: true,
      sqliteQuickCheckOk: true,
    });

    // 3. Re-running reconcile-cold-baseline against the updated V4 copy must yield 0 net-new from both V1 DBs.
    const recheck = reconcileColdBaseline({
      cutoff: cutoffIso,
      baselineMode: 'prod-v4',
      baselineV4Path: v4Path,
      localV1ImportsPath: localV1Path,
      prodV1ImportsPath: prodV1Path,
    });
    expect(recheck.ok).toBe(true);
    expect(recheck.totals.candidateAdd.records).toBe(0);
    expect(recheck.totals.candidateAdd.totalTokens).toBe(0);

    // 4. Identity backfill must scan all 5 visible records with ZERO conflicts (even with shared timestampMs!).
    const backfill = backfillUsageIdentity(v4Path, identityOut, 1000);
    expect(backfill.ok).toBe(true);
    expect(backfill.scanComplete).toBe(true);
    expect(backfill.complete).toBe(true);
    const idDb = new DatabaseSync(identityOut, { readOnly: true });
    try {
      const conflicts = Number(idDb.prepare("SELECT COUNT(*) AS n FROM usage_ledger_identity_disposition WHERE disposition='conflict'").get()!.n);
      const mapped = Number(idDb.prepare("SELECT COUNT(*) AS n FROM usage_ledger_identity_disposition WHERE disposition='mapped'").get()!.n);
      expect(conflicts).toBe(0);
      expect(mapped).toBe(4);
    } finally {
      idDb.close();
    }
  });
});
