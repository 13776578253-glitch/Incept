import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CompatibleSyncService } from '../adapters/local/imports/sync/legacy';

describe('sync schema migration', () => {
  it('upgrades a schema-2 ledger and installs the generation/review unique guards', () => {
    const dir = mkdtempSync(join(tmpdir(), 'incept-schema-'));
    const path = join(dir, 'sync.db');
    try {
      const first = new CompatibleSyncService(path);
      first.close();
      const raw = new DatabaseSync(path);
      try {
        raw.exec('DROP INDEX IF EXISTS sync_generations_scope_manifest; DROP INDEX IF EXISTS sync_reviews_scope_manifest; UPDATE sync_meta SET schema_version=2 WHERE id=1');
      } finally { raw.close(); }
      const migrated = new CompatibleSyncService(path);
      try {
        expect(migrated.db.prepare('SELECT schema_version FROM sync_meta WHERE id=1').get()).toMatchObject({ schema_version: 3 });
        const indexes = migrated.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name IN ('sync_generations_scope_manifest','sync_reviews_scope_manifest') ORDER BY name").all();
        expect(indexes).toEqual([{ name: 'sync_generations_scope_manifest' }, { name: 'sync_reviews_scope_manifest' }]);
      } finally { migrated.close(); }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
