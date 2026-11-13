import type { DatabaseSync } from 'node:sqlite';

/**
 * Retain historical membership and disposition without granting canonical
 * bindings. Generation membership is represented by its parent and deltas.
 */
export function preserveIdentityHistory(source: DatabaseSync, output: DatabaseSync) {
  output.exec(`
    CREATE TABLE usage_legacy_batches (
      id TEXT PRIMARY KEY, source_order INTEGER, checksum TEXT, immutable_hash TEXT, status TEXT
    );
    CREATE TABLE usage_legacy_members (
      batch TEXT, position INTEGER, observation TEXT, canonical_id TEXT, variant_hash TEXT,
      project TEXT, projected INTEGER, observation_present INTEGER, PRIMARY KEY (batch, position)
    );
    CREATE TABLE usage_legacy_projection (
      variant_hash TEXT PRIMARY KEY, batch TEXT, position INTEGER, observation TEXT, canonical_id TEXT, project TEXT,
      source_order INTEGER
    );
    CREATE TABLE usage_ledger_generations (
      id TEXT PRIMARY KEY, scope TEXT, parent TEXT, manifest TEXT, rolled INTEGER, visible INTEGER, fenced INTEGER,
      record_count INTEGER, token_total INTEGER
    );
    CREATE TABLE usage_generation_changes (
      generation TEXT, position INTEGER, observation TEXT, entity TEXT, observation_present INTEGER,
      PRIMARY KEY (generation, position)
    );
    CREATE TABLE usage_ledger_reviews (
      id INTEGER PRIMARY KEY, scope TEXT, manifest TEXT, code TEXT, disposition TEXT, successor TEXT,
      record_count INTEGER, sequence_hash TEXT
    );
    CREATE TABLE usage_review_members (
      review INTEGER, position INTEGER, observation TEXT, observation_present INTEGER, PRIMARY KEY (review, position)
    );
  `);

  const copy = (target: string, query: string) => {
    const rows = source.prepare(query);
    const insert = output.prepare(`INSERT INTO ${target} VALUES (${rows.columns().map(() => '?').join(',')})`);
    for (const row of rows.iterate()) insert.run(...Object.values(row));
  };

  copy('usage_legacy_batches', `SELECT id,source_order,checksum,immutable_hash,status FROM sync_legacy_batches`);
  copy('usage_legacy_members', `
    SELECT m.batch_id,m.position,m.observation_id,m.canonical_id,m.variant_hash,m.project,
      EXISTS(SELECT 1 FROM sync_legacy_projection p WHERE p.variant_hash=m.variant_hash
        AND p.batch_id=m.batch_id AND p.position=m.position) AS projected,
      EXISTS(SELECT 1 FROM sync_observations o WHERE o.id=m.observation_id) AS observation_present
    FROM sync_legacy_members m
  `);
  copy('usage_legacy_projection', `SELECT variant_hash,batch_id,position,observation_id,canonical_id,project,source_order
    FROM sync_legacy_projection`);
  copy('usage_ledger_generations', `
    SELECT g.id,g.scope_id,g.parent_id,g.manifest_id,g.rolled,COALESCE(s.visible_generation=g.id,0) AS visible,s.fenced,
      json_extract(m.header_json,'$.manifest.recordCount') AS record_count,g.token_total
    FROM sync_generations g LEFT JOIN sync_scopes s ON s.scope_id=g.scope_id
    LEFT JOIN sync_manifests m ON m.id=g.manifest_id
  `);
  copy('usage_generation_changes', `
    SELECT c.generation_id,c.position,c.observation_id,c.entity_id,
      CASE WHEN c.observation_id IS NOT NULL THEN EXISTS(SELECT 1 FROM sync_observations o WHERE o.id=c.observation_id)
      END AS observation_present
    FROM sync_changes c
  `);
  copy('usage_ledger_reviews', `
    SELECT r.id,r.scope_id,r.manifest_id,r.code,json_extract(x.resolution_json,'$.disposition') AS disposition,
      json_extract(x.resolution_json,'$.committedSuccessor') AS successor,
      json_extract(r.header_json,'$.manifest.recordCount') AS record_count,
      json_extract(r.header_json,'$.manifest.sequenceHash') AS sequence_hash
    FROM sync_reviews r LEFT JOIN sync_review_resolutions x ON x.review_id=r.id
  `);
  copy('usage_review_members', `
    SELECT m.review_id,m.position,m.observation_id,
      EXISTS(SELECT 1 FROM sync_observations o WHERE o.id=m.observation_id) AS observation_present
    FROM sync_review_members m
  `);
}

export function identityHistorySummary(output: DatabaseSync) {
  return output.prepare(`
    SELECT
      (SELECT COUNT(*) FROM usage_legacy_batches) AS legacyBatches,
      (SELECT COUNT(*) FROM usage_legacy_members) AS legacyMembers,
      (SELECT COUNT(*) FROM usage_legacy_projection) AS legacyProjection,
      (SELECT COUNT(*) FROM usage_ledger_generations WHERE visible=0) AS hiddenGenerations,
      (SELECT COUNT(*) FROM usage_ledger_generations WHERE rolled=1) AS rolledGenerations,
      (SELECT COUNT(*) FROM usage_generation_changes) AS generationChanges,
      (SELECT COUNT(*) FROM usage_ledger_reviews) AS reviews,
      (SELECT COUNT(*) FROM usage_review_members) AS reviewMembers,
      (SELECT COUNT(*) FROM usage_review_members WHERE observation_present=0)
        + (SELECT COUNT(*) FROM usage_legacy_members WHERE observation_present=0)
        + (SELECT COUNT(*) FROM usage_generation_changes WHERE observation_present=0) AS missingObservations,
      (SELECT COUNT(*) FROM usage_ledger_generations WHERE record_count IS NULL) AS missingManifests
  `).get();
}
