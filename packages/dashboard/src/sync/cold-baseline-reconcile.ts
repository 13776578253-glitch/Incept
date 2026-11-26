import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dashboardDate, dateWindow, type TransferBundle, type TransferEvent, type TransferSource, type UsageRange } from '../domain';
import type { SyncRecord, SyncScope } from '../domain/sync';
import { collectAiusageAndRawAgentEvents } from '../adapters/local/collectors/agents';
import { collectCommandCodeEvents } from '../adapters/local/collectors/commandcode';
import { normalizeFile } from '../adapters/local/collectors/common';
import { contentHash, eventTokens, hash, nativeEventId, recordHash } from '../adapters/local/imports/identity';
import { canonicalTransferId, hasWeakIdentity } from '../adapters/local/imports/matching';
import { validateBundle } from '../adapters/local/imports/validation';

export type BaselineMode = 'prod-v4' | 'local-native' | 'archive';

export type TokenBucket = {
  records: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  reasoningTokens: number;
};

export type ProvenanceLayer = {
  id: string;
  kind: 'prod-v4' | 'archive' | 'local-native' | 'local-v1-import' | 'prod-v1-import' | 'device-bundle';
  label: string;
  events: TransferEvent[];
  integrityFlaggedSessions?: string[];
  metadata?: {
    revision?: number;
    unresolvedReviews?: number;
    activeBatches?: number;
    integrityFlaggedSessionCount?: number;
    warnings?: string[];
  };
};

export type ClassificationKind =
  | 'already-in-baseline'
  | 'candidate-add'
  | 'same-session-review'
  | 'conflict';

export type MatchReason =
  | 'exact-id-and-content'
  | 'weak-identity-content-match'
  | 'exact-content-different-id'
  | 'distinct-strong-id-same-content'
  | 'duplicate-within-layer'
  | 'net-new-session'
  | 'collector-integrity-flagged'
  | 'historical-policy-restricted'
  | 'same-session-existing-scope'
  | 'strong-id-content-mismatch'
  | 'weak-identity-ambiguous';

export type ClassifiedItemSummary = {
  layerId: string;
  classification: ClassificationKind;
  reason: MatchReason;
  source: TransferSource;
  sessionHash: string;
  dateRange: { from: string; to: string } | null;
  bucket: TokenBucket;
};

export type HotSessionSummary = {
  source: TransferSource;
  sessionHash: string;
  reason: 'post-cutoff-activity' | 'explicit-active-session' | 'agent-outbox-active';
  preCutoff: TokenBucket;
  postCutoff: TokenBucket;
};

export type LayerReport = {
  id: string;
  kind: ProvenanceLayer['kind'];
  label: string;
  role: 'baseline' | 'candidate';
  inputTotal: TokenBucket;
  postCutoff: TokenBucket;
  excludedHotSessionPreCutoff: TokenBucket;
  evaluatedCold: TokenBucket;
  classifications: Record<ClassificationKind, TokenBucket>;
  bySource: Record<string, Record<ClassificationKind, TokenBucket>>;
  reasonCounts: Partial<Record<MatchReason, number>>;
  metadata?: ProvenanceLayer['metadata'];
};

export type WindowRollup = {
  range: UsageRange;
  from: string;
  to: string;
  baseline: TokenBucket;
  projectedMerged: TokenBucket;
  netAdd: TokenBucket;
};

export type ColdBaselineArchive = {
  format: 'incept-cold-baseline-archive';
  version: 1;
  cutoffIso: string;
  cutoffMs: number;
  baselineMode: BaselineMode;
  excludeActiveSessions: boolean;
  excludedActiveSessionHashes: string[];
  totals: TokenBucket;
  events: TransferEvent[];
  checksum: string;
};

export type AgentPolicySnapshot = {
  sealedScopes: number;
  isolatedScopes: number;
  activeOutboxScopes: number;
  activeIsolationScopes: number;
  outboxActiveSessionKeys: string[];
  policyRestrictedSessionKeys: string[];
};

export type ColdBaselineReport = {
  ok: boolean;
  dryRun: true;
  cutoffIso: string;
  cutoffMs: number;
  baselineMode: BaselineMode;
  excludeActiveSessions: boolean;
  baselineLayerId: string;
  agentPolicies?: Omit<AgentPolicySnapshot, 'outboxActiveSessionKeys' | 'policyRestrictedSessionKeys'>;
  totals: {
    baselineCold: TokenBucket;
    candidateAdd: TokenBucket;
    alreadyInBaseline: TokenBucket;
    sameSessionReview: TokenBucket;
    conflict: TokenBucket;
    excludedHotSessionPreCutoff: TokenBucket;
    postCutoff: TokenBucket;
    projectedMergedCold: TokenBucket;
  };
  bySource: Record<string, {
    baselineCold: TokenBucket;
    candidateAdd: TokenBucket;
    sameSessionReview: TokenBucket;
    conflict: TokenBucket;
    projectedMergedCold: TokenBucket;
  }>;
  byDate: Record<string, {
    baselineCold: TokenBucket;
    candidateAdd: TokenBucket;
    projectedMergedCold: TokenBucket;
  }>;
  windows: WindowRollup[];
  layers: LayerReport[];
  hotSessions: HotSessionSummary[];
  reviewGroups: ClassifiedItemSummary[];
  conflictGroups: ClassifiedItemSummary[];
  invariants: {
    accountingBalanced: boolean;
    deltaMatchesCandidateAdd: boolean;
    bySourceExactMatch: boolean;
    byDateExactMatch: boolean;
    repeatDryRunNetAddZero: boolean;
  };
  archiveChecksum?: string;
  archivePath?: string;
};

export type ReconcileColdBaselineOptions = {
  cutoff: string | number;
  baselineMode?: BaselineMode;
  excludeActiveSessions?: boolean;
  baselineV4Path?: string;
  baselineArchivePath?: string;
  localHome?: string;
  localV1ImportsPath?: string;
  prodV1ImportsPath?: string;
  deviceBundlePaths?: string[];
  agentStateDir?: string;
  explicitActiveSessions?: string[];
  outputArchivePath?: string;
  reportPath?: string;
};

