import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { SyncHeader, SyncRecord } from '../domain/sync';
import { qualifyRanges, qualifyRecords, sequenceHash, syncScopeId, usageKeyRoot, SyncError } from '../adapters/local/imports/sync/contract';

type Stage = { ok: true } | { ok: false; code: string };
type Row = Record<string, unknown>;
type ReviewRow = { id: number; scope_id: string; manifest_id: string; code: string; header_json: string; resolution_json: string | null };
type GenerationRow = { id: string; scope_id: string; parent_id: string | null; manifest_id: string; rolled: number; token_total: number };

export type ReviewAudit = {
  id: number;
  code: string;
  scope: { deviceId: string; source: string; sessionId: string; originId: string } | null;
  manifestHash: string;
  generationId: string | null;
  parentManifestHash: string | null;
  parentGenerationId: string | null;
  resolution: { disposition: string; committedSuccessor: string | null } | null;
  acceptedSuccessor: string | null;
  acceptedGeneration: string | null;
  members: { expected: number; observed: number; contiguous: boolean; sequenceHash: boolean };
  stages: { range: Stage | null; records: Stage | null; tokens: Stage | null; commitment: Stage | null; legacy: Stage | null };
  adoption: { expected: number; observed: number; missing: number };
  result: 'pass' | 'fail' | 'unprovable';
  resultCode: string | null;
  unprovable: string | null;
  repairRecommendation: 'none' | 'owner-rebase' | 'fence';
  dependencies: Array<{ generationId: string; manifestHash: string; recordCount: number; receiptStatus: string | null; receiptCode: string | null }>;
  laterValidCommits: Array<{ generationId: string; manifestHash: string; recordCount: number }>;
  currentHead: { generationId: string | null; manifestHash: string | null; recordCount: number | null };
};

const parse = <T>(value: unknown): T => JSON.parse(String(value)) as T;
const codeOf = (error: unknown) => error instanceof SyncError ? error.code : (error instanceof Error ? error.message : 'UNKNOWN_ERROR');
const tokenCount = (record: SyncRecord) => record.event.inputTokens + record.event.outputTokens + record.event.cacheReadTokens + record.event.cacheCreationTokens + record.event.reasoningTokens;

function historicalRecords(db: DatabaseSync, generationId: string | null): SyncRecord[] {
  if (!generationId) return [];
  return db.prepare(`WITH RECURSIVE chain(id,depth) AS (
      SELECT ?,0
      UNION ALL SELECT g.parent_id,c.depth+1 FROM sync_generations g JOIN chain c ON g.id=c.id WHERE g.parent_id IS NOT NULL
    ), ranked AS (
      SELECT d.position,d.observation_id,ROW_NUMBER() OVER(PARTITION BY d.position ORDER BY c.depth) rank
      FROM sync_changes d JOIN chain c ON c.id=d.generation_id
    )
    SELECT r.position,o.record_json FROM ranked r JOIN sync_observations o ON o.id=r.observation_id
    WHERE r.rank=1 AND r.observation_id IS NOT NULL ORDER BY r.position`).all(generationId).map(row => parse<SyncRecord>(row.record_json));
}

function descendants(db: DatabaseSync, scopeId: string, generationId: string | null) {
  if (!generationId) return [];
  const rows = db.prepare(`SELECT g.id,g.parent_id,g.manifest_id,g.rolled,
      json_extract(m.header_json,'$.manifest.recordCount') record_count,
      (SELECT json_extract(r.receipt_json,'$.status') FROM sync_receipts r WHERE json_extract(r.receipt_json,'$.manifestHash')=g.manifest_id LIMIT 1) receipt_status,
      (SELECT json_extract(r.receipt_json,'$.code') FROM sync_receipts r WHERE json_extract(r.receipt_json,'$.manifestHash')=g.manifest_id LIMIT 1) receipt_code
    FROM sync_generations g JOIN sync_manifests m ON m.id=g.manifest_id WHERE g.scope_id=? ORDER BY g.rowid`).all(scopeId) as Row[];
  const children = new Map<string, Row[]>();
  for (const row of rows) {
    const parent = row.parent_id === null ? null : String(row.parent_id);
    if (parent) children.set(parent, [...(children.get(parent) ?? []), row]);
  }
  const result: Row[] = [], queue = [...(children.get(generationId) ?? [])], seen = new Set<string>();
  while (queue.length) {
    const row = queue.shift()!;
    const id = String(row.id);
    if (seen.has(id)) continue;
    seen.add(id); result.push(row);
    queue.push(...(children.get(id) ?? []));
  }
  return result;
}

