import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ImportMappings, ImportPreview, ImportReceipt, TransferBundle } from '../../../domain';

// The host still uses Node 20 type declarations; node:sqlite is available at runtime on Node 22.13+.
type Database = { exec(sql: string): void; close(): void; prepare(sql: string): {
  all(...params: unknown[]): Record<string, unknown>[]; get(...params: unknown[]): Record<string, unknown> | undefined;
  run(...params: unknown[]): unknown;
} };

export type StoredBatch = { receipt: ImportReceipt; bundle: TransferBundle; mappings: ImportMappings };
export type StoredPreview = { bundle: TransferBundle; mappings: ImportMappings; reviewHash: string; summary: ImportPreview };
export function importStorePath(home = homedir()) {
  return process.env.INCEPT_DASHBOARD_IMPORTS_FILE || join(home, '.incept', 'dashboard-imports.db');
}
export class ImportStore {
  private db: Database;
  constructor(path = importStorePath()) {
    mkdirSync(dirname(path), { recursive: true });
    const sqlite = (process as unknown as { getBuiltinModule?: (id: string) => { DatabaseSync?: new (path: string) => Database } }).getBuiltinModule?.('node:sqlite');
    if (!sqlite?.DatabaseSync) throw new Error('Token imports require Node.js 22.13+ (Node.js 24 LTS recommended)');
    this.db = new sqlite.DatabaseSync(path);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS batches (id TEXT PRIMARY KEY, checksum TEXT NOT NULL,
        mapping_hash TEXT NOT NULL, status TEXT NOT NULL, receipt TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS previews (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, payload TEXT NOT NULL);`);
  }
  transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  batches(activeOnly = false): StoredBatch[] {
    return this.db.prepare('SELECT receipt,payload FROM batches' + (activeOnly ? " WHERE status='active'" : '') + ' ORDER BY rowid DESC')
      .all().map(row => ({ ...JSON.parse(String(row.payload)), receipt: JSON.parse(String(row.receipt)) }));
  }
  receipts(limit?: number): ImportReceipt[] {
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) throw new Error('Invalid history limit');
    return this.db.prepare('SELECT receipt FROM batches ORDER BY rowid DESC' + (limit === undefined ? '' : ' LIMIT ?'))
      .all(...(limit === undefined ? [] : [limit])).map(row => JSON.parse(String(row.receipt)) as ImportReceipt);
  }
  preview(id: string): StoredPreview | undefined {
    const row = this.db.prepare('SELECT payload FROM previews WHERE id=?').get(id);
    return row ? JSON.parse(String(row.payload)) : undefined;
  }
  savePreview(preview: StoredPreview) {
    this.db.prepare('DELETE FROM previews WHERE expires_at < ?').run(Date.now());
    this.db.prepare('INSERT INTO previews VALUES (?,?,?)').run(preview.summary.previewId, Date.parse(preview.summary.expiresAt), JSON.stringify(preview));
  }
  saveBatch(batch: StoredBatch, mappingHash: string) {
    this.db.prepare('INSERT INTO batches VALUES (?,?,?,?,?,?)').run(batch.receipt.id, batch.bundle.checksum, mappingHash,
      'active', JSON.stringify(batch.receipt), JSON.stringify({ bundle: batch.bundle, mappings: batch.mappings }));
  }
  setReceipt(receipt: ImportReceipt) {
    this.db.prepare('UPDATE batches SET status=?,receipt=? WHERE id=?').run(receipt.status, JSON.stringify(receipt), receipt.id);
  }
  close() { this.db.close(); }
}
export function readActiveBatches(path = importStorePath()): StoredBatch[] {
  if (!existsSync(path)) return [];
  const store = new ImportStore(path);
  try { return store.batches(true); } finally { store.close(); }
}