export function emptyBucket(): TokenBucket {
  return {
    records: 0,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
  };
}

function addSafe(left: number, right: number): number {
  const sum = left + right;
  if (!Number.isSafeInteger(sum)) {
    throw new Error('TOKEN_TOTAL_OVERFLOW');
  }
  return sum;
}

export function addEventToBucket(bucket: TokenBucket, event: TransferEvent): void {
  const tokens = eventTokens(event);
  bucket.records = addSafe(bucket.records, 1);
  bucket.totalTokens = addSafe(bucket.totalTokens, tokens);
  bucket.inputTokens = addSafe(bucket.inputTokens, event.inputTokens);
  bucket.outputTokens = addSafe(bucket.outputTokens, event.outputTokens);
  bucket.cacheReadTokens = addSafe(bucket.cacheReadTokens, event.cacheReadTokens);
  bucket.cacheCreationTokens = addSafe(bucket.cacheCreationTokens, event.cacheCreationTokens);
  bucket.reasoningTokens = addSafe(bucket.reasoningTokens, event.reasoningTokens);
}

export function addBuckets(left: TokenBucket, right: TokenBucket): TokenBucket {
  return {
    records: addSafe(left.records, right.records),
    totalTokens: addSafe(left.totalTokens, right.totalTokens),
    inputTokens: addSafe(left.inputTokens, right.inputTokens),
    outputTokens: addSafe(left.outputTokens, right.outputTokens),
    cacheReadTokens: addSafe(left.cacheReadTokens, right.cacheReadTokens),
    cacheCreationTokens: addSafe(left.cacheCreationTokens, right.cacheCreationTokens),
    reasoningTokens: addSafe(left.reasoningTokens, right.reasoningTokens),
  };
}

export function subtractBuckets(after: TokenBucket, before: TokenBucket): TokenBucket {
  return {
    records: after.records - before.records,
    totalTokens: after.totalTokens - before.totalTokens,
    inputTokens: after.inputTokens - before.inputTokens,
    outputTokens: after.outputTokens - before.outputTokens,
    cacheReadTokens: after.cacheReadTokens - before.cacheReadTokens,
    cacheCreationTokens: after.cacheCreationTokens - before.cacheCreationTokens,
    reasoningTokens: after.reasoningTokens - before.reasoningTokens,
  };
}

export function bucketsEqual(left: TokenBucket, right: TokenBucket): boolean {
  return left.records === right.records
    && left.totalTokens === right.totalTokens
    && left.inputTokens === right.inputTokens
    && left.outputTokens === right.outputTokens
    && left.cacheReadTokens === right.cacheReadTokens
    && left.cacheCreationTokens === right.cacheCreationTokens
    && left.reasoningTokens === right.reasoningTokens;
}

export function parseCutoffMs(cutoff: string | number): { cutoffMs: number; cutoffIso: string } {
  if (typeof cutoff === 'number') {
    if (!Number.isSafeInteger(cutoff) || cutoff <= 0) {
      throw new Error('INVALID_CUTOFF');
    }
    return { cutoffMs: cutoff, cutoffIso: new Date(cutoff).toISOString() };
  }
  const trimmed = cutoff.trim();
  if (/^\d+$/.test(trimmed)) {
    const ms = Number(trimmed);
    if (!Number.isSafeInteger(ms) || ms <= 0) {
      throw new Error('INVALID_CUTOFF');
    }
    return { cutoffMs: ms, cutoffIso: new Date(ms).toISOString() };
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('INVALID_CUTOFF');
  }
  return { cutoffMs: parsed, cutoffIso: new Date(parsed).toISOString() };
}

function normalizeModel(modelName: string): string {
  return modelName.trim().toLowerCase();
}

function sessionKey(source: TransferSource, sessionId: string): string {
  return `${source}:${sessionId}`;
}

function anonymizeSession(source: TransferSource, sessionId: string): string {
  return hash([source, sessionId]).slice(0, 12);
}

function sortEventsDeterministically(events: readonly TransferEvent[]): TransferEvent[] {
  return [...events].sort((a, b) =>
    a.timestampMs - b.timestampMs
    || a.source.localeCompare(b.source, 'en')
    || a.sessionId.localeCompare(b.sessionId, 'en')
    || a.eventId.localeCompare(b.eventId, 'en'));
}

function emptyClassificationRecord(): Record<ClassificationKind, TokenBucket> {
  return {
    'already-in-baseline': emptyBucket(),
    'candidate-add': emptyBucket(),
    'same-session-review': emptyBucket(),
    conflict: emptyBucket(),
  };
}

function readOnlySqlite(filePath: string): DatabaseSync {
  if (!isAbsolute(filePath)) throw new Error('ABSOLUTE_PATH_REQUIRED');
  if (!existsSync(filePath)) throw new Error(`SOURCE_NOT_FOUND:${filePath}`);
  const db = new DatabaseSync(filePath, { readOnly: true });
  db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=5000;');
  return db;
}

