import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { TransferBundle, TransferEvent, TransferSource } from '../domain';
import { hash, contentHash } from '../adapters/local/imports/identity';
import { ImportStore } from '../adapters/local/imports/store';
import { SYNC_SCHEMA } from '../adapters/local/imports/sync/store';
import { syncEnvelope, syncScopeId } from '../adapters/local/imports/sync/contract';
import {
  reconcileColdBaselineEvents,
  readColdBaselineArchive,
  type ProvenanceLayer,
  type ColdBaselineReport,
} from '../sync/cold-baseline-reconcile';
import { runMaintenance } from '../sync/maintenance';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'incept-cold-baseline-'));
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
}): TransferEvent {
  const base: TransferEvent = {
    eventId: hash(['strong', overrides.source, overrides.sessionId, overrides.timestampMs, overrides.modelName ?? 'gpt-6.1-terra']),
    source: overrides.source,
    sessionId: overrides.sessionId,
    timestampMs: overrides.timestampMs,
    modelName: overrides.modelName ?? 'gpt-6.1-terra',
    projectKey: overrides.projectKey ?? 'proj:1111111111111111',
    projectName: overrides.projectName ?? 'Incept',
    inputTokens: overrides.inputTokens ?? 1000,
    outputTokens: overrides.outputTokens ?? 200,
    cacheReadTokens: overrides.cacheReadTokens ?? 500,
    cacheCreationTokens: overrides.cacheCreationTokens ?? 100,
    reasoningTokens: overrides.reasoningTokens ?? 50,
    ...(overrides.recordedCost !== undefined ? { recordedCost: overrides.recordedCost } : {}),
  };
  return { ...base, ...overrides };
}

function makeWeakEvent(overrides: Partial<TransferEvent> & {
  source: TransferSource;
  sessionId: string;
  timestampMs: number;
}): TransferEvent {
  const event = makeEvent(overrides);
  event.eventId = contentHash(event);
  return event;
}

function makeBundle(deviceId: string, label: string, events: TransferEvent[]): TransferBundle {
  const payload = {
    format: 'incept-token-transfer' as const,
    version: 1 as const,
    exportId: '00000000-0000-4000-8000-000000000001',
    device: { id: deviceId, label, platform: 'win32' },
    exportedAt: '2026-11-26T00:05:00.000Z',
    events,
    prices: {},
    warnings: [],
  };
  return { ...payload, checksum: hash(payload) };
}

