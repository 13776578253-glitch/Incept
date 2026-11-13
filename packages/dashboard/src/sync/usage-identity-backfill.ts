import { DatabaseSync } from 'node:sqlite';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { SyncHeader, SyncRecord } from '../domain/sync';
import type { UsageAnchor } from '../domain/usage-identity';
import type { CoverageReview } from '../domain/usage-coverage';
import { UsageIdentityIndex } from '../adapters/local/usage-identity-index';
import { syncDatabaseFileIdentity } from './database-version';
import { coverageFromV2 } from './usage-coverage';
import { identityHistorySummary, preserveIdentityHistory } from './usage-identity-history';

type LedgerRow = {
  scope_id: string;
  position: number;
  origin_id: string;
  visible_generation: string;
  observation_id: string | null;
  record_json: string | null;
};

type BindingRow = {
  cursor: number;
  origin: string;
  scope: string;
  position: number;
  generation: string;
  observation: string;
  anchor_kind: UsageAnchor['kind'];
  anchor_value: string;
};

function ledgerAnchor(record: SyncRecord): UsageAnchor | undefined {
  if (record.nativeKey) return { kind: 'native/2', value: record.nativeKey.keyHash };
  if (record.pointKey) return { kind: 'point/2', value: record.pointKey };
}

function sourceStamp(path: string) {
  const wal = statSync(path + '-wal', { bigint: true, throwIfNoEntry: false });
  const file = statSync(path, { bigint: true });
  return JSON.stringify([syncDatabaseFileIdentity(path), String(file.size), String(file.mtimeNs),
    wal ? [String(wal.ino), String(wal.size), String(wal.mtimeNs)] : null]);
}

/**
 * Backfill visible v2 records on an isolated ledger copy. The source is read-only.
 * Unsupported legacy references stay available by observation and position.
 */