export function readProdV4Layer(dbPath: string): ProvenanceLayer {
  const db = readOnlySqlite(dbPath);
  try {
    const meta = db.prepare('SELECT data_revision FROM sync_meta WHERE id=1').get() as { data_revision?: number } | undefined;
    const revision = Number(meta?.data_revision ?? 0);
    const reviewRow = db.prepare(`
      SELECT COUNT(*) AS n
      FROM sync_reviews r
      LEFT JOIN sync_review_resolutions res ON res.review_id = r.id
      WHERE res.review_id IS NULL
    `).get() as { n?: number } | undefined;
    const unresolvedReviews = Number(reviewRow?.n ?? 0);

    const events: TransferEvent[] = [];
    for (const row of db.prepare(`
      SELECT o.record_json, r.scope_json
      FROM sync_current c
      JOIN sync_observations o ON o.id = c.observation_id
      JOIN sync_scopes s ON s.scope_id = c.scope_id
      JOIN sync_origins r ON r.scope_id = c.scope_id
      WHERE s.visible_generation IS NOT NULL
      ORDER BY c.scope_id, c.position
    `).iterate()) {
      const record = JSON.parse(String(row.record_json)) as SyncRecord;
      const scope = JSON.parse(String(row.scope_json)) as SyncScope;
      const event: TransferEvent = {
        ...record.event,
        source: scope.source,
        sessionId: scope.sessionId,
      };
      if (eventTokens(event) > 0) events.push(event);
    }

    // Also read any active migrated legacy projection rows that have not been adopted.
    for (const row of db.prepare(`
      SELECT o.record_json
      FROM sync_legacy_projection p
      JOIN sync_observations o ON o.id = p.observation_id
      LEFT JOIN sync_adoptions a ON a.batch_id = p.batch_id AND a.position = p.position
      LEFT JOIN sync_scopes s ON s.scope_id = a.scope_id
      WHERE s.visible_generation IS NULL
      ORDER BY p.source_order, p.position
    `).iterate()) {
      const record = JSON.parse(String(row.record_json)) as SyncRecord;
      if (eventTokens(record.event) > 0) events.push(record.event);
    }

    return {
      id: 'prod-v4',
      kind: 'prod-v4',
      label: 'Production V4 Ledger Backup',
      events,
      metadata: { revision, unresolvedReviews },
    };
  } finally {
    db.close();
  }
}

export function readV1ImportsLayer(
  dbPath: string,
  id: 'local-v1-import' | 'prod-v1-import',
  label: string,
): ProvenanceLayer {
  const db = readOnlySqlite(dbPath);
  try {
    const events: TransferEvent[] = [];
    let activeBatches = 0;
    for (const row of db.prepare("SELECT payload FROM batches WHERE status='active' ORDER BY rowid ASC").iterate()) {
      activeBatches++;
      const payload = JSON.parse(String(row.payload)) as { bundle: TransferBundle };
      for (const event of payload.bundle.events) {
        if (eventTokens(event) > 0) events.push(event);
      }
    }
    return {
      id,
      kind: id,
      label,
      events,
      metadata: { activeBatches },
    };
  } finally {
    db.close();
  }
}

export function readLocalNativeLayer(home: string): ProvenanceLayer {
  if (!isAbsolute(home)) throw new Error('ABSOLUTE_PATH_REQUIRED');
  if (!existsSync(home)) throw new Error(`SOURCE_NOT_FOUND:${home}`);
  const emptyPricing = new Map();
  const commandcode = collectCommandCodeEvents(home, emptyPricing);
  const agents = collectAiusageAndRawAgentEvents(home, emptyPricing);
  const commandFiles = new Set(commandcode.events.flatMap(event => event.sourceFile ? [normalizeFile(event.sourceFile)] : []));
  const agentEvents = agents.events.filter(
    event => event.sourceId !== 'commandcode' || !event.sourceFile || !commandFiles.has(normalizeFile(event.sourceFile)),
  );
  const combined = [...commandcode.events, ...agentEvents];
  const integrityFlagged = new Set<string>();
  for (const diagnostic of agents.sessionIntegrity) {
    integrityFlagged.add(sessionKey(diagnostic.source as TransferSource, diagnostic.sessionId));
  }
  const events: TransferEvent[] = [];
  for (const raw of combined) {
    if (raw.historyIncomplete) {
      integrityFlagged.add(sessionKey(raw.sourceId as TransferSource, raw.sessionId));
    }
    const event: TransferEvent = {
      eventId: nativeEventId(raw),
      source: raw.sourceId as TransferSource,
      sessionId: raw.sessionId,
      timestampMs: raw.timestampMs,
      modelName: raw.modelName,
      projectKey: raw.projectKey + ':' + hash(raw.workspacePath ?? raw.projectKey).slice(0, 16),
      projectName: raw.projectName,
      ...(raw.workspacePath ? { workspacePath: raw.workspacePath } : {}),
      ...(raw.sessionTitle ? { sessionTitle: raw.sessionTitle } : {}),
      inputTokens: raw.inputTokens,
      outputTokens: raw.outputTokens,
      cacheReadTokens: raw.cacheReadTokens,
      cacheCreationTokens: raw.cacheCreationTokens,
      reasoningTokens: raw.reasoningTokens,
      ...(raw.costSource === 'recorded' && raw.sourceId !== 'codex'
        ? { recordedCost: raw.nominalCost ?? raw.cost }
        : {}),
    };
    event.eventId = canonicalTransferId(event);
    if (eventTokens(event) > 0) events.push(event);
  }
  const warnings = [
    ...commandcode.errors,
    ...agents.errors,
    ...agents.harnessDiagnostics.map(item => `deepseekHarness:${item.reason}:${item.sessionId ?? 'unidentified'}`),
  ];
  const integrityFlaggedSessions = [...integrityFlagged].sort();
  return {
    id: 'local-native',
    kind: 'local-native',
    label: 'Local Native Collectors',
    events,
    ...(integrityFlaggedSessions.length ? { integrityFlaggedSessions } : {}),
    metadata: {
      ...(integrityFlaggedSessions.length ? { integrityFlaggedSessionCount: integrityFlaggedSessions.length } : {}),
      ...(warnings.length ? { warnings: [...new Set(warnings)] } : {}),
    },
  };
}

export function readDeviceBundleLayer(bundlePath: string, index: number): ProvenanceLayer {
  if (!isAbsolute(bundlePath)) throw new Error('ABSOLUTE_PATH_REQUIRED');
  if (!existsSync(bundlePath)) throw new Error(`SOURCE_NOT_FOUND:${bundlePath}`);
  const parsed = JSON.parse(readFileSync(bundlePath, 'utf8'));
  const bundle = validateBundle(parsed);
  return {
    id: `device-bundle-${index + 1}`,
    kind: 'device-bundle',
    label: `Device Bundle (${bundle.device.label})`,
    events: bundle.events.filter(event => eventTokens(event) > 0),
    metadata: bundle.warnings.length ? { warnings: [...bundle.warnings] } : undefined,
  };
}