describe('cold-baseline-reconcile', () => {
  const cutoffIso = '2026-11-26T00:00:00+08:00';
  const cutoffMs = Date.parse(cutoffIso);

  it('excludes post-cutoff events and entire cross-day active sessions while keeping accounting exact', () => {
    const closedOld = makeEvent({
      source: 'antigravity',
      sessionId: 'ag-closed-1',
      timestampMs: cutoffMs - 3_600_000,
      inputTokens: 1000,
      outputTokens: 300,
      cacheReadTokens: 2000,
      cacheCreationTokens: 0,
      reasoningTokens: 100,
    });
    const crossDayPre = makeEvent({
      source: 'codex',
      sessionId: 'cx-live-cross-day',
      timestampMs: cutoffMs - 600_000,
      inputTokens: 400,
      outputTokens: 100,
      cacheReadTokens: 800,
      cacheCreationTokens: 0,
      reasoningTokens: 50,
    });
    const crossDayPost = makeEvent({
      source: 'codex',
      sessionId: 'cx-live-cross-day',
      timestampMs: cutoffMs + 60_000,
      inputTokens: 500,
      outputTokens: 120,
      cacheReadTokens: 900,
      cacheCreationTokens: 0,
      reasoningTokens: 60,
    });
    const localNetNew = makeEvent({
      source: 'commandcode',
      sessionId: 'cc-local-only',
      timestampMs: cutoffMs - 86_400_000,
      inputTokens: 2000,
      outputTokens: 400,
      cacheReadTokens: 3000,
      cacheCreationTokens: 250,
      reasoningTokens: 0,
    });

    const baseline: ProvenanceLayer = {
      id: 'prod-v4',
      kind: 'prod-v4',
      label: 'Prod V4',
      events: [closedOld, crossDayPre],
    };
    const localCandidate: ProvenanceLayer = {
      id: 'local-native',
      kind: 'local-native',
      label: 'Local Native',
      events: [closedOld, crossDayPre, crossDayPost, localNetNew],
    };

    const { report, archive } = reconcileColdBaselineEvents({
      cutoff: cutoffIso,
      baselineMode: 'prod-v4',
      baselineLayer: baseline,
      candidateLayers: [localCandidate],
      excludeActiveSessions: true,
    });

    expect(report.ok).toBe(true);
    expect(report.invariants).toEqual({
      accountingBalanced: true,
      deltaMatchesCandidateAdd: true,
      bySourceExactMatch: true,
      byDateExactMatch: true,
      repeatDryRunNetAddZero: true,
    });

    // Cross-day active session's pre-cutoff records must be excluded from both baseline and candidate cold sets.
    expect(report.totals.baselineCold.records).toBe(1);
    expect(report.totals.baselineCold.totalTokens).toBe(3400);
    expect(report.totals.candidateAdd.records).toBe(1);
    expect(report.totals.candidateAdd.totalTokens).toBe(5650);
    expect(report.totals.projectedMergedCold.records).toBe(2);
    expect(report.totals.projectedMergedCold.totalTokens).toBe(9050);
    expect(report.totals.postCutoff.records).toBe(1);
    expect(report.totals.excludedHotSessionPreCutoff.records).toBe(2); // 1 in baseline + 1 in candidate
    expect(report.hotSessions).toHaveLength(1);
    expect(report.hotSessions[0].source).toBe('codex');
    expect(archive.events).toHaveLength(2);
    expect(archive.excludedActiveSessionHashes).toHaveLength(1);
  });

  it('classifies exact matches, shared v1 imports, same-session reviews, and strong-id conflicts accurately', () => {
    const sharedBaseline = makeEvent({
      source: 'codex',
      sessionId: 'cx-1',
      timestampMs: cutoffMs - 7_200_000,
      modelName: 'GPT-6.1-Terra',
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      reasoningTokens: 100,
    });
    const conflictBaseline = makeEvent({
      eventId: hash(['codex-fixed-id']),
      source: 'codex',
      sessionId: 'cx-conflict',
      timestampMs: cutoffMs - 10_000_000,
      inputTokens: 500,
      outputTokens: 100,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      reasoningTokens: 0,
    });
    const conflictIncoming = makeEvent({
      eventId: hash(['codex-fixed-id']),
      source: 'codex',
      sessionId: 'cx-conflict',
      timestampMs: cutoffMs - 10_000_000,
      inputTokens: 500,
      outputTokens: 150, // different outputTokens with same strong eventId
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      reasoningTokens: 0,
    });
    const sameSessionUnmatched = makeEvent({
      source: 'codex',
      sessionId: 'cx-1',
      timestampMs: cutoffMs - 7_100_000,
      inputTokens: 300,
      outputTokens: 50,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      reasoningTokens: 0,
    });
    const sharedV1ImportRecord = makeEvent({
      source: 'antigravity',
      sessionId: 'ag-legacy-shared',
      timestampMs: cutoffMs - 86_400_000 * 20,
      inputTokens: 4000,
      outputTokens: 500,
      cacheReadTokens: 10000,
      cacheCreationTokens: 0,
      reasoningTokens: 0,
    });
    const weakDuplicateInProdV1 = makeWeakEvent({
      source: 'codex',
      sessionId: 'cx-1',
      timestampMs: cutoffMs - 7_200_000,
      modelName: 'gpt-6.1-terra', // case-normalized match against sharedBaseline
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      reasoningTokens: 100,
    });
    const prodV1TailAdd = makeEvent({
      source: 'commandcode',
      sessionId: 'cc-prod-legacy-tail',
      timestampMs: cutoffMs - 86_400_000 * 15,
      inputTokens: 900,
      outputTokens: 100,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      reasoningTokens: 0,
    });

    const { report } = reconcileColdBaselineEvents({
      cutoff: cutoffIso,
      baselineMode: 'prod-v4',
      baselineLayer: {
        id: 'prod-v4',
        kind: 'prod-v4',
        label: 'Prod V4',
        events: [sharedBaseline, conflictBaseline],
      },
      candidateLayers: [
        {
          id: 'local-native',
          kind: 'local-native',
          label: 'Local Native',
          events: [sharedBaseline, conflictIncoming, sameSessionUnmatched],
        },
        {
          id: 'local-v1-import',
          kind: 'local-v1-import',
          label: 'Local V1 Import',
          events: [sharedV1ImportRecord],
        },
        {
          id: 'prod-v1-import',
          kind: 'prod-v1-import',
          label: 'Prod V1 Import',
          events: [weakDuplicateInProdV1, sharedV1ImportRecord, prodV1TailAdd],
        },
      ],
    });

    expect(report.ok).toBe(true);
    expect(report.invariants.repeatDryRunNetAddZero).toBe(true);

    // sharedV1ImportRecord added once in local-v1-import, deduplicated in prod-v1-import.
    const localV1 = report.layers.find(layer => layer.id === 'local-v1-import')!;
    const prodV1 = report.layers.find(layer => layer.id === 'prod-v1-import')!;
    expect(localV1.classifications['candidate-add'].records).toBe(1);
    expect(prodV1.classifications['already-in-baseline'].records).toBe(2);
    expect(prodV1.classifications['candidate-add'].records).toBe(1);

    // Same-session unmatched record goes to review, never auto-added.
    expect(report.totals.sameSessionReview.records).toBe(1);
    expect(report.reviewGroups).toHaveLength(1);
    expect(report.reviewGroups[0].reason).toBe('same-session-existing-scope');

    // Strong ID content mismatch goes to conflict.
    expect(report.totals.conflict.records).toBe(1);
    expect(report.conflictGroups).toHaveLength(1);
    expect(report.conflictGroups[0].reason).toBe('strong-id-content-mismatch');

    // Total projected cold = 2 baseline + 2 clean net-new = 4 records.
    expect(report.totals.projectedMergedCold.records).toBe(4);
    expect(report.totals.candidateAdd.records).toBe(2);
    expect(report.totals.candidateAdd.totalTokens).toBe(14500 + 1000);
  });

  it('verifies CLI reconciliation, agent policy detection, archive checksum, and second-pass zero-delta', async () => {
    const dir = makeTempDir();
    const v4Path = join(dir, 'prod-v4-backup.db');
    const localV1Path = join(dir, 'local-imports.db');
    const bundlePath = join(dir, 'other-device-bundle.json');
    const agentDir = join(dir, 'agent-state');
    const archivePath = join(dir, 'cold-baseline-archive.json');
    const reportPath = join(dir, 'reconcile-report.json');

    mkdirSync(agentDir, { recursive: true });
    const agentDb = new DatabaseSync(join(agentDir, 'state.db'));
    agentDb.exec(`
      CREATE TABLE historical_seals(scope TEXT PRIMARY KEY, seal_json TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE outbox(serial INTEGER PRIMARY KEY, batch TEXT NOT NULL UNIQUE, scope TEXT NOT NULL, header_json TEXT NOT NULL, proof_json TEXT NOT NULL, signature TEXT NOT NULL, state TEXT NOT NULL);
      CREATE TABLE session_isolations(id TEXT PRIMARY KEY, source TEXT NOT NULL, session_id TEXT NOT NULL, reason TEXT NOT NULL, detail_json TEXT NOT NULL, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, occurrences INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1);
    `);
    agentDb.prepare('INSERT INTO historical_seals VALUES(?,?,?)').run('s1', JSON.stringify({ disposition: 'sealed', source: 'codex', sessionId: 'cx-sealed' }), '2026-11-20T00:00:00Z');
    agentDb.prepare('INSERT INTO historical_seals VALUES(?,?,?)').run('s2', JSON.stringify({ disposition: 'isolated', source: 'codex', sessionId: 'cx-isolated' }), '2026-11-20T00:00:00Z');
    agentDb.prepare('INSERT INTO outbox VALUES(?,?,?,?,?,?,?)').run(
      1,
      'b1',
      'scope-outbox',
      JSON.stringify({ manifest: { scope: { source: 'codex', sessionId: 'cx-in-outbox' } } }),
      '[]',
      'sig',
      'quarantined',
    );
    agentDb.prepare('INSERT INTO session_isolations VALUES(?,?,?,?,?,?,?,?,?)').run(
      'iso1', 'codex', 'cx-iso-1', 'INVALID_COUNTER', '{}', '2026-11-24T00:00:00Z', '2026-11-25T00:00:00Z', 3, 1,
    );
    agentDb.close();

    // Seed prod V4 backup DB.
    const v4Db = new DatabaseSync(v4Path);
    v4Db.exec(SYNC_SCHEMA);
    v4Db.prepare('UPDATE sync_meta SET data_revision=4351 WHERE id=1').run();
    const claudeEvent = makeEvent({
      source: 'claudeCode',
      sessionId: 'claude-prod-only',
      timestampMs: cutoffMs - 86_400_000 * 5,
      modelName: 'claude-opus-5-5',
      inputTokens: 1200,
      outputTokens: 300,
      cacheReadTokens: 4000,
      cacheCreationTokens: 500,
      reasoningTokens: 0,
    });
    const agEvent = makeEvent({
      source: 'antigravity',
      sessionId: 'ag-shared-1',
      timestampMs: cutoffMs - 86_400_000 * 2,
      modelName: 'gemini-3.8-flash-n',
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 3000,
      cacheCreationTokens: 0,
      reasoningTokens: 100,
    });
    for (const event of [claudeEvent, agEvent]) {
      const scope = {
        deviceId: '00000000-0000-4000-8000-0000000000aa',
        source: event.source,
        sessionId: event.sessionId,
        originId: hash(['incept-origin/1', event.source, event.sessionId]),
      };
      const sid = syncScopeId(scope);
      const record = { event, envelopeHash: '' };
      record.envelopeHash = syncEnvelope(record);
      const obsId = hash(record);
      v4Db.prepare('INSERT INTO sync_origins VALUES(?,?,?,?)').run(scope.originId, sid, JSON.stringify(scope), 'prod-device');
      v4Db.prepare('INSERT INTO sync_scopes VALUES(?,?,?,?,?,?)').run(sid, hash(['m', sid]), hash(['g', sid]), hash(['g', sid]), 0, 1000);
      v4Db.prepare('INSERT INTO sync_observations VALUES(?,?,?,?,?)').run(obsId, JSON.stringify(record), event.timestampMs, event.source, event.sessionId);
      v4Db.prepare('INSERT INTO sync_current VALUES(?,?,?,?)').run(sid, 0, obsId, hash(['e', obsId]));
    }
    v4Db.prepare('INSERT INTO sync_reviews(id,scope_id,manifest_id,code,header_json,created_at,proposal_hash) VALUES(?,?,?,?,?,?,?)')
      .run(39, 'scope-39', 'man-39', 'PARENT_MISMATCH', '{}', cutoffMs - 1000, hash(['rev-39']));
    v4Db.close();

    // Seed local V1 imports DB (1 active batch + 1 rolled-back batch).
    const v1Store = new ImportStore(localV1Path);
    const v1NetNew = makeEvent({
      source: 'antigravity',
      sessionId: 'ag-v1-legacy-only',
      timestampMs: cutoffMs - 86_400_000 * 40,
      inputTokens: 5000,
      outputTokens: 1000,
      cacheReadTokens: 20000,
      cacheCreationTokens: 0,
      reasoningTokens: 0,
    });
    const activeBundle = makeBundle('00000000-0000-4000-8000-0000000000bb', 'old-laptop', [agEvent, v1NetNew]);
    v1Store.saveBatch({
      receipt: {
        id: 'batch-active-1',
        deviceId: activeBundle.device.id,
        deviceLabel: activeBundle.device.label,
        exportId: activeBundle.exportId,
        importedAt: '2026-11-01T00:00:00.000Z',
        checksum: activeBundle.checksum,
        status: 'active',
        received: 2,
        added: 2,
        duplicateLocal: 0,
        duplicateImported: 0,
        addedTokens: 30300,
      },
      bundle: activeBundle,
      mappings: {},
    }, hash({}));
    const rolledEvent = makeEvent({
      source: 'codex',
      sessionId: 'cx-rolled-back',
      timestampMs: cutoffMs - 86_400_000 * 30,
      inputTokens: 9999,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      reasoningTokens: 0,
    });
    const rolledBundle = makeBundle('00000000-0000-4000-8000-0000000000cc', 'rolled', [rolledEvent]);
    v1Store.saveBatch({
      receipt: {
        id: 'batch-rolled-1',
        deviceId: rolledBundle.device.id,
        deviceLabel: rolledBundle.device.label,
        exportId: rolledBundle.exportId,
        importedAt: '2026-10-15T00:00:00.000Z',
        checksum: rolledBundle.checksum,
        status: 'rolled_back',
        received: 1,
        added: 1,
        duplicateLocal: 0,
        duplicateImported: 0,
        addedTokens: 10000,
      },
      bundle: rolledBundle,
      mappings: {},
    }, hash({}));
    v1Store.setReceipt({
      id: 'batch-rolled-1',
      deviceId: rolledBundle.device.id,
      deviceLabel: rolledBundle.device.label,
      exportId: rolledBundle.exportId,
      importedAt: '2026-10-15T00:00:00.000Z',
      rolledBackAt: '2026-10-16T00:00:00.000Z',
      checksum: rolledBundle.checksum,
      status: 'rolled_back',
      received: 1,
      added: 1,
      duplicateLocal: 0,
      duplicateImported: 0,
      addedTokens: 10000,
    });
    v1Store.close();

    // Seed second-device bundle with 1 clean session + 1 session active in agent outbox.
    const otherDeviceEvent = makeEvent({
      source: 'commandcode',
      sessionId: 'cc-device-2',
      timestampMs: cutoffMs - 86_400_000 * 3,
      inputTokens: 700,
      outputTokens: 300,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      reasoningTokens: 0,
    });
    const outboxEvent = makeEvent({
      source: 'codex',
      sessionId: 'cx-in-outbox',
      timestampMs: cutoffMs - 3_600_000,
      inputTokens: 111,
      outputTokens: 222,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      reasoningTokens: 0,
    });
    writeFileSync(
      bundlePath,
      JSON.stringify(makeBundle('00000000-0000-4000-8000-0000000000dd', 'workstation-2', [otherDeviceEvent, outboxEvent])),
    );

    // First dry-run via maintenance CLI.
    const first = await runMaintenance([
      'reconcile-cold-baseline',
      `--cutoff=${cutoffIso}`,
      '--baseline-mode=prod-v4',
      `--baseline-v4=${v4Path}`,
      `--local-v1-imports=${localV1Path}`,
      `--device-bundles=${bundlePath}`,
      `--agent-state-dir=${agentDir}`,
      `--output-archive=${archivePath}`,
      `--report=${reportPath}`,
    ]) as ColdBaselineReport;

    expect(first.ok).toBe(true);
    expect(first.dryRun).toBe(true);
    expect(first.agentPolicies).toEqual({
      sealedScopes: 1,
      isolatedScopes: 1,
      activeOutboxScopes: 1,
      activeIsolationScopes: 1,
    });
    expect(first.layers[0].metadata).toEqual({ revision: 4351, unresolvedReviews: 1 });
    // Baseline has 2 records (6000 + 4300 = 10300). Candidate adds 2 records (26000 + 1000 = 27000).
    // Rolled-back V1 batch ignored; pending outbox session excluded as hot session.
    expect(first.totals.baselineCold.records).toBe(2);
    expect(first.totals.baselineCold.totalTokens).toBe(10300);
    expect(first.totals.candidateAdd.records).toBe(2);
    expect(first.totals.candidateAdd.totalTokens).toBe(27000);
    expect(first.totals.projectedMergedCold.records).toBe(4);
    expect(first.totals.projectedMergedCold.totalTokens).toBe(37300);
    expect(first.totals.excludedHotSessionPreCutoff.records).toBe(1);
    expect(first.hotSessions[0].reason).toBe('agent-outbox-active');
    expect(first.invariants.repeatDryRunNetAddZero).toBe(true);

    // Verify archive and report files on disk.
    const loadedArchive = readColdBaselineArchive(archivePath);
    expect(loadedArchive.checksum).toBe(first.archiveChecksum);
    expect(loadedArchive.events).toHaveLength(4);
    const savedReport = JSON.parse(readFileSync(reportPath, 'utf8')) as ColdBaselineReport;
    expect(savedReport.ok).toBe(true);

    // Second pass using the generated cold archive as baseline MUST yield zero net-new additions.
    const second = await runMaintenance([
      'reconcile-cold-baseline',
      `--cutoff=${cutoffIso}`,
      '--baseline-mode=archive',
      `--baseline-archive=${archivePath}`,
      `--baseline-v4=${v4Path}`,
      `--local-v1-imports=${localV1Path}`,
      `--device-bundles=${bundlePath}`,
      `--agent-state-dir=${agentDir}`,
    ]) as ColdBaselineReport;

    expect(second.ok).toBe(true);
    expect(second.totals.candidateAdd.records).toBe(0);
    expect(second.totals.candidateAdd.totalTokens).toBe(0);
    expect(second.totals.projectedMergedCold.totalTokens).toBe(37300);
  });

  it('routes collector-integrity-flagged sessions and distinct-strong-id local-native records to review instead of auto-adding or silently deduplicating', () => {
    const baselineStrong = makeEvent({
      eventId: hash(['strong-v4-id']),
      source: 'codex',
      sessionId: 'cx-strong-diff',
      timestampMs: cutoffMs - 7_200_000,
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      reasoningTokens: 0,
    });
    const localDifferentStrongIdSameContent = makeEvent({
      eventId: hash(['strong-local-other-id']),
      source: 'codex',
      sessionId: 'cx-strong-diff',
      timestampMs: cutoffMs - 7_200_000,
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      reasoningTokens: 0,
    });
    const integrityFlaggedEvent = makeEvent({
      source: 'codex',
      sessionId: 'cx-integrity-flagged',
      timestampMs: cutoffMs - 3_600_000,
      inputTokens: 5000,
      outputTokens: 500,
      cacheReadTokens: 10000,
      cacheCreationTokens: 0,
      reasoningTokens: 100,
    });

    const { report } = reconcileColdBaselineEvents({
      cutoff: cutoffIso,
      baselineMode: 'prod-v4',
      baselineLayer: {
        id: 'prod-v4',
        kind: 'prod-v4',
        label: 'Prod V4',
        events: [baselineStrong],
      },
      candidateLayers: [
        {
          id: 'local-native',
          kind: 'local-native',
          label: 'Local Native',
          events: [localDifferentStrongIdSameContent, integrityFlaggedEvent],
          integrityFlaggedSessions: ['codex:cx-integrity-flagged'],
        },
      ],
    });

    expect(report.ok).toBe(true);
    expect(report.invariants.repeatDryRunNetAddZero).toBe(true);
    expect(report.totals.candidateAdd.records).toBe(0);
    expect(report.totals.alreadyInBaseline.records).toBe(0);
    expect(report.totals.sameSessionReview.records).toBe(2);
    expect(report.reviewGroups.map(group => group.reason).sort()).toEqual([
      'collector-integrity-flagged',
      'distinct-strong-id-same-content',
    ]);
  });
});
