import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dashboardDate, type ImportMappings, type TransferBundle, type TransferEvent, type TransferSource } from '../domain';
import type { SyncActor, SyncBasis, SyncHeader, SyncRecord, SyncScope } from '../domain/sync';
import { eventTokens, hash } from '../adapters/local/imports/identity';
import { makeManifest, merkleRoot, sequenceHash, syncEnvelope, syncScopeId, validateHeader, validateRecords } from '../adapters/local/imports/sync/contract';
import { CompatibleSyncService } from '../adapters/local/imports/sync/legacy';
import {
  addEventToBucket,
  bucketsEqual,
  emptyBucket,
  parseCutoffMs,
  subtractBuckets,
  type TokenBucket,
} from './cold-baseline-reconcile';

export type Wave1IngestOptions = {
  targetV4Path: string;
  v1ImportPaths: string[];
  cutoff: string | number;
  actor: Extract<SyncActor, { role: 'owner' }>;
  apply?: boolean;
  expectedRecords?: number;
  expectedTokens?: number;
};

type BatchSourceInfo = {
  batchId: string;
  checksum: string;
  deviceId: string;
  deviceLabel: string;
  mappings: ImportMappings;
  prices: TransferBundle['prices'];
  events: TransferEvent[];
};

type ScopePlan = {
  scope: SyncScope;
  scopeId: string;
  deviceLabel: string;
  batchId: string;
  sourceBatchChecksum: string;
  header: SyncHeader;
  records: SyncRecord[];
  tokens: TokenBucket;
};

export type Wave1IngestResult = {
  ok: boolean;
  dryRun: boolean;
  cutoffIso: string;
  cutoffMs: number;
  before: {
    revision: number;
    scopes: number;
    visible: TokenBucket;
    activeLegacyBatches: number;
  };
  planned: {
    batchesScanned: number;
    batchesWithFreshScopes: number;
    scopesToCommit: number;
    tokens: TokenBucket;
    bySource: Record<string, TokenBucket>;
    skippedExistingScopes: number;
    skippedDuplicateBatches: number;
    skippedPostCutoffRecords: number;
  };
  after?: {
    revision: number;
    scopes: number;
    visible: TokenBucket;
    activeLegacyBatches: number;
    committedScopes: number;
    unchangedScopes: number;
  };
  invariants: {
    expectedGuardrailMatch: boolean;
    preExistingScopesUntouched: boolean;
    deltaMatchesPlanned: boolean;
    bySourceExactMatch: boolean;
    byDateExactMatch: boolean;
    activeLegacyBatchesZero: boolean;
    sqliteQuickCheckOk: boolean;
  };
};

function sanitizeRates(prices: TransferBundle['prices'], usedModels: Set<string>): SyncBasis['rates'] {
  const result: SyncBasis['rates'] = {};
  for (const [model, rate] of Object.entries(prices ?? {})) {
    if (!usedModels.has(model)) continue;
    if (!model.trim() || model.length > 200 || ['__proto__', 'constructor', 'prototype'].includes(model)) continue;
    if (!rate || typeof rate.inputPerMillion !== 'number' || typeof rate.outputPerMillion !== 'number') continue;
    const clean: SyncBasis['rates'][string] = {
      inputPerMillion: rate.inputPerMillion,
      outputPerMillion: rate.outputPerMillion,
    };
    if (rate.cacheReadPerMillion !== undefined) clean.cacheReadPerMillion = rate.cacheReadPerMillion;
    if (rate.cacheWritePerMillion !== undefined) clean.cacheWritePerMillion = rate.cacheWritePerMillion;
    const valid = Object.values(clean).every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e6);
    if (valid) result[model] = clean;
  }
  return result;
}

function readActiveV1BatchesReadOnly(dbPath: string): BatchSourceInfo[] {
  if (!isAbsolute(dbPath)) throw new Error('ABSOLUTE_PATH_REQUIRED');
  if (!existsSync(dbPath)) throw new Error(`SOURCE_NOT_FOUND:${dbPath}`);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=5000;');
    const batches: BatchSourceInfo[] = [];
    for (const row of db.prepare("SELECT id, payload FROM batches WHERE status='active' ORDER BY rowid ASC").iterate()) {
      const payload = JSON.parse(String(row.payload)) as { bundle: TransferBundle; mappings: ImportMappings };
      batches.push({
        batchId: String(row.id),
        checksum: payload.bundle.checksum,
        deviceId: payload.bundle.device.id,
        deviceLabel: payload.bundle.device.label,
        mappings: payload.mappings ?? {},
        prices: payload.bundle.prices ?? {},
        events: payload.bundle.events,
      });
    }
    return batches;
  } finally {
    db.close();
  }
}