export function readColdBaselineArchive(archivePath: string): ColdBaselineArchive {
  if (!isAbsolute(archivePath)) throw new Error('ABSOLUTE_PATH_REQUIRED');
  if (!existsSync(archivePath)) throw new Error(`SOURCE_NOT_FOUND:${archivePath}`);
  const raw = JSON.parse(readFileSync(archivePath, 'utf8')) as ColdBaselineArchive;
  if (!raw || raw.format !== 'incept-cold-baseline-archive' || raw.version !== 1) {
    throw new Error('INVALID_COLD_BASELINE_ARCHIVE');
  }
  const { checksum, ...body } = raw;
  if (typeof checksum !== 'string' || hash(body) !== checksum) {
    throw new Error('COLD_BASELINE_ARCHIVE_CHECKSUM_MISMATCH');
  }
  return raw;
}

export function readAgentPolicySnapshot(stateDir: string): AgentPolicySnapshot {
  if (!isAbsolute(stateDir)) throw new Error('ABSOLUTE_PATH_REQUIRED');
  const dbPath = resolve(stateDir, 'state.db');
  const db = readOnlySqlite(dbPath);
  try {
    let sealedScopes = 0;
    let isolatedScopes = 0;
    const policyRestricted = new Set<string>();
    for (const row of db.prepare('SELECT seal_json FROM historical_seals').iterate()) {
      const seal = JSON.parse(String(row.seal_json)) as {
        disposition?: string;
        source?: TransferSource;
        sessionId?: string;
      };
      if (seal.disposition === 'isolated') isolatedScopes++;
      else sealedScopes++;
      if (seal.source && seal.sessionId) {
        policyRestricted.add(sessionKey(seal.source, seal.sessionId));
      }
    }
    const outboxKeys = new Set<string>();
    for (const row of db.prepare("SELECT header_json FROM outbox WHERE state IN ('pending','held','review','quarantined','lineage')").iterate()) {
      const header = JSON.parse(String(row.header_json)) as {
        manifest?: { scope?: { source?: TransferSource; sessionId?: string } };
      };
      const source = header.manifest?.scope?.source;
      const sessionId = header.manifest?.scope?.sessionId;
      if (source && sessionId) outboxKeys.add(sessionKey(source, sessionId));
    }
    let activeIsolationScopes = 0;
    try {
      const isoRow = db.prepare("SELECT COUNT(DISTINCT source || ':' || session_id) AS n FROM session_isolations WHERE active = 1").get() as { n?: number } | undefined;
      activeIsolationScopes = Number(isoRow?.n ?? 0);
    } catch {
      // Older or minimal test agent databases may omit session_isolations.
    }
    return {
      sealedScopes,
      isolatedScopes,
      activeOutboxScopes: outboxKeys.size,
      activeIsolationScopes,
      outboxActiveSessionKeys: [...outboxKeys].sort(),
      policyRestrictedSessionKeys: [...policyRestricted].sort(),
    };
  } finally {
    db.close();
  }
}

type AcceptedIndex = {
  strongById: Map<string, { contentKey: string; recordKey: string; event: TransferEvent }>;
  contentCounts: Map<string, number>;
  weakContentKeys: Set<string>;
  sessionKeys: Set<string>;
};

function createAcceptedIndex(): AcceptedIndex {
  return {
    strongById: new Map(),
    contentCounts: new Map(),
    weakContentKeys: new Set(),
    sessionKeys: new Set(),
  };
}

function addAcceptedEvent(index: AcceptedIndex, event: TransferEvent): void {
  const id = canonicalTransferId(event);
  const normalized = normalizeModel(event.modelName);
  const cKey = contentHash(event, normalized);
  const rKey = recordHash(event, normalized);
  if (!hasWeakIdentity(event)) {
    if (!index.strongById.has(id)) {
      index.strongById.set(id, { contentKey: cKey, recordKey: rKey, event });
    }
  } else {
    index.weakContentKeys.add(cKey);
  }
  index.contentCounts.set(cKey, (index.contentCounts.get(cKey) ?? 0) + 1);
  index.sessionKeys.add(sessionKey(event.source, event.sessionId));
}

function bumpReason(counts: Partial<Record<MatchReason, number>>, reason: MatchReason): void {
  counts[reason] = (counts[reason] ?? 0) + 1;
}

function updateGroup(
  map: Map<string, ClassifiedItemSummary>,
  layerId: string,
  classification: ClassificationKind,
  reason: MatchReason,
  event: TransferEvent,
): void {
  const sHash = anonymizeSession(event.source, event.sessionId);
  const key = `${layerId}|${classification}|${reason}|${event.source}|${sHash}`;
  const dateKey = dashboardDate(event.timestampMs);
  let entry = map.get(key);
  if (!entry) {
    entry = {
      layerId,
      classification,
      reason,
      source: event.source,
      sessionHash: sHash,
      dateRange: { from: dateKey, to: dateKey },
      bucket: emptyBucket(),
    };
    map.set(key, entry);
  }
  addEventToBucket(entry.bucket, event);
  if (entry.dateRange) {
    if (dateKey < entry.dateRange.from) entry.dateRange.from = dateKey;
    if (dateKey > entry.dateRange.to) entry.dateRange.to = dateKey;
  }
}

export type InMemoryReconcileInput = {
  cutoff: string | number;
  baselineMode: BaselineMode;
  baselineLayer: ProvenanceLayer;
  candidateLayers: ProvenanceLayer[];
  excludeActiveSessions?: boolean;
  explicitActiveSessions?: string[];
  agentPolicies?: AgentPolicySnapshot;
  skipSecondPassCheck?: boolean;
};

