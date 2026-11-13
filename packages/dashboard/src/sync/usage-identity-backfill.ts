import { DatabaseSync } from 'node:sqlite';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { SyncHeader, SyncRecord } from '../domain/sync';
import type { UsageAnchor } from '../domain/usage-identity';
import { UsageIdentityIndex } from '../adapters/local/usage-identity-index';
import { syncDatabaseFileIdentity } from './database-version';
import { coverageFromV2 } from './usage-coverage';

type LedgerRow = {
  scope_id: string;
  position: number;
  origin_id: string;
  visible_generation: string;
  observation_id: string;
  record_json: string;
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
        if (tables.length && !tables.some(table => table.name === 'usage_identity_backfill')) {
          throw Error('INVALID_IDENTITY_OUTPUT');
        }
        const index = new UsageIdentityIndex(output);
        output.exec(`
          CREATE TABLE IF NOT EXISTS usage_identity_backfill (
            id INTEGER PRIMARY KEY CHECK (id=1), source TEXT NOT NULL, revision INTEGER NOT NULL,
            last_scope TEXT NOT NULL, last_position INTEGER NOT NULL
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
            WITH anchors AS (
              SELECT origin,anchor_kind,anchor_value,COUNT(*) AS members
              FROM usage_ledger_identity WHERE anchor_kind IS NOT NULL GROUP BY 1,2,3
            )
            SELECT l.*, CASE
              WHEN l.anchor_kind IS NULL THEN 'unproven'
              WHEN a.members > 1 OR i.event_id IS NULL THEN 'conflict'
              ELSE 'mapped' END AS disposition,
              CASE WHEN a.members=1 THEN i.event_id END AS event_id
            FROM usage_ledger_identity l
            LEFT JOIN anchors a USING (origin,anchor_kind,anchor_value)
            LEFT JOIN usage_event_anchors i ON (i.origin,i.kind,i.value)=(l.origin,l.anchor_kind,l.anchor_value);
        `);
        output.prepare("INSERT OR IGNORE INTO usage_identity_backfill VALUES (1, ?, ?, '', -1)").run(sourceIdentity, revision);
        const cursor = output.prepare('SELECT * FROM usage_identity_backfill WHERE id=1').get()!;
        if (cursor.source !== sourceIdentity || cursor.revision !== revision) throw Error('IDENTITY_BACKFILL_INPUT_CHANGED');

        const rows = source.prepare(`
          SELECT c.scope_id,c.position,r.origin_id,s.visible_generation,c.observation_id,o.record_json
          FROM sync_current c
          LEFT JOIN sync_origins r ON r.scope_id=c.scope_id
          LEFT JOIN sync_scopes s ON s.scope_id=c.scope_id
          LEFT JOIN sync_observations o ON o.id=c.observation_id
          WHERE (c.scope_id,c.position) > (?,?)
          ORDER BY c.scope_id,c.position LIMIT ?
        `).all(cursor.last_scope, cursor.last_position, limit + 1) as unknown as LedgerRow[];
        const put = output.prepare('INSERT INTO usage_ledger_identity VALUES (?,?,?,?,?,?,?,?)');
        const putCoverage = output.prepare('INSERT OR IGNORE INTO usage_ledger_coverage VALUES (?,?,?)');
        const headerFor = source.prepare(`
          SELECT m.header_json FROM sync_generations g
          JOIN sync_manifests m ON m.id=g.manifest_id WHERE g.id=? AND g.scope_id=?
        `);
        let previousScope: string | undefined;
        for (const row of rows.slice(0, limit)) {
          if (previousScope !== row.scope_id) {
            const header = headerFor.get(row.visible_generation, row.scope_id);
            if (!header) throw Error('VISIBLE_MANIFEST_MISSING');
            const coverage = coverageFromV2((JSON.parse(String(header.header_json)) as SyncHeader).manifest);
            putCoverage.run(row.scope_id, row.visible_generation, JSON.stringify(coverage));
            previousScope = row.scope_id;
          }
          const record = JSON.parse(row.record_json) as SyncRecord;
          const anchor = ledgerAnchor(record);
          const reference = JSON.stringify([row.scope_id, row.visible_generation, row.position, row.observation_id]);
          if (anchor) index.resolve(row.origin_id, [anchor], { actor: 'ledger-backfill', reference });
          put.run(row.scope_id, row.position, row.origin_id, row.visible_generation,
            row.observation_id, record.event.eventId, anchor?.kind ?? null, anchor?.value ?? null);
        }
        const last = rows[Math.min(limit, rows.length) - 1];
        if (last) output.prepare('UPDATE usage_identity_backfill SET last_scope=?, last_position=? WHERE id=1').run(last.scope_id, last.position);
        if (sourceIdentity !== sourceStamp(sourcePath)) throw Error('IDENTITY_BACKFILL_INPUT_CHANGED');

        const complete = rows.length <= limit;
        const totals = complete ? output.prepare(`
          SELECT COUNT(*) AS seen,
            COUNT(*) FILTER (WHERE disposition='mapped') AS mapped,
            COUNT(*) FILTER (WHERE disposition='unproven') AS unproven,
            COUNT(*) FILTER (WHERE disposition='conflict') AS conflicts
          FROM usage_ledger_identity_disposition
        `).get() : undefined;
        output.exec('COMMIT');
        return { ok: true, revision, complete, processed: Math.min(rows.length, limit), ...totals };
      } catch (error) {
        output.exec('ROLLBACK');
        throw error;
      }
    } finally {
      output.close();
    }
  } finally {
    source.close();
  }
}