function snapshotVisibleLedger(db: DatabaseSync): {
  revision: number;
  scopes: number;
  visible: TokenBucket;
  bySource: Map<string, TokenBucket>;
  byDate: Map<string, TokenBucket>;
  activeLegacyBatches: number;
  scopeFingerprints: Map<string, string>;
  existingSessionKeys: Set<string>;
} {
  const revision = Number((db.prepare('SELECT data_revision FROM sync_meta WHERE id=1').get() as { data_revision?: number } | undefined)?.data_revision ?? 0);
  const activeLegacyBatches = Number((db.prepare("SELECT COUNT(*) AS n FROM sync_legacy_batches WHERE status='active'").get() as { n?: number } | undefined)?.n ?? 0);
  const scopeFingerprints = new Map<string, string>();
  const existingSessionKeys = new Set<string>();
  for (const row of db.prepare(`
    SELECT s.scope_id, s.head_manifest, s.visible_generation, s.fenced, s.token_total, o.scope_json
    FROM sync_scopes s
    JOIN sync_origins o ON o.scope_id = s.scope_id
  `).iterate()) {
    const scope = JSON.parse(String(row.scope_json)) as SyncScope;
    existingSessionKeys.add(`${scope.source}:${scope.sessionId}`);
    scopeFingerprints.set(
      String(row.scope_id),
      hash([row.head_manifest, row.visible_generation, row.fenced, row.token_total]),
    );
  }
  const visible = emptyBucket();
  const bySource = new Map<string, TokenBucket>();
  const byDate = new Map<string, TokenBucket>();
  for (const row of db.prepare(`
    SELECT o.record_json
    FROM sync_current c
    JOIN sync_observations o ON o.id = c.observation_id
    JOIN sync_scopes s ON s.scope_id = c.scope_id
    WHERE s.visible_generation IS NOT NULL
  `).iterate()) {
    const record = JSON.parse(String(row.record_json)) as SyncRecord;
    if (eventTokens(record.event) <= 0) continue;
    addEventToBucket(visible, record.event);
    let srcBucket = bySource.get(record.event.source);
    if (!srcBucket) {
      srcBucket = emptyBucket();
      bySource.set(record.event.source, srcBucket);
    }
    addEventToBucket(srcBucket, record.event);
    const dk = dashboardDate(record.event.timestampMs);
    let dateBucket = byDate.get(dk);
    if (!dateBucket) {
      dateBucket = emptyBucket();
      byDate.set(dk, dateBucket);
    }
    addEventToBucket(dateBucket, record.event);
  }
  return {
    revision,
    scopes: scopeFingerprints.size,
    visible,
    bySource,
    byDate,
    activeLegacyBatches,
    scopeFingerprints,
    existingSessionKeys,
  };
}