export function reconcileColdBaselineEvents(input: InMemoryReconcileInput): {
  report: ColdBaselineReport;
  archive: ColdBaselineArchive;
} {
  const { cutoffMs, cutoffIso } = parseCutoffMs(input.cutoff);
  const excludeActiveSessions = input.excludeActiveSessions !== false;
  const allLayers = [input.baselineLayer, ...input.candidateLayers];

  // Phase 1: Identify hot/active cross-day sessions across all inputs.
  const hotReasonByKey = new Map<string, HotSessionSummary['reason']>();
  const hotSessionSource = new Map<string, TransferSource>();
  const hotSessionId = new Map<string, string>();

  if (excludeActiveSessions) {
    for (const rawKey of input.explicitActiveSessions ?? []) {
      const sep = rawKey.indexOf(':');
      if (sep <= 0) continue;
      const src = rawKey.slice(0, sep) as TransferSource;
      const sid = rawKey.slice(sep + 1);
      const key = sessionKey(src, sid);
      hotReasonByKey.set(key, 'explicit-active-session');
      hotSessionSource.set(key, src);
      hotSessionId.set(key, sid);
    }
    for (const rawKey of input.agentPolicies?.outboxActiveSessionKeys ?? []) {
      const sep = rawKey.indexOf(':');
      if (sep <= 0) continue;
      const src = rawKey.slice(0, sep) as TransferSource;
      const sid = rawKey.slice(sep + 1);
      const key = sessionKey(src, sid);
      if (!hotReasonByKey.has(key)) {
        hotReasonByKey.set(key, 'agent-outbox-active');
        hotSessionSource.set(key, src);
        hotSessionId.set(key, sid);
      }
    }
    for (const layer of allLayers) {
      for (const event of layer.events) {
        if (event.timestampMs >= cutoffMs) {
          const key = sessionKey(event.source, event.sessionId);
          if (!hotReasonByKey.has(key)) {
            hotReasonByKey.set(key, 'post-cutoff-activity');
            hotSessionSource.set(key, event.source);
            hotSessionId.set(key, event.sessionId);
          }
        }
      }
    }
  }

  const hotSummaryMap = new Map<string, HotSessionSummary>();
  const ensureHotSummary = (key: string, source: TransferSource, sessionId: string) => {
    let summary = hotSummaryMap.get(key);
    if (!summary) {
      summary = {
        source,
        sessionHash: anonymizeSession(source, sessionId),
        reason: hotReasonByKey.get(key) ?? 'post-cutoff-activity',
        preCutoff: emptyBucket(),
        postCutoff: emptyBucket(),
      };
      hotSummaryMap.set(key, summary);
    }
    return summary;
  };

  // Phase 2: Index baseline cold records.
  const acceptedIndex = createAcceptedIndex();
  const baselineEvents: TransferEvent[] = [];
  const mergedEvents: TransferEvent[] = [];

  const totals = {
    baselineCold: emptyBucket(),
    candidateAdd: emptyBucket(),
    alreadyInBaseline: emptyBucket(),
    sameSessionReview: emptyBucket(),
    conflict: emptyBucket(),
    excludedHotSessionPreCutoff: emptyBucket(),
    postCutoff: emptyBucket(),
    projectedMergedCold: emptyBucket(),
  };

  const bySource = new Map<string, {
    baselineCold: TokenBucket;
    candidateAdd: TokenBucket;
    sameSessionReview: TokenBucket;
    conflict: TokenBucket;
    projectedMergedCold: TokenBucket;
  }>();
  const ensureSource = (source: string) => {
    let row = bySource.get(source);
    if (!row) {
      row = {
        baselineCold: emptyBucket(),
        candidateAdd: emptyBucket(),
        sameSessionReview: emptyBucket(),
        conflict: emptyBucket(),
        projectedMergedCold: emptyBucket(),
      };
      bySource.set(source, row);
    }
    return row;
  };

  const byDate = new Map<string, {
    baselineCold: TokenBucket;
    candidateAdd: TokenBucket;
    projectedMergedCold: TokenBucket;
  }>();
  const ensureDate = (dateKey: string) => {
    let row = byDate.get(dateKey);
    if (!row) {
      row = {
        baselineCold: emptyBucket(),
        candidateAdd: emptyBucket(),
        projectedMergedCold: emptyBucket(),
      };
      byDate.set(dateKey, row);
    }
    return row;
  };

  const layerReports: LayerReport[] = [];

  // Process baseline layer.
  const baselineLayerReport: LayerReport = {
    id: input.baselineLayer.id,
    kind: input.baselineLayer.kind,
    label: input.baselineLayer.label,
    role: 'baseline',
    inputTotal: emptyBucket(),
    postCutoff: emptyBucket(),
    excludedHotSessionPreCutoff: emptyBucket(),
    evaluatedCold: emptyBucket(),
    classifications: emptyClassificationRecord(),
    bySource: {},
    reasonCounts: {},
    ...(input.baselineLayer.metadata ? { metadata: input.baselineLayer.metadata } : {}),
  };

  for (const event of input.baselineLayer.events) {
    addEventToBucket(baselineLayerReport.inputTotal, event);
    const sKey = sessionKey(event.source, event.sessionId);
    if (event.timestampMs >= cutoffMs) {
      addEventToBucket(baselineLayerReport.postCutoff, event);
      addEventToBucket(totals.postCutoff, event);
      if (hotReasonByKey.has(sKey)) {
        addEventToBucket(ensureHotSummary(sKey, event.source, event.sessionId).postCutoff, event);
      }
      continue;
    }
    if (excludeActiveSessions && hotReasonByKey.has(sKey)) {
      addEventToBucket(baselineLayerReport.excludedHotSessionPreCutoff, event);
      addEventToBucket(totals.excludedHotSessionPreCutoff, event);
      addEventToBucket(ensureHotSummary(sKey, event.source, event.sessionId).preCutoff, event);
      continue;
    }
    addEventToBucket(baselineLayerReport.evaluatedCold, event);
    addEventToBucket(baselineLayerReport.classifications['already-in-baseline'], event);
    addEventToBucket(totals.baselineCold, event);
    addEventToBucket(totals.projectedMergedCold, event);
    const sourceRow = ensureSource(event.source);
    addEventToBucket(sourceRow.baselineCold, event);
    addEventToBucket(sourceRow.projectedMergedCold, event);
    const dateRow = ensureDate(dashboardDate(event.timestampMs));
    addEventToBucket(dateRow.baselineCold, event);
    addEventToBucket(dateRow.projectedMergedCold, event);

    addAcceptedEvent(acceptedIndex, event);
    baselineEvents.push(event);
    mergedEvents.push(event);
  }
  layerReports.push(baselineLayerReport);

  // Phase 3: Reconcile candidate layers in priority order.
  const reviewGroupMap = new Map<string, ClassifiedItemSummary>();
  const conflictGroupMap = new Map<string, ClassifiedItemSummary>();

  for (const layer of input.candidateLayers) {
    const report: LayerReport = {
      id: layer.id,
      kind: layer.kind,
      label: layer.label,
      role: 'candidate',
      inputTotal: emptyBucket(),
      postCutoff: emptyBucket(),
      excludedHotSessionPreCutoff: emptyBucket(),
      evaluatedCold: emptyBucket(),
      classifications: emptyClassificationRecord(),
      bySource: {},
      reasonCounts: {},
      ...(layer.metadata ? { metadata: layer.metadata } : {}),
    };

    // Snapshot accepted multiset capacities at start of this layer, so duplicate
    // copies inside the same layer are handled via multiset intersection.
    const availableContent = new Map(acceptedIndex.contentCounts);
    const layerStrongSeen = new Map<string, string>();
    const layerWeakContentCount = new Map<string, number>();

    // Count weak-identity content multiplicity inside this layer to detect weak collisions.
    for (const event of layer.events) {
      if (event.timestampMs >= cutoffMs) continue;
      if (excludeActiveSessions && hotReasonByKey.has(sessionKey(event.source, event.sessionId))) continue;
      if (hasWeakIdentity(event)) {
        const cKey = contentHash(event, normalizeModel(event.modelName));
        layerWeakContentCount.set(cKey, (layerWeakContentCount.get(cKey) ?? 0) + 1);
      }
    }

    const newlyAcceptedInLayer: TransferEvent[] = [];
    const existingSessionsAtLayerStart = new Set(acceptedIndex.sessionKeys);
    const integrityFlaggedSet = new Set(layer.integrityFlaggedSessions ?? []);
    const policyRestrictedSet = new Set(input.agentPolicies?.policyRestrictedSessionKeys ?? []);
    const strictStrongIdForLayer = layer.kind === 'local-native';

    for (const event of layer.events) {
      addEventToBucket(report.inputTotal, event);
      const sKey = sessionKey(event.source, event.sessionId);
      if (event.timestampMs >= cutoffMs) {
        addEventToBucket(report.postCutoff, event);
        addEventToBucket(totals.postCutoff, event);
        if (hotReasonByKey.has(sKey)) {
          addEventToBucket(ensureHotSummary(sKey, event.source, event.sessionId).postCutoff, event);
        }
        continue;
      }
      if (excludeActiveSessions && hotReasonByKey.has(sKey)) {
        addEventToBucket(report.excludedHotSessionPreCutoff, event);
        addEventToBucket(totals.excludedHotSessionPreCutoff, event);
        addEventToBucket(ensureHotSummary(sKey, event.source, event.sessionId).preCutoff, event);
        continue;
      }

      addEventToBucket(report.evaluatedCold, event);

      const id = canonicalTransferId(event);
      const weak = hasWeakIdentity(event);
      const cKey = contentHash(event, normalizeModel(event.modelName));
      let classification: ClassificationKind;
      let reason: MatchReason;

      // 1. Duplicate or conflicting strong ID within the same candidate layer.
      if (!weak && layerStrongSeen.has(id)) {
        if (layerStrongSeen.get(id) === cKey) {
          classification = 'already-in-baseline';
          reason = 'duplicate-within-layer';
        } else {
          classification = 'conflict';
          reason = 'strong-id-content-mismatch';
        }
      } else if (!weak && acceptedIndex.strongById.has(id)) {
        // 2. Strong ID match against baseline / earlier accepted layer.
        const prior = acceptedIndex.strongById.get(id)!;
        if (prior.contentKey === cKey) {
          classification = 'already-in-baseline';
          reason = 'exact-id-and-content';
          const remaining = availableContent.get(cKey) ?? 0;
          if (remaining > 0) availableContent.set(cKey, remaining - 1);
        } else {
          classification = 'conflict';
          reason = 'strong-id-content-mismatch';
        }
      } else if ((availableContent.get(cKey) ?? 0) > 0) {
        // 3. Exact multiset content match against baseline / earlier accepted layer.
        const remaining = availableContent.get(cKey)!;
        const weakBridge = weak || acceptedIndex.weakContentKeys.has(cKey);
        if (weak && (layerWeakContentCount.get(cKey) ?? 0) > remaining) {
          classification = 'conflict';
          reason = 'weak-identity-ambiguous';
        } else if (!weakBridge && strictStrongIdForLayer) {
          availableContent.set(cKey, remaining - 1);
          classification = 'same-session-review';
          reason = 'distinct-strong-id-same-content';
        } else {
          availableContent.set(cKey, remaining - 1);
          classification = 'already-in-baseline';
          reason = weakBridge ? 'weak-identity-content-match' : 'exact-content-different-id';
        }
      } else if (existingSessionsAtLayerStart.has(sKey)) {
        // 4. Unmatched record whose (source, sessionId) already exists in baseline/earlier layer.
        classification = 'same-session-review';
        reason = 'same-session-existing-scope';
      } else if (integrityFlaggedSet.has(sKey)) {
        // 5. Collector flagged session integrity (e.g. OPENING_PREFIX_MISSING / INVALID_COUNTER).
        classification = 'same-session-review';
        reason = 'collector-integrity-flagged';
      } else if (policyRestrictedSet.has(sKey)) {
        // 6. Session carries an explicit historical seal or isolation policy.
        classification = 'same-session-review';
        reason = 'historical-policy-restricted';
      } else {
        // 7. Clean net-new session record.
        classification = 'candidate-add';
        reason = 'net-new-session';
        newlyAcceptedInLayer.push(event);
      }

      if (!weak && !layerStrongSeen.has(id)) {
        layerStrongSeen.set(id, cKey);
      }

      addEventToBucket(report.classifications[classification], event);
      report.bySource[event.source] ??= emptyClassificationRecord();
      addEventToBucket(report.bySource[event.source][classification], event);
      bumpReason(report.reasonCounts, reason);

      const sourceRow = ensureSource(event.source);
      if (classification === 'already-in-baseline') {
        addEventToBucket(totals.alreadyInBaseline, event);
      } else if (classification === 'candidate-add') {
        addEventToBucket(totals.candidateAdd, event);
        addEventToBucket(totals.projectedMergedCold, event);
        addEventToBucket(sourceRow.candidateAdd, event);
        addEventToBucket(sourceRow.projectedMergedCold, event);
        const dateRow = ensureDate(dashboardDate(event.timestampMs));
        addEventToBucket(dateRow.candidateAdd, event);
        addEventToBucket(dateRow.projectedMergedCold, event);
        mergedEvents.push(event);
      } else if (classification === 'same-session-review') {
        addEventToBucket(totals.sameSessionReview, event);
        addEventToBucket(sourceRow.sameSessionReview, event);
        updateGroup(reviewGroupMap, layer.id, classification, reason, event);
      } else {
        addEventToBucket(totals.conflict, event);
        addEventToBucket(sourceRow.conflict, event);
        updateGroup(conflictGroupMap, layer.id, classification, reason, event);
      }
    }

    // Commit accepted net-new records from this layer into the running accepted index
    // so subsequent lower-priority layers deduplicate against them cleanly.
    for (const event of newlyAcceptedInLayer) {
      addAcceptedEvent(acceptedIndex, event);
    }
    layerReports.push(report);
  }

  // Phase 4: Build window rollups (7d / 30d / all anchored at cutoffMs - 1).
  const anchorMs = cutoffMs - 1;
  const firstDate = [...byDate.keys()].sort()[0];
  const windows: WindowRollup[] = (['7d', '30d', 'all'] as const).map(range => {
    const win = dateWindow(range, anchorMs, firstDate);
    const baseline = emptyBucket();
    const projectedMerged = emptyBucket();
    for (const event of baselineEvents) {
      const dk = dashboardDate(event.timestampMs);
      if (dk >= win.from && dk <= win.to) addEventToBucket(baseline, event);
    }
    for (const event of mergedEvents) {
      const dk = dashboardDate(event.timestampMs);
      if (dk >= win.from && dk <= win.to) addEventToBucket(projectedMerged, event);
    }
    return {
      range,
      from: win.from,
      to: win.to,
      baseline,
      projectedMerged,
      netAdd: subtractBuckets(projectedMerged, baseline),
    };
  });

  // Phase 5: Build deterministic cold archive candidate & verify invariants.
  const sortedMerged = sortEventsDeterministically(mergedEvents);
  const excludedActiveSessionHashes = [...hotSummaryMap.values()]
    .map(item => `${item.source}:${item.sessionHash}`)
    .sort();

  const archiveBody = {
    format: 'incept-cold-baseline-archive' as const,
    version: 1 as const,
    cutoffIso,
    cutoffMs,
    baselineMode: input.baselineMode,
    excludeActiveSessions,
    excludedActiveSessionHashes,
    totals: totals.projectedMergedCold,
    events: sortedMerged,
  };
  const archive: ColdBaselineArchive = {
    ...archiveBody,
    checksum: hash(archiveBody),
  };

  // Verify accounting invariants.
  const accountingBalanced = layerReports.every(layer => {
    const accounted = addBuckets(
      addBuckets(layer.postCutoff, layer.excludedHotSessionPreCutoff),
      layer.evaluatedCold,
    );
    const classifiedSum = addBuckets(
      addBuckets(layer.classifications['already-in-baseline'], layer.classifications['candidate-add']),
      addBuckets(layer.classifications['same-session-review'], layer.classifications.conflict),
    );
    return bucketsEqual(accounted, layer.inputTotal) && bucketsEqual(classifiedSum, layer.evaluatedCold);
  });

  const deltaMatchesCandidateAdd = bucketsEqual(
    subtractBuckets(totals.projectedMergedCold, totals.baselineCold),
    totals.candidateAdd,
  );

  const bySourceObj = Object.fromEntries([...bySource.entries()].sort(([a], [b]) => a.localeCompare(b, 'en')));
  const byDateObj = Object.fromEntries([...byDate.entries()].sort(([a], [b]) => a.localeCompare(b, 'en')));

  const bySourceExactMatch = Object.values(bySourceObj).every(row =>
    bucketsEqual(subtractBuckets(row.projectedMergedCold, row.baselineCold), row.candidateAdd));
  const byDateExactMatch = Object.values(byDateObj).every(row =>
    bucketsEqual(subtractBuckets(row.projectedMergedCold, row.baselineCold), row.candidateAdd));

  let repeatDryRunNetAddZero = true;
  if (!input.skipSecondPassCheck) {
    const secondPass = reconcileColdBaselineEvents({
      cutoff: cutoffMs,
      baselineMode: 'archive',
      baselineLayer: {
        id: 'archive-second-pass',
        kind: 'archive',
        label: 'Projected Cold Baseline Archive',
        events: sortedMerged,
      },
      candidateLayers: input.candidateLayers,
      excludeActiveSessions,
      explicitActiveSessions: input.explicitActiveSessions,
      agentPolicies: input.agentPolicies,
      skipSecondPassCheck: true,
    });
    repeatDryRunNetAddZero = secondPass.report.totals.candidateAdd.records === 0
      && secondPass.report.totals.candidateAdd.totalTokens === 0;
  }

  const ok = accountingBalanced
    && deltaMatchesCandidateAdd
    && bySourceExactMatch
    && byDateExactMatch
    && repeatDryRunNetAddZero;

  const sortGroups = (map: Map<string, ClassifiedItemSummary>) =>
    [...map.values()].sort((a, b) => b.bucket.totalTokens - a.bucket.totalTokens || a.sessionHash.localeCompare(b.sessionHash, 'en'));

  const hotSessions = [...hotSummaryMap.values()].sort(
    (a, b) => (b.preCutoff.totalTokens + b.postCutoff.totalTokens) - (a.preCutoff.totalTokens + a.postCutoff.totalTokens)
      || a.sessionHash.localeCompare(b.sessionHash, 'en'),
  );

  const report: ColdBaselineReport = {
    ok,
    dryRun: true,
    cutoffIso,
    cutoffMs,
    baselineMode: input.baselineMode,
    excludeActiveSessions,
    baselineLayerId: input.baselineLayer.id,
    ...(input.agentPolicies
      ? {
          agentPolicies: {
            sealedScopes: input.agentPolicies.sealedScopes,
            isolatedScopes: input.agentPolicies.isolatedScopes,
            activeOutboxScopes: input.agentPolicies.activeOutboxScopes,
            activeIsolationScopes: input.agentPolicies.activeIsolationScopes,
          },
        }
      : {}),
    totals,
    bySource: bySourceObj,
    byDate: byDateObj,
    windows,
    layers: layerReports,
    hotSessions,
    reviewGroups: sortGroups(reviewGroupMap),
    conflictGroups: sortGroups(conflictGroupMap),
    invariants: {
      accountingBalanced,
      deltaMatchesCandidateAdd,
      bySourceExactMatch,
      byDateExactMatch,
      repeatDryRunNetAddZero,
    },
    archiveChecksum: archive.checksum,
  };

  return { report, archive };
}

