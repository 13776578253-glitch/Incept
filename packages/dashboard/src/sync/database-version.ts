import { DatabaseSync } from 'node:sqlite';
import { realpathSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

export function syncDatabaseFileIdentity(path: string): string {
  const file = statSync(path, { bigint: true });
  return createHash('sha256').update(JSON.stringify([realpathSync(path), String(file.dev), String(file.ino), String(file.birthtimeNs)])).digest('hex');
}

// A bounded metadata read; never opens a collector or initializes the schema.
export function readSyncDatabaseVersion(path: string) {
  const identity = syncDatabaseFileIdentity(path);
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=25;');
    const row = db.prepare('SELECT schema_version,data_revision FROM sync_meta WHERE id=1').get();
    if (!row || ![2, 3].includes(Number(row.schema_version)) || !Number.isSafeInteger(Number(row.data_revision))) throw Error('INVALID_SYNC_DATABASE');
    const origin = db.prepare("SELECT json_extract(scope_json,'$.deviceId') device FROM sync_origins ORDER BY origin_id LIMIT 1").get();
    if (identity !== syncDatabaseFileIdentity(path)) throw Error('SYNC_DATABASE_REPLACED');
    const databaseIdentity = createHash('sha256').update(JSON.stringify([identity, origin?.device ?? null])).digest('hex');
    return { identity: databaseIdentity, revision: Number(row.data_revision) };
  } finally { db.close(); }
}