function buildScopePlan(
  batch: BatchSourceInfo,
  source: TransferSource,
  sessionId: string,
  rawEvents: TransferEvent[],
): ScopePlan {
  const sortedEvents = [...rawEvents].sort((a, b) =>
    a.timestampMs - b.timestampMs || a.eventId.localeCompare(b.eventId, 'en'));
  const scope: SyncScope = {
    deviceId: batch.deviceId,
    source,
    sessionId,
    originId: hash(['incept-origin/1', batch.deviceId, source, sessionId]),
  };
  const scopeId = syncScopeId(scope);
  const records: SyncRecord[] = sortedEvents.map(event => {
    const cleanEvent: TransferEvent = {
      eventId: event.eventId,
      source: event.source,
      sessionId: event.sessionId,
      timestampMs: event.timestampMs,
      modelName: event.modelName,
      projectKey: event.projectKey,
      projectName: event.projectName,
      ...(event.workspacePath ? { workspacePath: event.workspacePath } : {}),
      ...(event.sessionTitle ? { sessionTitle: event.sessionTitle } : {}),
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      cacheReadTokens: event.cacheReadTokens,
      cacheCreationTokens: event.cacheCreationTokens,
      reasoningTokens: event.reasoningTokens,
      ...(event.recordedCost !== undefined && event.source !== 'codex' ? { recordedCost: event.recordedCost } : {}),
    };
    const record: SyncRecord = {
      event: cleanEvent,
      envelopeHash: '',
      pointKey: hash(['v1-cold-baseline-point/1', batch.deviceId, source, sessionId, cleanEvent.eventId]),
    };
    record.envelopeHash = syncEnvelope(record);
    return record;
  });

  const usedModels = new Set(sortedEvents.map(event => event.modelName));
  const usedProjects = new Set(sortedEvents.map(event => event.projectKey));
  const mappings: Record<string, string | null> = {};
  for (const projectKey of usedProjects) {
    if (Object.hasOwn(batch.mappings, projectKey)) {
      mappings[projectKey] = batch.mappings[projectKey] ?? null;
    }
  }
  const basis: SyncBasis = {
    rates: sanitizeRates(batch.prices, usedModels),
    aliases: {},
    schedule: 'commandcode-peak-v1',
  };

  const seqHash = sequenceHash(records);
  const mRoot = merkleRoot(records);
  const locatorHash = hash(['v1-cold-baseline-batch/1', batch.checksum, source, sessionId]);
  const identityHash = hash(['v1-cold-baseline-identity/1', batch.batchId, batch.checksum]);
  const root = seqHash;
  const envelopeRoot = hash(records.map(record => record.envelopeHash));
  const byteLength = Buffer.byteLength(JSON.stringify(records));
  const range = {
    locatorHash,
    identityHash,
    root,
    envelopeRoot,
    byteLength,
    kind: 'sqlite' as const,
  };
  const inventoryHash = hash([locatorHash]);
  const snapshotRoot = hash([[locatorHash, root]]);

  const manifest = makeManifest({
    version: 2,
    scope,
    reader: 'aiusage',
    collectorVersion: 'incept-collector/1',
    epoch: 0,
    parent: null,
    read: {
      status: 'complete',
      inventoryHash,
      beforeRoot: snapshotRoot,
      afterRoot: snapshotRoot,
      snapshotRoot,
    },
    ranges: [range],
    recordCount: records.length,
    sequenceHash: seqHash,
    basisHash: hash(basis),
    mappingsHash: hash(mappings),
    merkleRoot: mRoot,
    intent: 'observe',
  });

  const header: SyncHeader = {
    batchId: `cold-w1-${hash(['cold-w1', scopeId, batch.checksum, seqHash]).slice(0, 24)}`,
    basis,
    mappings,
    manifest,
  };

  validateHeader(header);
  for (let offset = 0; offset < records.length; offset += 500) {
    validateRecords(records.slice(offset, offset + 500), header);
  }

  const tokens = emptyBucket();
  for (const event of sortedEvents) addEventToBucket(tokens, event);

  return {
    scope,
    scopeId,
    deviceLabel: batch.deviceLabel,
    batchId: header.batchId,
    sourceBatchChecksum: batch.checksum,
    header,
    records,
    tokens,
  };
}