function legacyEvidence(db: DatabaseSync, header: SyncHeader) {
  const scope = header.manifest.scope, id = syncScopeId(scope);
  const expected = Number(db.prepare(`SELECT COUNT(*) n FROM sync_legacy_members m
    JOIN sync_legacy_batches b ON b.id=m.batch_id JOIN sync_observations o ON o.id=m.observation_id
    LEFT JOIN sync_adoptions a ON a.batch_id=m.batch_id AND a.position=m.position
    WHERE json_extract(b.metadata_json,'$.device.id')=? AND o.source=? AND o.session_id=?
      AND (a.scope_id IS NULL OR a.scope_id!=?)
      AND NOT EXISTS(SELECT 1 FROM sync_adoption_grants g WHERE g.batch_id=m.batch_id AND g.position=m.position AND g.manifest_id=? AND g.scope_id=?)`)
    .get(scope.deviceId, scope.source, scope.sessionId, id, header.manifest.manifestHash, id)!.n);
  const observed = Number(db.prepare(`SELECT COUNT(*) n FROM sync_adoptions a
    JOIN sync_legacy_members m ON m.batch_id=a.batch_id AND m.position=a.position
    JOIN sync_legacy_batches b ON b.id=m.batch_id JOIN sync_observations o ON o.id=m.observation_id
    WHERE a.scope_id=? AND json_extract(b.metadata_json,'$.device.id')=? AND o.source=? AND o.session_id=?`)
    .get(id, scope.deviceId, scope.source, scope.sessionId)!.n);
  return { expected, observed, missing: expected };
}

function currentHead(db: DatabaseSync, scopeId: string) {
  const row = db.prepare(`SELECT s.head_generation,s.head_manifest,json_extract(m.header_json,'$.manifest.recordCount') record_count
    FROM sync_scopes s LEFT JOIN sync_manifests m ON m.id=s.head_manifest WHERE s.scope_id=?`).get(scopeId) as Row | undefined;
  return {
    generationId: row?.head_generation ? String(row.head_generation) : null,
    manifestHash: row?.head_manifest ? String(row.head_manifest) : null,
    recordCount: row?.record_count === null || row?.record_count === undefined ? null : Number(row.record_count),
  };
}