export function backfillUsageIdentity(sourcePath: string, outputPath: string, limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) {
    throw Error('INVALID_IDENTITY_BACKFILL_OPTIONS');
  }
  sourcePath = realpathSync(sourcePath);
  const absoluteOutput = resolve(outputPath);
  outputPath = existsSync(absoluteOutput) ? realpathSync(absoluteOutput)
    : join(realpathSync(dirname(absoluteOutput)), basename(absoluteOutput));
  if (['', '-wal', '-shm', '-journal'].some(suffix => outputPath.toLowerCase() === (sourcePath + suffix).toLowerCase())) {
    throw Error('DISTINCT_IDENTITY_OUTPUT_REQUIRED');
  }
  const sourceIdentity = sourceStamp(sourcePath);
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    source.exec('PRAGMA query_only=ON; BEGIN');
    const meta = source.prepare('SELECT schema_version,data_revision FROM sync_meta WHERE id=1').get();
    if (!meta || ![2, 3].includes(Number(meta.schema_version)) || !Number.isSafeInteger(Number(meta.data_revision))) {
      throw Error('INVALID_SYNC_DATABASE');
    }
    const revision = Number(meta.data_revision);
    const sourceFile = statSync(sourcePath, { bigint: true });
    const outputFile = statSync(outputPath, { bigint: true, throwIfNoEntry: false });
    if (outputFile && sourceFile.dev === outputFile.dev && sourceFile.ino === outputFile.ino) {
      throw Error('DISTINCT_IDENTITY_OUTPUT_REQUIRED');
    }
    const output = new DatabaseSync(outputPath);
    try {
      output.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
      try {
        const tables = output.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        if (tables.length && !tables.some(table => table.name === 'usage_identity_backfill_v2')) {
          throw Error('IDENTITY_BACKFILL_FRESH_OUTPUT_REQUIRED');
        }
        if (!tables.length && source.prepare('PRAGMA quick_check').all().some(row => row.quick_check !== 'ok')) {
          throw Error('SQLITE_INTEGRITY_FAILED');
        }
        const index = UsageIdentityIndex.initialize(output);
        output.exec(`
          CREATE TABLE IF NOT EXISTS usage_identity_backfill_v2 (
            id INTEGER PRIMARY KEY CHECK (id=1), source TEXT NOT NULL, revision INTEGER NOT NULL,
            last_scope TEXT NOT NULL, last_position INTEGER NOT NULL,
            scan_complete INTEGER NOT NULL DEFAULT 0, last_binding INTEGER NOT NULL DEFAULT 0
          );
          CREATE TABLE IF NOT EXISTS usage_ledger_identity (
            scope TEXT NOT NULL, position INTEGER NOT NULL, origin TEXT NOT NULL, generation TEXT NOT NULL,
            observation TEXT NOT NULL, legacy_event TEXT NOT NULL, anchor_kind TEXT, anchor_value TEXT,
            PRIMARY KEY (scope, position)
          );
          CREATE INDEX IF NOT EXISTS usage_ledger_anchor ON usage_ledger_identity(origin,anchor_kind,anchor_value);
          CREATE TABLE IF NOT EXISTS usage_ledger_coverage (
            scope TEXT PRIMARY KEY, generation TEXT NOT NULL, evidence_json TEXT NOT NULL
          );
          CREATE VIEW IF NOT EXISTS usage_ledger_identity_disposition AS
            SELECT l.*, CASE
              WHEN l.anchor_kind IS NULL THEN 'unproven'
              WHEN c.members IS NOT NULL THEN 'conflict'
              WHEN i.event_id IS NULL THEN 'pending'
              ELSE 'mapped' END AS disposition,
              i.event_id AS event_id
            FROM usage_ledger_identity l
            LEFT JOIN usage_identity_conflicts c ON (c.origin,c.kind,c.value)=(l.origin,l.anchor_kind,l.anchor_value)
            LEFT JOIN usage_event_anchors i ON (i.origin,i.kind,i.value)=(l.origin,l.anchor_kind,l.anchor_value);
        `);
        output.prepare(`INSERT OR IGNORE INTO usage_identity_backfill_v2 (id,source,revision,last_scope,last_position)
          VALUES (1, ?, ?, '', -2)`).run(sourceIdentity, revision);
        const cursor = output.prepare('SELECT * FROM usage_identity_backfill_v2 WHERE id=1').get()!;
        if (cursor.source !== sourceIdentity || cursor.revision !== revision) throw Error('IDENTITY_BACKFILL_INPUT_CHANGED');

        const rows = cursor.scan_complete ? [] : source.prepare(`
          SELECT s.scope_id,COALESCE(c.position,-1) AS position,r.origin_id,s.visible_generation,c.observation_id,o.record_json
          FROM sync_scopes s
          LEFT JOIN sync_current c ON c.scope_id=s.scope_id
          LEFT JOIN sync_origins r ON r.scope_id=s.scope_id
          LEFT JOIN sync_observations o ON o.id=c.observation_id
          WHERE s.visible_generation IS NOT NULL AND (s.scope_id,COALESCE(c.position,-1)) > (?,?)
          ORDER BY s.scope_id,position LIMIT ?
        `).all(cursor.last_scope, cursor.last_position, limit + 1) as unknown as LedgerRow[];
        const put = output.prepare('INSERT INTO usage_ledger_identity VALUES (?,?,?,?,?,?,?,?)');
        const putCoverage = output.prepare('INSERT OR IGNORE INTO usage_ledger_coverage VALUES (?,?,?)');
        const headerFor = source.prepare(`
          SELECT m.header_json FROM sync_generations g
          JOIN sync_manifests m ON m.id=g.manifest_id WHERE g.id=? AND g.scope_id=?
        `);
        const reviewsFor = source.prepare(`
          WITH RECURSIVE chain(id, manifest_id, parent_id) AS (
            SELECT id,manifest_id,parent_id FROM sync_generations WHERE id=? AND scope_id=?
            UNION SELECT g.id,g.manifest_id,g.parent_id FROM sync_generations g JOIN chain c ON g.id=c.parent_id
            WHERE g.scope_id=?
          )
          SELECT r.id,r.code,c.manifest_id AS successor FROM sync_reviews r
          JOIN sync_review_resolutions x ON x.review_id=r.id
          JOIN chain c ON c.manifest_id=json_extract(x.resolution_json,'$.committedSuccessor')
          WHERE r.scope_id=? AND json_extract(x.resolution_json,'$.disposition')='accepted-successor'
          ORDER BY r.id
        `);
        const hasCoverage = output.prepare('SELECT 1 FROM usage_ledger_coverage WHERE scope=?');
        let previousScope: string | undefined;
        for (const row of rows.slice(0, limit)) {
          if (previousScope !== row.scope_id) {
            if (!hasCoverage.get(row.scope_id)) {
              const header = headerFor.get(row.visible_generation, row.scope_id);
              if (!header) throw Error('VISIBLE_MANIFEST_MISSING');
              const reviews = reviewsFor.all(row.visible_generation, row.scope_id, row.scope_id, row.scope_id) as unknown as CoverageReview[];
              const coverage = coverageFromV2((JSON.parse(String(header.header_json)) as SyncHeader).manifest, reviews);
              putCoverage.run(row.scope_id, row.visible_generation, JSON.stringify(coverage));
            }
            previousScope = row.scope_id;
          }
          if (row.position === -1) continue;
          if (row.record_json === null) throw Error('VISIBLE_OBSERVATION_MISSING');
          const record = JSON.parse(row.record_json) as SyncRecord;
          const anchor = ledgerAnchor(record);
          put.run(row.scope_id, row.position, row.origin_id, row.visible_generation,
            row.observation_id, record.event.eventId, anchor?.kind ?? null, anchor?.value ?? null);
        }
        const last = rows[Math.min(limit, rows.length) - 1];
        if (last) output.prepare('UPDATE usage_identity_backfill_v2 SET last_scope=?, last_position=? WHERE id=1').run(last.scope_id, last.position);
        if (sourceIdentity !== sourceStamp(sourcePath)) throw Error('IDENTITY_BACKFILL_INPUT_CHANGED');

        const scanComplete = rows.length <= limit;
        if (!cursor.scan_complete && scanComplete) {
          preserveIdentityHistory(source, output);
          output.exec(`
            INSERT INTO usage_identity_conflicts
            SELECT origin,anchor_kind,anchor_value,COUNT(*) FROM usage_ledger_identity
            WHERE anchor_kind IS NOT NULL GROUP BY 1,2,3 HAVING COUNT(*)>1;
            UPDATE usage_identity_backfill_v2 SET scan_complete=1 WHERE id=1;
          `);
        }
        // No binding can be published until the scan has seen all competing members.
        const pending = scanComplete ? output.prepare(`
          SELECT l.rowid AS cursor,l.origin,l.scope,l.position,l.generation,l.observation,l.anchor_kind,l.anchor_value
          FROM usage_ledger_identity l
          LEFT JOIN usage_identity_conflicts c ON (c.origin,c.kind,c.value)=(l.origin,l.anchor_kind,l.anchor_value)
          LEFT JOIN usage_event_anchors a ON (a.origin,a.kind,a.value)=(l.origin,l.anchor_kind,l.anchor_value)
          WHERE l.rowid>? AND l.anchor_kind IS NOT NULL AND c.members IS NULL AND a.event_id IS NULL
          ORDER BY l.rowid LIMIT ?
        `).all(cursor.last_binding, limit + 1) as unknown as BindingRow[] : [];
        for (const row of pending.slice(0, limit)) {
          const anchor = { kind: row.anchor_kind, value: row.anchor_value };
          const reference = JSON.stringify([row.scope, row.generation, row.position, row.observation]);
          if (index.resolve(row.origin, [anchor], { actor: 'ledger-backfill', reference }).status !== 'resolved') {
            throw Error('IDENTITY_BACKFILL_BINDING_CONFLICT');
          }
        }
        const lastBinding = pending[Math.min(pending.length, limit) - 1];
        if (lastBinding) output.prepare('UPDATE usage_identity_backfill_v2 SET last_binding=? WHERE id=1').run(lastBinding.cursor);
        const complete = scanComplete && pending.length <= limit;
        const totals = complete ? output.prepare(`
          SELECT COUNT(*) AS seen,
            COUNT(*) FILTER (WHERE disposition='mapped') AS mapped,
            COUNT(*) FILTER (WHERE disposition='unproven') AS unproven,
            COUNT(*) FILTER (WHERE disposition='conflict') AS conflicts
          FROM usage_ledger_identity_disposition
        `).get() : undefined;
        const history = complete ? identityHistorySummary(output) : undefined;
        if (sourceIdentity !== sourceStamp(sourcePath)) throw Error('IDENTITY_BACKFILL_INPUT_CHANGED');
        output.exec('COMMIT');
        return { ok: true, revision, scanComplete, complete, processed: Math.min(rows.length, limit),
          bindingsWritten: Math.min(pending.length, limit), ...totals, ...(history ? { history } : {}) };
      } catch (error) {
        if (output.isTransaction) output.exec('ROLLBACK');
        throw error;
      }
    } finally {
      output.close();
    }
  } finally {
    source.close();
  }
}