export function ingestColdBaselineWave1(options: Wave1IngestOptions): Wave1IngestResult {
  if (!isAbsolute(options.targetV4Path)) throw new Error('ABSOLUTE_PATH_REQUIRED');
  if (!existsSync(options.targetV4Path)) throw new Error(`TARGET_NOT_FOUND:${options.targetV4Path}`);
  if (!options.v1ImportPaths.length) throw new Error('V1_IMPORTS_REQUIRED');
  const resolvedTarget = resolve(options.targetV4Path);
  for (const v1Path of options.v1ImportPaths) {
    if (!isAbsolute(v1Path)) throw new Error('ABSOLUTE_PATH_REQUIRED');
    if (resolve(v1Path) === resolvedTarget) throw new Error('DISTINCT_TARGET_REQUIRED');
  }

  const { cutoffMs, cutoffIso } = parseCutoffMs(options.cutoff);

  // Open target read-only first during planning so dry-run never touches target disk files.
  const preDb = new DatabaseSync(resolvedTarget, { readOnly: true });
  let beforeSnap: ReturnType<typeof snapshotVisibleLedger>;
  try {
    preDb.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=5000;');
    beforeSnap = snapshotVisibleLedger(preDb);
  } finally {
    preDb.close();
  }

  const seenBatchChecksums = new Set<string>();
  const claimedSessions = new Set(beforeSnap.existingSessionKeys);
  const plans: ScopePlan[] = [];
  const plannedTokens = emptyBucket();
  const plannedBySource = new Map<string, TokenBucket>();
  const plannedByDate = new Map<string, TokenBucket>();

  let batchesScanned = 0;
  let batchesWithFreshScopes = 0;
  let skippedExistingScopes = 0;
  let skippedDuplicateBatches = 0;
  let skippedPostCutoffRecords = 0;

  for (const v1Path of options.v1ImportPaths) {
    const batches = readActiveV1BatchesReadOnly(v1Path);
    for (const batch of batches) {
      batchesScanned++;
      if (seenBatchChecksums.has(batch.checksum)) {
        skippedDuplicateBatches++;
        continue;
      }
      seenBatchChecksums.add(batch.checksum);

      const grouped = new Map<string, { source: TransferSource; sessionId: string; events: TransferEvent[] }>();
      for (const event of batch.events) {
        if (eventTokens(event) <= 0) continue;
        if (event.timestampMs >= cutoffMs) {
          skippedPostCutoffRecords++;
          continue;
        }
        const sKey = `${event.source}:${event.sessionId}`;
        let group = grouped.get(sKey);
        if (!group) {
          group = { source: event.source, sessionId: event.sessionId, events: [] };
          grouped.set(sKey, group);
        }
        group.events.push(event);
      }

      let freshInBatch = 0;
      const sortedKeys = [...grouped.keys()].sort((a, b) => a.localeCompare(b, 'en'));
      for (const sKey of sortedKeys) {
        if (claimedSessions.has(sKey)) {
          skippedExistingScopes++;
          continue;
        }
        const group = grouped.get(sKey)!;
        const plan = buildScopePlan(batch, group.source, group.sessionId, group.events);
        plans.push(plan);
        claimedSessions.add(sKey);
        freshInBatch++;
        for (const event of group.events) {
          addEventToBucket(plannedTokens, event);
          let srcRow = plannedBySource.get(event.source);
          if (!srcRow) {
            srcRow = emptyBucket();
            plannedBySource.set(event.source, srcRow);
          }
          addEventToBucket(srcRow, event);
          const dk = dashboardDate(event.timestampMs);
          let dateRow = plannedByDate.get(dk);
          if (!dateRow) {
            dateRow = emptyBucket();
            plannedByDate.set(dk, dateRow);
          }
          addEventToBucket(dateRow, event);
        }
      }
      if (freshInBatch > 0) batchesWithFreshScopes++;
    }
  }

  const expectedGuardrailMatch =
    (options.expectedRecords === undefined || plannedTokens.records === options.expectedRecords)
    && (options.expectedTokens === undefined || plannedTokens.totalTokens === options.expectedTokens);

  const plannedBySourceObj = Object.fromEntries(
    [...plannedBySource.entries()].sort(([a], [b]) => a.localeCompare(b, 'en')),
  );

  if (!expectedGuardrailMatch) {
    throw new Error(
      `EXPECTED_WAVE1_MISMATCH:planned=${plannedTokens.records}/${plannedTokens.totalTokens}`
      + `,expected=${options.expectedRecords ?? '*'}/${options.expectedTokens ?? '*'}`,
    );
  }

  if (options.apply !== true) {
    return {
      ok: true,
      dryRun: true,
      cutoffIso,
      cutoffMs,
      before: {
        revision: beforeSnap.revision,
        scopes: beforeSnap.scopes,
        visible: beforeSnap.visible,
        activeLegacyBatches: beforeSnap.activeLegacyBatches,
      },
      planned: {
        batchesScanned,
        batchesWithFreshScopes,
        scopesToCommit: plans.length,
        tokens: plannedTokens,
        bySource: plannedBySourceObj,
        skippedExistingScopes,
        skippedDuplicateBatches,
        skippedPostCutoffRecords,
      },
      invariants: {
        expectedGuardrailMatch,
        preExistingScopesUntouched: true,
        deltaMatchesPlanned: true,
        bySourceExactMatch: true,
        byDateExactMatch: true,
        activeLegacyBatchesZero: beforeSnap.activeLegacyBatches === 0,
        sqliteQuickCheckOk: true,
      },
    };
  }

  const service = new CompatibleSyncService(resolvedTarget);
  let committedScopes = 0;
  let unchangedScopes = 0;
  try {
    service.owner(options.actor);
    for (const plan of plans) {
      service.register(plan.scope, `Wave-1 historical import (${plan.deviceLabel})`, options.actor);
      const began = service.begin(plan.header, options.actor);
      if (began.receipt) {
        if (began.receipt.status !== 'committed') {
          throw new Error(`WAVE1_COMMIT_REJECTED:${plan.scopeId}:${began.receipt.code}`);
        }
        unchangedScopes++;
        continue;
      }
      let offset = began.nextOffset;
      while (offset < plan.records.length) {
        const page = plan.records.slice(offset, offset + 500);
        offset = service.stage(plan.scope.deviceId, plan.header.batchId, offset, page, options.actor);
      }
      const receipt = service.commit(plan.scope.deviceId, plan.header.batchId, options.actor);
      if (receipt.status !== 'committed') {
        throw new Error(`WAVE1_COMMIT_REJECTED:${plan.scopeId}:${receipt.code}`);
      }
      service.audit('cold-baseline-wave1-ingest', plan.scopeId, plan.header.manifest.manifestHash, options.actor);
      committedScopes++;
    }

    const afterSnap = snapshotVisibleLedger(service.db);
    const quickCheck = service.db.prepare('PRAGMA quick_check').all() as Array<{ quick_check?: string }>;
    const sqliteQuickCheckOk = quickCheck.length > 0 && quickCheck.every(row => row.quick_check === 'ok');

    const preExistingScopesUntouched = [...beforeSnap.scopeFingerprints.entries()].every(
      ([scopeId, fp]) => afterSnap.scopeFingerprints.get(scopeId) === fp,
    );
    const deltaMatchesPlanned = bucketsEqual(subtractBuckets(afterSnap.visible, beforeSnap.visible), plannedTokens);

    const allSources = new Set([...beforeSnap.bySource.keys(), ...afterSnap.bySource.keys(), ...plannedBySource.keys()]);
    const bySourceExactMatch = [...allSources].every(source => {
      const before = beforeSnap.bySource.get(source) ?? emptyBucket();
      const after = afterSnap.bySource.get(source) ?? emptyBucket();
      const planned = plannedBySource.get(source) ?? emptyBucket();
      return bucketsEqual(subtractBuckets(after, before), planned);
    });

    const allDates = new Set([...beforeSnap.byDate.keys(), ...afterSnap.byDate.keys(), ...plannedByDate.keys()]);
    const byDateExactMatch = [...allDates].every(dateKey => {
      const before = beforeSnap.byDate.get(dateKey) ?? emptyBucket();
      const after = afterSnap.byDate.get(dateKey) ?? emptyBucket();
      const planned = plannedByDate.get(dateKey) ?? emptyBucket();
      return bucketsEqual(subtractBuckets(after, before), planned);
    });

    const activeLegacyBatchesZero = afterSnap.activeLegacyBatches === 0;
    const ok = expectedGuardrailMatch
      && preExistingScopesUntouched
      && deltaMatchesPlanned
      && bySourceExactMatch
      && byDateExactMatch
      && activeLegacyBatchesZero
      && sqliteQuickCheckOk;

    return {
      ok,
      dryRun: false,
      cutoffIso,
      cutoffMs,
      before: {
        revision: beforeSnap.revision,
        scopes: beforeSnap.scopes,
        visible: beforeSnap.visible,
        activeLegacyBatches: beforeSnap.activeLegacyBatches,
      },
      planned: {
        batchesScanned,
        batchesWithFreshScopes,
        scopesToCommit: plans.length,
        tokens: plannedTokens,
        bySource: plannedBySourceObj,
        skippedExistingScopes,
        skippedDuplicateBatches,
        skippedPostCutoffRecords,
      },
      after: {
        revision: afterSnap.revision,
        scopes: afterSnap.scopes,
        visible: afterSnap.visible,
        activeLegacyBatches: afterSnap.activeLegacyBatches,
        committedScopes,
        unchangedScopes,
      },
      invariants: {
        expectedGuardrailMatch,
        preExistingScopesUntouched,
        deltaMatchesPlanned,
        bySourceExactMatch,
        byDateExactMatch,
        activeLegacyBatchesZero,
        sqliteQuickCheckOk,
      },
    };
  } finally {
    service.close();
  }
}