export function auditAcceptedReviews(db: DatabaseSync, options: { id?: number; includeDismissed?: boolean } = {}): ReviewAudit[] {
  const where = options.id ? 'WHERE r.id=?' : '';
  const params = options.id ? [options.id] : [];
  const reviews = db.prepare(`SELECT r.id,r.scope_id,r.manifest_id,r.code,r.header_json,x.resolution_json
    FROM sync_reviews r LEFT JOIN sync_review_resolutions x ON x.review_id=r.id ${where} ORDER BY r.id`).all(...params) as ReviewRow[];
  const output: ReviewAudit[] = [];
  for (const review of reviews) {
    const resolution = review.resolution_json ? parse<{ disposition: string; committedSuccessor?: string }>(review.resolution_json) : null;
    if (!options.includeDismissed && resolution?.disposition !== 'accepted-successor') continue;
    const header = parse<SyncHeader>(review.header_json), manifest = header.manifest;
    const scopeId = syncScopeId(manifest.scope), parent = manifest.parent;
    const parentManifestRow = parent ? db.prepare('SELECT header_json FROM sync_manifests WHERE id=?').get(parent.manifestHash) as Row | undefined : undefined;
    const parentManifest = parentManifestRow ? parse<SyncHeader>(parentManifestRow.header_json).manifest : undefined;
    const parentGeneration = parent ? db.prepare('SELECT * FROM sync_generations WHERE id=?').get(parent.generationId) as GenerationRow | undefined : undefined;
    const acceptedGeneration = resolution?.committedSuccessor ? db.prepare('SELECT * FROM sync_generations WHERE manifest_id=?').get(resolution.committedSuccessor) as GenerationRow | undefined : undefined;
    const memberRows = db.prepare(`SELECT m.position,m.observation_id,o.record_json FROM sync_review_members m
      LEFT JOIN sync_observations o ON o.id=m.observation_id WHERE m.review_id=? ORDER BY m.position`).all(review.id) as Row[];
    const expected = Number(manifest.recordCount);
    const observed = memberRows.filter(row => row.record_json != null).length;
    const contiguous = memberRows.length === expected && memberRows.every((row, index) => Number(row.position) === index);
    const records = memberRows.filter(row => row.record_json != null).map(row => parse<SyncRecord>(row.record_json));
    const members = { expected, observed, contiguous, sequenceHash: contiguous && observed === expected && sequenceHash(records) === manifest.sequenceHash };
    const unprovable: string[] = [];
    if (!parentManifest || !parentGeneration) unprovable.push('MISSING_HISTORICAL_PARENT');
    if (!contiguous || observed !== expected) unprovable.push('MISSING_REVIEW_MEMBERS');
    if (resolution?.committedSuccessor && !acceptedGeneration) unprovable.push('MISSING_ACCEPTED_GENERATION');
    if (acceptedGeneration && String(acceptedGeneration.scope_id) !== scopeId) unprovable.push('ACCEPTED_GENERATION_SCOPE_MISMATCH');
    const current = unprovable.length ? [] : historicalRecords(db, parent?.generationId ?? null);
    const stages: ReviewAudit['stages'] = { range: null, records: null, tokens: null, commitment: null, legacy: null };
    if (!unprovable.length) {
      try { qualifyRanges(parentManifest, manifest); stages.range = { ok: true }; }
      catch (error) { stages.range = { ok: false, code: codeOf(error) }; }
      try { qualifyRecords(current, records, manifest); stages.records = { ok: true }; }
      catch (error) { stages.records = { ok: false, code: codeOf(error) }; }
      const total = records.reduce((sum, record) => sum + tokenCount(record), 0);
      stages.tokens = Number.isSafeInteger(total) ? { ok: true } : { ok: false, code: 'TOKEN_TOTAL_OVERFLOW' };
      const usage = manifest.ranges.length === 1 ? manifest.ranges[0].commitment : undefined;
      const parentUsage = parentManifest?.ranges.length === 1 ? parentManifest.ranges[0].commitment : undefined;
      if (usage || parentUsage) {
        const currentKeys = usageKeyRoot(records), parentKeys = usageKeyRoot(current);
        const ok = (!usage || (usage.keyRoot === currentKeys.keyRoot && usage.count === currentKeys.count))
          && (!parentUsage || (parentUsage.keyRoot === parentKeys.keyRoot && parentUsage.count === parentKeys.count))
          && manifest.ranges.length === 1;
        stages.commitment = ok ? { ok: true } : { ok: false, code: 'COMMITMENT_MISMATCH' };
      }
      const legacy = legacyEvidence(db, header);
      stages.legacy = legacy.missing ? { ok: false, code: 'V1_ADOPTION_REVIEW_REQUIRED' } : { ok: true };
    }
    const legacy = legacyEvidence(db, header);
    const deps = descendants(db, scopeId, acceptedGeneration?.id ?? null).map(row => ({
      generationId: String(row.id), manifestHash: String(row.manifest_id), recordCount: Number(row.record_count ?? 0),
      receiptStatus: row.receipt_status ? String(row.receipt_status) : null, receiptCode: row.receipt_code ? String(row.receipt_code) : null,
    }));
    const laterValidCommits = deps.filter(row => row.receiptStatus === 'committed').map(({ generationId, manifestHash, recordCount }) => ({ generationId, manifestHash, recordCount }));
    const failed = Object.values(stages).find(stage => stage && !stage.ok) as { ok: false; code: string } | undefined;
    const result: ReviewAudit['result'] = unprovable.length ? 'unprovable' : failed ? 'fail' : 'pass';
    const repairRecommendation: ReviewAudit['repairRecommendation'] = result === 'pass' ? 'none'
      : result === 'unprovable' ? 'fence'
      : stages.records?.ok ? 'owner-rebase' : 'fence';
    output.push({
      id: Number(review.id), code: String(review.code), scope: manifest.scope, manifestHash: String(review.manifest_id),
      generationId: manifest.generationId, parentManifestHash: parent?.manifestHash ?? null, parentGenerationId: parent?.generationId ?? null,
      resolution: resolution ? { disposition: resolution.disposition, committedSuccessor: resolution.committedSuccessor ?? null } : null,
      acceptedSuccessor: resolution?.committedSuccessor ?? null, acceptedGeneration: acceptedGeneration?.id ?? null,
      members, stages, adoption: legacy, result, resultCode: failed?.code ?? (unprovable[0] ?? null), unprovable: unprovable[0] ?? null,
      repairRecommendation, dependencies: deps, laterValidCommits, currentHead: currentHead(db, scopeId),
    });
  }
  return output;
}

export function auditReport(rows: ReviewAudit[]) {
  const summary = { total: rows.length, pass: rows.filter(row => row.result === 'pass').length, fail: rows.filter(row => row.result === 'fail').length, unprovable: rows.filter(row => row.result === 'unprovable').length,
    repairs: { none: rows.filter(row => row.repairRecommendation === 'none').length, rebase: rows.filter(row => row.repairRecommendation === 'owner-rebase').length, fence: rows.filter(row => row.repairRecommendation === 'fence').length } };
  return { ok: summary.fail === 0 && summary.unprovable === 0, summary, reviews: rows };
}

export function auditDigest(rows: ReviewAudit[]) {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
