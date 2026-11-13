import { DatabaseSync } from 'node:sqlite';
import { hash } from '../adapters/local/imports/identity';
import { syncDatabaseFileIdentity } from './database-version';

// Use logical ledger state so an approved backup and its original compare
// equal. Revision alone can collide after a restore or on another ledger.
export function billingLedgerVersion(db: DatabaseSync) {
  const meta = db.prepare('SELECT schema_version,data_revision FROM sync_meta WHERE id=1').get();
  const revision = Number(meta?.data_revision);
  if (!meta || ![2, 3].includes(Number(meta.schema_version)) || !Number.isSafeInteger(revision) || revision < 0) {
    throw Error('INVALID_SYNC_DATABASE');
  }
  const scopes = db.prepare(`SELECT s.scope_id,s.head_manifest,s.visible_generation,s.fenced,o.origin_id
    FROM sync_scopes s LEFT JOIN sync_origins o USING (scope_id) ORDER BY s.scope_id`).all();
  const legacy = db.prepare('SELECT id,checksum,immutable_hash,status FROM sync_legacy_batches ORDER BY id').all();
  return { revision, ledger: hash(['billing-ledger/1', revision, scopes, legacy]) };
}

export function readBillingLedgerVersion(path: string) {
  const identity = syncDatabaseFileIdentity(path);
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=25; BEGIN');
    const version = billingLedgerVersion(db);
    if (identity !== syncDatabaseFileIdentity(path)) throw Error('SYNC_DATABASE_REPLACED');
    return version;
  } finally { db.close(); }
}