export function reconcileColdBaseline(options: ReconcileColdBaselineOptions): ColdBaselineReport {
  const baselineMode: BaselineMode = options.baselineMode
    ?? (options.baselineArchivePath ? 'archive' : options.baselineV4Path ? 'prod-v4' : 'local-native');

  const prodV4 = options.baselineV4Path ? readProdV4Layer(options.baselineV4Path) : undefined;
  const archiveLayer = options.baselineArchivePath
    ? (() => {
        const loaded = readColdBaselineArchive(options.baselineArchivePath!);
        return {
          id: 'archive',
          kind: 'archive' as const,
          label: 'Existing Cold Baseline Archive',
          events: loaded.events,
        };
      })()
    : undefined;
  const localNative = options.localHome ? readLocalNativeLayer(options.localHome) : undefined;
  const localV1 = options.localV1ImportsPath
    ? readV1ImportsLayer(options.localV1ImportsPath, 'local-v1-import', 'Local Active V1 Imports')
    : undefined;
  const prodV1 = options.prodV1ImportsPath
    ? readV1ImportsLayer(options.prodV1ImportsPath, 'prod-v1-import', 'Production Active V1 Imports')
    : undefined;
  const deviceBundles = (options.deviceBundlePaths ?? []).map((filePath, idx) => readDeviceBundleLayer(filePath, idx));
  const agentPolicies = options.agentStateDir ? readAgentPolicySnapshot(options.agentStateDir) : undefined;

  let baselineLayer: ProvenanceLayer;
  const candidateLayers: ProvenanceLayer[] = [];

  if (baselineMode === 'archive') {
    if (!archiveLayer) throw new Error('BASELINE_ARCHIVE_REQUIRED');
    baselineLayer = archiveLayer;
    if (prodV4) candidateLayers.push(prodV4);
    if (localNative) candidateLayers.push(localNative);
    if (localV1) candidateLayers.push(localV1);
    if (prodV1) candidateLayers.push(prodV1);
    candidateLayers.push(...deviceBundles);
  } else if (baselineMode === 'prod-v4') {
    if (!prodV4) throw new Error('BASELINE_V4_REQUIRED');
    baselineLayer = prodV4;
    if (localNative) candidateLayers.push(localNative);
    if (localV1) candidateLayers.push(localV1);
    if (prodV1) candidateLayers.push(prodV1);
    candidateLayers.push(...deviceBundles);
  } else {
    if (!localNative) throw new Error('LOCAL_HOME_REQUIRED');
    baselineLayer = localNative;
    if (prodV4) candidateLayers.push(prodV4);
    if (localV1) candidateLayers.push(localV1);
    if (prodV1) candidateLayers.push(prodV1);
    candidateLayers.push(...deviceBundles);
  }

  const { report, archive } = reconcileColdBaselineEvents({
    cutoff: options.cutoff,
    baselineMode,
    baselineLayer,
    candidateLayers,
    excludeActiveSessions: options.excludeActiveSessions,
    explicitActiveSessions: options.explicitActiveSessions,
    agentPolicies,
  });

  if (options.outputArchivePath) {
    if (!isAbsolute(options.outputArchivePath)) throw new Error('ABSOLUTE_PATH_REQUIRED');
    if (existsSync(options.outputArchivePath)) throw new Error('OUTPUT_ALREADY_EXISTS');
    mkdirSync(dirname(options.outputArchivePath), { recursive: true, mode: 0o700 });
    writeFileSync(options.outputArchivePath, JSON.stringify(archive, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    report.archivePath = options.outputArchivePath;
  }

  if (options.reportPath) {
    if (!isAbsolute(options.reportPath)) throw new Error('ABSOLUTE_PATH_REQUIRED');
    if (existsSync(options.reportPath)) throw new Error('OUTPUT_ALREADY_EXISTS');
    mkdirSync(dirname(options.reportPath), { recursive: true, mode: 0o700 });
    writeFileSync(options.reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }

  return report;
}
