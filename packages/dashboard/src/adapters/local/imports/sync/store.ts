import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import type { SyncActor, SyncHeader, SyncManifest, SyncReceipt, SyncRecord, SyncScope } from '../../../../domain/sync';
import { hash } from '../identity';
import { SYNC_LIMITS, SyncError, requireSync, syncScopeId, syncEntityId, validateHeader, validateRecords, sequenceHash, qualifyRanges, qualifyRecords } from './contract';

export const SYNC_SCHEMA = `
CREATE TABLE IF NOT EXISTS sync_meta(id INTEGER PRIMARY KEY CHECK(id=1),schema_version INTEGER NOT NULL,data_revision INTEGER NOT NULL);
INSERT OR IGNORE INTO sync_meta VALUES(1,2,0);
CREATE TABLE IF NOT EXISTS sync_origins(origin_id TEXT PRIMARY KEY,scope_id TEXT NOT NULL UNIQUE,scope_json TEXT NOT NULL,label TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sync_scopes(scope_id TEXT PRIMARY KEY,head_manifest TEXT,head_generation TEXT,visible_generation TEXT,fenced INTEGER NOT NULL DEFAULT 0,token_total INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sync_manifests(id TEXT PRIMARY KEY,scope_id TEXT NOT NULL,generation_id TEXT NOT NULL,header_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sync_generations(id TEXT PRIMARY KEY,scope_id TEXT NOT NULL,parent_id TEXT,manifest_id TEXT NOT NULL,basis_json TEXT NOT NULL,mappings_json TEXT NOT NULL,rolled INTEGER NOT NULL DEFAULT 0,token_total INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sync_generations_scope ON sync_generations(scope_id);
CREATE TABLE IF NOT EXISTS sync_observations(id TEXT PRIMARY KEY,record_json TEXT NOT NULL,timestamp_ms INTEGER NOT NULL,source TEXT NOT NULL,session_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sync_entities(id TEXT PRIMARY KEY,scope_id TEXT NOT NULL,native_key_hash TEXT);
CREATE TABLE IF NOT EXISTS sync_changes(generation_id TEXT NOT NULL,position INTEGER NOT NULL,observation_id TEXT,entity_id TEXT,PRIMARY KEY(generation_id,position));
CREATE TABLE IF NOT EXISTS sync_current(scope_id TEXT NOT NULL,position INTEGER NOT NULL,observation_id TEXT NOT NULL,entity_id TEXT NOT NULL,PRIMARY KEY(scope_id,position));
CREATE INDEX IF NOT EXISTS sync_current_observation ON sync_current(observation_id);
CREATE INDEX IF NOT EXISTS sync_observations_time ON sync_observations(timestamp_ms);
CREATE TABLE IF NOT EXISTS sync_receipts(device_id TEXT NOT NULL,batch_id TEXT NOT NULL,payload_hash TEXT NOT NULL,receipt_json TEXT NOT NULL,PRIMARY KEY(device_id,batch_id));
CREATE TABLE IF NOT EXISTS sync_receipt_clock(device_id TEXT NOT NULL,batch_id TEXT NOT NULL,committed_at INTEGER NOT NULL,PRIMARY KEY(device_id,batch_id));
CREATE INDEX IF NOT EXISTS sync_receipt_clock_latest ON sync_receipt_clock(device_id,committed_at);
CREATE TABLE IF NOT EXISTS sync_reviews(id INTEGER PRIMARY KEY,scope_id TEXT NOT NULL,manifest_id TEXT NOT NULL,code TEXT NOT NULL,header_json TEXT NOT NULL,created_at INTEGER NOT NULL,proposal_hash TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS sync_review_members(review_id INTEGER NOT NULL,position INTEGER NOT NULL,observation_id TEXT NOT NULL,PRIMARY KEY(review_id,position));
CREATE TABLE IF NOT EXISTS sync_review_resolutions(review_id INTEGER PRIMARY KEY,resolution_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sync_audit(id INTEGER PRIMARY KEY,operation TEXT NOT NULL,scope_id TEXT,reference TEXT NOT NULL,actor_json TEXT NOT NULL,data_revision INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sync_staging(device_id TEXT NOT NULL,batch_id TEXT NOT NULL,payload_hash TEXT NOT NULL,header_json TEXT NOT NULL,next_offset INTEGER NOT NULL DEFAULT 0,byte_count INTEGER NOT NULL DEFAULT 0,expires_at INTEGER NOT NULL,PRIMARY KEY(device_id,batch_id));
CREATE TABLE IF NOT EXISTS sync_stage_pages(device_id TEXT NOT NULL,batch_id TEXT NOT NULL,offset INTEGER NOT NULL,page_hash TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(device_id,batch_id,offset));
CREATE TABLE IF NOT EXISTS sync_stage_records(device_id TEXT NOT NULL,batch_id TEXT NOT NULL,position INTEGER NOT NULL,record_json TEXT NOT NULL,PRIMARY KEY(device_id,batch_id,position));
CREATE TABLE IF NOT EXISTS sync_legacy_batches(id TEXT PRIMARY KEY,source_order INTEGER NOT NULL,checksum TEXT NOT NULL,immutable_hash TEXT NOT NULL,status TEXT NOT NULL,receipt_json TEXT NOT NULL,metadata_json TEXT NOT NULL,mappings_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sync_legacy_members(batch_id TEXT NOT NULL,position INTEGER NOT NULL,observation_id TEXT NOT NULL,canonical_id TEXT NOT NULL,variant_hash TEXT NOT NULL,project TEXT NOT NULL,PRIMARY KEY(batch_id,position));
CREATE INDEX IF NOT EXISTS sync_legacy_members_identity ON sync_legacy_members(canonical_id);
CREATE INDEX IF NOT EXISTS sync_legacy_members_variant ON sync_legacy_members(variant_hash);
CREATE TABLE IF NOT EXISTS sync_legacy_prices(batch_id TEXT NOT NULL,model TEXT NOT NULL,price_json TEXT NOT NULL,PRIMARY KEY(batch_id,model));
CREATE TABLE IF NOT EXISTS sync_adoptions(batch_id TEXT NOT NULL,position INTEGER NOT NULL,scope_id TEXT NOT NULL,grant_json TEXT NOT NULL,PRIMARY KEY(batch_id,position));
CREATE INDEX IF NOT EXISTS sync_adoptions_scope ON sync_adoptions(scope_id,batch_id);
CREATE TABLE IF NOT EXISTS sync_legacy_projection(variant_hash TEXT PRIMARY KEY,batch_id TEXT NOT NULL,position INTEGER NOT NULL,observation_id TEXT NOT NULL,canonical_id TEXT NOT NULL,project TEXT NOT NULL,source_order INTEGER NOT NULL);
`;
type StoredScope = { head_manifest: string | null; head_generation: string | null; visible_generation: string | null; fenced: number };
export class SyncStore {
  readonly db: DatabaseSync;
  private busyRetries: number;
  busyRetryCount = 0;
  constructor(readonly path: string, options: { busyTimeoutMs?: number; busyRetries?: number } = {}) {
    requireSync(isAbsolute(path), 'EXPLICIT_ABSOLUTE_STORE_PATH_REQUIRED'); mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    const existing = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => String(row.name));
    if (existing.length && !existing.includes('sync_meta')) { this.db.close(); throw new SyncError('NOT_A_SYNC_DATABASE'); }
    this.busyRetries = options.busyRetries ?? 3;
    requireSync(Number.isSafeInteger(this.busyRetries) && this.busyRetries >= 0 && this.busyRetries <= 10, 'INVALID_BUSY_LIMIT');
    const timeout = options.busyTimeoutMs ?? 25; requireSync(Number.isSafeInteger(timeout) && timeout >= 0 && timeout <= 1000, 'INVALID_BUSY_LIMIT');
    this.db.exec(`PRAGMA busy_timeout=${timeout}; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA cache_size=-32768; PRAGMA mmap_size=0; PRAGMA temp_store=FILE;`);
    this.db.exec(SYNC_SCHEMA); requireSync(Number(this.db.prepare('SELECT schema_version FROM sync_meta').get()!.schema_version) === 2, 'SCHEMA_VERSION_MISMATCH');
  }
  close() { this.db.close(); }
  revision() { return Number(this.db.prepare('SELECT data_revision FROM sync_meta WHERE id=1').get()!.data_revision); }
  audit(operation: string, scope: string | null, reference: string, actor: SyncActor) {
    this.db.prepare('INSERT INTO sync_audit(operation,scope_id,reference,actor_json,data_revision) VALUES(?,?,?,?,?)').run(operation,scope,reference,JSON.stringify(actor),this.revision());
  }
  bump() { this.db.exec('UPDATE sync_meta SET data_revision=data_revision+1 WHERE id=1'); }
  transaction<T>(action: () => T): T {
    for (let attempt = 0; ; attempt++) {
      let began = false;
      try { this.db.exec('BEGIN IMMEDIATE'); began = true; const result = action(); this.db.exec('COMMIT'); return result; }
      catch (error) {
        if (began) this.db.exec('ROLLBACK');
        const busy = /database is locked|database is busy|SQLITE_BUSY/i.test((error as Error).message);
        if (!busy) throw error;
        if (attempt >= this.busyRetries) throw new SyncError('SQLITE_BUSY_EXHAUSTED');
        this.busyRetryCount++;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5 * (attempt + 1));
      }
    }
  }
  owner(actor: SyncActor) { requireSync(actor.role === 'owner' && typeof actor.subject==='string' && actor.subject.trim().length>0 && actor.subject.length<=200
    && typeof actor.reason==='string' && actor.reason.trim().length>0 && actor.reason.length<=2000, 'EXPLICIT_OWNER_REQUIRED'); }
  authorize(scope: SyncScope, actor: SyncActor) {
    requireSync(actor.role === 'owner' || actor.role==='device' && actor.deviceId === scope.deviceId, 'DEVICE_MISMATCH');
    if (actor.role === 'owner') this.owner(actor);
    const binding = this.db.prepare('SELECT scope_json FROM sync_origins WHERE origin_id=? AND scope_id=?').get(scope.originId,syncScopeId(scope));
    requireSync(binding && hash(JSON.parse(String(binding.scope_json))) === hash(scope), 'SCOPE_MISMATCH');
  }
  register(scope: SyncScope, label: string, actor: SyncActor) {
    this.owner(actor); requireSync(label.length > 0 && label.length <= 128, 'INVALID_LABEL');
    this.transaction(() => {
      const id = syncScopeId(scope), prior = this.db.prepare('SELECT scope_json FROM sync_origins WHERE origin_id=? OR scope_id=?').all(scope.originId,id);
      requireSync(prior.every(row => hash(JSON.parse(String(row.scope_json))) === hash(scope)), 'ORIGIN_OWNERSHIP_CONFLICT');
      if (!prior.length) { this.db.prepare('INSERT INTO sync_origins VALUES(?,?,?,?)').run(scope.originId,id,JSON.stringify(scope),label);
        this.db.prepare('INSERT INTO sync_scopes(scope_id) VALUES(?)').run(id); this.audit('register',id,scope.originId,actor); }
    });
  }
  receipt(device: string, batch: string): SyncReceipt | undefined {
    const row = this.db.prepare('SELECT receipt_json FROM sync_receipts WHERE device_id=? AND batch_id=?').get(device,batch); return row ? JSON.parse(String(row.receipt_json)) : undefined;
  }
  begin(input: unknown, actor: SyncActor, now = Date.now()) {
    const header = validateHeader(input), device = header.manifest.scope.deviceId, payload = hash(header); this.authorize(header.manifest.scope,actor);
    return this.transaction(() => {
      const receipt = this.receipt(device,header.batchId);
      if (receipt) { requireSync(receipt.payloadHash === payload, 'BATCH_PAYLOAD_MISMATCH'); return { nextOffset: header.manifest.recordCount, receipt }; }
      const old = this.db.prepare('SELECT payload_hash,next_offset,expires_at FROM sync_staging WHERE device_id=? AND batch_id=?').get(device,header.batchId);
      if (old) { requireSync(old.payload_hash === payload, 'BATCH_PAYLOAD_MISMATCH'); requireSync(Number(old.expires_at) > now, 'STAGING_EXPIRED'); return { nextOffset: Number(old.next_offset) }; }
      this.db.prepare('INSERT INTO sync_staging(device_id,batch_id,payload_hash,header_json,expires_at) VALUES(?,?,?,?,?)').run(device,header.batchId,payload,JSON.stringify(header),now + SYNC_LIMITS.ttlMs);
      return { nextOffset: 0 };
    });
  }
  stage(device: string, batch: string, offset: number, input: unknown, actor: SyncActor, now = Date.now()) {
    return this.transaction(() => {
      const state = this.db.prepare('SELECT * FROM sync_staging WHERE device_id=? AND batch_id=?').get(device,batch); requireSync(state,'STAGING_NOT_FOUND');
      const header: SyncHeader = JSON.parse(String(state.header_json)); this.authorize(header.manifest.scope,actor); requireSync(Number(state.expires_at) > now,'STAGING_EXPIRED');
      const records = validateRecords(input,header); requireSync(records.length > 0,'EMPTY_PAGE'); requireSync(Number.isSafeInteger(offset) && offset >= 0,'INVALID_OFFSET');
      const pageHash = sequenceHash(records), prior = this.db.prepare('SELECT page_hash,count FROM sync_stage_pages WHERE device_id=? AND batch_id=? AND offset=?').get(device,batch,offset);
      if (prior) { requireSync(prior.page_hash === pageHash && Number(prior.count) === records.length,'PAGE_PAYLOAD_MISMATCH'); return Number(state.next_offset); }
      requireSync(offset === Number(state.next_offset) && offset + records.length <= header.manifest.recordCount,'PAGE_ORDER_MISMATCH');
      const bytes = Buffer.byteLength(JSON.stringify(records)); requireSync(Number(state.byte_count) + bytes <= SYNC_LIMITS.stagedBytes,'STAGING_BYTE_LIMIT');
      const insert = this.db.prepare('INSERT INTO sync_stage_records VALUES(?,?,?,?)'); records.forEach((record,i) => insert.run(device,batch,offset + i,JSON.stringify(record)));
      this.db.prepare('INSERT INTO sync_stage_pages VALUES(?,?,?,?,?)').run(device,batch,offset,pageHash,records.length);
      this.db.prepare('UPDATE sync_staging SET next_offset=?,byte_count=byte_count+? WHERE device_id=? AND batch_id=?').run(offset + records.length,bytes,device,batch);
      return offset + records.length;
    });
  }
  *staged(device: string,batch: string): Generator<SyncRecord> {
    for (const row of this.db.prepare('SELECT record_json FROM sync_stage_records WHERE device_id=? AND batch_id=? ORDER BY position').iterate(device,batch)) yield JSON.parse(String(row.record_json));
  }
  *current(scope: string): Generator<SyncRecord> {
    for (const row of this.db.prepare('SELECT o.record_json FROM sync_current c JOIN sync_observations o ON o.id=c.observation_id WHERE c.scope_id=? ORDER BY c.position').iterate(scope)) yield JSON.parse(String(row.record_json));
  }
  parent(scope: string): SyncManifest | undefined {
    const row = this.db.prepare('SELECT m.header_json FROM sync_scopes s JOIN sync_manifests m ON m.id=s.head_manifest WHERE s.scope_id=?').get(scope);
    return row ? (JSON.parse(String(row.header_json)) as SyncHeader).manifest : undefined;
  }
  // Extension point for normalized v1 adoption. Always invoked inside the commit transaction.
  beforeVisible?: (header: SyncHeader, actor: SyncActor) => void;
  onVisible?: (header: SyncHeader, actor: SyncActor) => boolean | void;
  commit(device: string,batch: string,actor: SyncActor, options: { fault?: 'after-observations' | 'after-visible' | 'before-receipt'; onStage?: () => void } = {}): SyncReceipt {
    return this.transaction(() => {
      const oldReceipt = this.receipt(device,batch);
      if (oldReceipt) {
        const origin = this.db.prepare('SELECT scope_json FROM sync_origins WHERE scope_id=(SELECT scope_id FROM sync_manifests WHERE id=?)').get(oldReceipt.manifestHash);
        if (origin) this.authorize(JSON.parse(String(origin.scope_json)),actor); else requireSync(actor.role === 'owner' || actor.deviceId === device,'DEVICE_MISMATCH');
        return oldReceipt;
      }
      const stage = this.db.prepare('SELECT * FROM sync_staging WHERE device_id=? AND batch_id=?').get(device,batch); requireSync(stage,'STAGING_NOT_FOUND');
      const header: SyncHeader = JSON.parse(String(stage.header_json)), manifest = header.manifest, id = syncScopeId(manifest.scope); this.authorize(manifest.scope,actor);
      requireSync(Number(stage.expires_at) > Date.now(),'STAGING_EXPIRED'); requireSync(Number(stage.next_offset) === manifest.recordCount,'INCOMPLETE_STAGING');
      requireSync(sequenceHash(this.staged(device,batch)) === manifest.sequenceHash,'SEQUENCE_HASH_MISMATCH');
      const state = this.db.prepare('SELECT * FROM sync_scopes WHERE scope_id=?').get(id) as StoredScope;
      const parent = this.parent(id); let code = '', changed = false,tokenTotal=0;
      try {
        if (manifest.intent !== 'observe') this.owner(actor);
        if (parent) requireSync(manifest.parent?.manifestHash === parent.manifestHash && manifest.parent.generationId === parent.generationId,'PARENT_MISMATCH');
        if (manifest.intent === 'rebase') { requireSync(parent && manifest.epoch === parent.epoch + 1,'INVALID_EPOCH'); qualifyRanges(undefined,{ ...manifest,parent:null }); tokenTotal=qualifyRecords([],this.staged(device,batch),manifest); }
        else {
          requireSync(!state.fenced,'ROLLED_BACK_LINEAGE'); requireSync(!parent || manifest.epoch === parent.epoch,'INVALID_EPOCH'); qualifyRanges(parent,manifest);
          if (parent && manifest.intent === 'observe') requireSync(parent.basisHash === manifest.basisHash && parent.mappingsHash === manifest.mappingsHash,'EXPLICIT_OWNER_REQUIRED');
          tokenTotal=qualifyRecords(this.current(id),this.staged(device,batch),manifest);
        }
        const others=Number(this.db.prepare('SELECT TOTAL(token_total) n FROM sync_scopes WHERE scope_id!=?').get(id)!.n);
        requireSync(Number.isSafeInteger(others+tokenTotal),'TOKEN_TOTAL_OVERFLOW');
        this.beforeVisible?.(header,actor);
        changed = !parent || manifest.sequenceHash !== parent.sequenceHash || manifest.basisHash !== parent.basisHash || manifest.mappingsHash !== parent.mappingsHash || manifest.epoch!==parent.epoch || manifest.reader!==parent.reader;
      } catch (error) {
        if (!(error instanceof SyncError)) throw error; code = error.code;
      }
      this.db.prepare('INSERT OR IGNORE INTO sync_manifests VALUES(?,?,?,?)').run(manifest.manifestHash,id,manifest.generationId,JSON.stringify(header));
      if (!code) {
        changed=this.onVisible?.(header,actor)===true||changed;
        this.db.prepare('INSERT INTO sync_generations(id,scope_id,parent_id,manifest_id,basis_json,mappings_json,token_total) VALUES(?,?,?,?,?,?,?)')
          .run(manifest.generationId,id,state.visible_generation,manifest.manifestHash,JSON.stringify(header.basis),JSON.stringify(header.mappings),tokenTotal);
        if (changed) {
          const putObservation = this.db.prepare('INSERT OR IGNORE INTO sync_observations VALUES(?,?,?,?,?)'), delta = this.db.prepare('INSERT INTO sync_changes VALUES(?,?,?,?)');
          const putEntity = this.db.prepare('INSERT OR IGNORE INTO sync_entities VALUES(?,?,?)');
          const old = this.db.prepare('SELECT observation_id FROM sync_current WHERE scope_id=? AND position=?'), upsert = this.db.prepare('INSERT INTO sync_current VALUES(?,?,?,?) ON CONFLICT(scope_id,position) DO UPDATE SET observation_id=excluded.observation_id,entity_id=excluded.entity_id');
          let position = 0;
          for (const record of this.staged(device,batch)) {
            const observationId = hash(record), previous = old.get(id,position);
            if (previous?.observation_id !== observationId) {
              putObservation.run(observationId,JSON.stringify(record),record.event.timestampMs,record.event.source,record.event.sessionId);
              const entity = syncEntityId(manifest.scope,record); putEntity.run(entity,id,record.nativeKey?.keyHash ?? null);
              delta.run(manifest.generationId,position,observationId,entity); upsert.run(id,position,observationId,entity);
            }
            position++;
          }
          for (const row of this.db.prepare('SELECT position FROM sync_current WHERE scope_id=? AND position>=?').all(id,position)) delta.run(manifest.generationId,row.position,null,null);
          this.db.prepare('DELETE FROM sync_current WHERE scope_id=? AND position>=?').run(id,position);
          this.bump();
        }
        if (options.fault === 'after-observations') throw new SyncError('INJECTED_FAILURE');
        this.db.prepare('UPDATE sync_scopes SET head_manifest=?,head_generation=?,visible_generation=?,fenced=0,token_total=? WHERE scope_id=?').run(manifest.manifestHash,manifest.generationId,manifest.generationId,tokenTotal,id);
        options.onStage?.(); if (options.fault === 'after-visible') throw new SyncError('INJECTED_FAILURE');
      } else {
        const proposal=hash([id,manifest.parent,manifest.sequenceHash,manifest.basisHash,manifest.mappingsHash,code]);
        if(!this.db.prepare('SELECT id FROM sync_reviews WHERE proposal_hash=?').get(proposal)) {
          const review=this.db.prepare('INSERT INTO sync_reviews(scope_id,manifest_id,code,header_json,created_at,proposal_hash) VALUES(?,?,?,?,?,?)').run(id,manifest.manifestHash,code,JSON.stringify(header),Date.now(),proposal);
          const observation=this.db.prepare('INSERT OR IGNORE INTO sync_observations VALUES(?,?,?,?,?)'),membership=this.db.prepare('INSERT INTO sync_review_members VALUES(?,?,?)');let position=0;
          for(const record of this.staged(device,batch)) {const key=hash(record);observation.run(key,JSON.stringify(record),record.event.timestampMs,record.event.source,record.event.sessionId);membership.run(review.lastInsertRowid,position++,key);}
        }
      }
      const receipt: SyncReceipt = { batchId: batch,payloadHash: String(stage.payload_hash),generationId: manifest.generationId,manifestHash: manifest.manifestHash,dataRevision: this.revision(),
        status: code ? 'review-required' : 'committed',outcome: code ? 'conflict' : !changed ? 'unchanged' : parent ? 'updated' : 'inserted',code: code || (!parent || manifest.intent === 'rebase' ? 'baseline-observed' : !changed ? 'unchanged' : 'since-enrollment') };
      this.audit(code ? 'review' : manifest.intent,id,manifest.manifestHash,actor);
      if (options.fault === 'before-receipt') throw new SyncError('INJECTED_FAILURE');
      this.db.prepare('INSERT INTO sync_receipts VALUES(?,?,?,?)').run(device,batch,stage.payload_hash,JSON.stringify(receipt));
      if(receipt.status==='committed')this.db.prepare('INSERT INTO sync_receipt_clock VALUES(?,?,?)').run(device,batch,Date.now());
      // Review proposals have immutable normalized members; TTL only applies to
      // incomplete transport staging, never to accepted or quarantined history.
      this.clearStage(device,batch);
      return receipt;
    });
  }
  clearStage(device: string,batch: string) {
    for (const table of ['sync_stage_records','sync_stage_pages','sync_staging']) this.db.prepare(`DELETE FROM ${table} WHERE device_id=? AND batch_id=?`).run(device,batch);
  }
  cleanup(now = Date.now()) { return this.transaction(() => { const rows = this.db.prepare('SELECT device_id,batch_id FROM sync_staging WHERE expires_at<=?').all(now);
    for (const row of rows) this.clearStage(String(row.device_id),String(row.batch_id)); return rows.length; }); }
  reviews(actor:SyncActor) {
    this.owner(actor);return this.db.prepare('SELECT r.id,r.scope_id,r.manifest_id,r.code,r.created_at,x.resolution_json FROM sync_reviews r LEFT JOIN sync_review_resolutions x ON x.review_id=r.id ORDER BY r.id').all();
  }
  reviewPage(reviewId:number,offset:number,limit:number,actor:SyncActor) {
    this.owner(actor);requireSync(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>0&&limit<=SYNC_LIMITS.pageRecords,'INVALID_READ_PAGE');
    const review=this.db.prepare('SELECT header_json,code FROM sync_reviews WHERE id=?').get(reviewId);requireSync(review,'REVIEW_NOT_FOUND');const records:SyncRecord[]=[];let bytes=2;
    for(const row of this.db.prepare('SELECT o.record_json FROM sync_review_members m JOIN sync_observations o ON o.id=m.observation_id WHERE m.review_id=? AND m.position>=? ORDER BY m.position LIMIT ?').iterate(reviewId,offset,limit)) {
      const value=String(row.record_json),size=Buffer.byteLength(value)+(records.length?1:0);if(bytes+size>SYNC_LIMITS.pageBytes)break;records.push(JSON.parse(value));bytes+=size;
    }
    return{header:JSON.parse(String(review.header_json)) as SyncHeader,code:String(review.code),records,nextOffset:offset+records.length};
  }
  resolveReview(reviewId:number,actor:SyncActor,committedSuccessor?:string) {
    this.owner(actor);this.transaction(()=>{const review=this.db.prepare('SELECT scope_id FROM sync_reviews WHERE id=?').get(reviewId);requireSync(review,'REVIEW_NOT_FOUND');
      if(committedSuccessor)requireSync(this.db.prepare('SELECT 1 FROM sync_scopes WHERE scope_id=? AND head_manifest=?').get(review.scope_id,committedSuccessor),'COMMITTED_SUCCESSOR_REQUIRED');
      if(this.db.prepare('SELECT 1 FROM sync_review_resolutions WHERE review_id=?').get(reviewId))return;
      this.db.prepare('INSERT INTO sync_review_resolutions VALUES(?,?)').run(reviewId,JSON.stringify({actor,disposition:committedSuccessor?'accepted-successor':'dismissed',committedSuccessor}));this.bump();this.audit('review-resolved',String(review.scope_id),String(reviewId),actor);
    });
  }
  currentPage(scope:SyncScope,offset:number,limit:number,actor:SyncActor,expectedRevision?:number) {
    this.authorize(scope,actor);requireSync(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>0&&limit<=SYNC_LIMITS.pageRecords,'INVALID_READ_PAGE');
    this.db.exec('BEGIN');try{const dataRevision=this.revision();requireSync(expectedRevision===undefined||expectedRevision===dataRevision,'READ_REVISION_CHANGED');
      const records:SyncRecord[]=[];let bytes=2;
      for(const row of this.db.prepare('SELECT o.record_json FROM sync_current c JOIN sync_observations o ON o.id=c.observation_id WHERE c.scope_id=? AND c.position>=? ORDER BY c.position LIMIT ?').iterate(syncScopeId(scope),offset,limit)) {
        const value=String(row.record_json),size=Buffer.byteLength(value)+(records.length?1:0);if(bytes+size>SYNC_LIMITS.pageBytes)break;records.push(JSON.parse(value));bytes+=size;
      }
      return{records,nextOffset:offset+records.length,dataRevision};
    }finally{this.db.exec('COMMIT');}
  }
  protected rebuildScope(scope: string,generation: string | null) {
    this.db.prepare('DELETE FROM sync_current WHERE scope_id=?').run(scope);
    if (generation) this.db.prepare(`WITH RECURSIVE chain(id,depth) AS (SELECT ?,0 UNION ALL SELECT g.parent_id,c.depth+1 FROM sync_generations g JOIN chain c ON g.id=c.id WHERE g.parent_id IS NOT NULL),
      ranked AS (SELECT d.position,d.observation_id,d.entity_id,ROW_NUMBER() OVER(PARTITION BY d.position ORDER BY c.depth) rank FROM sync_changes d JOIN chain c ON c.id=d.generation_id)
      INSERT INTO sync_current SELECT ?,position,observation_id,entity_id FROM ranked WHERE rank=1 AND observation_id IS NOT NULL`).run(generation,scope);
    const total=generation?this.db.prepare('SELECT token_total FROM sync_generations WHERE id=?').get(generation)!.token_total:0;
    this.db.prepare('UPDATE sync_scopes SET token_total=? WHERE scope_id=?').run(total,scope);
  }
  rollback(generation: string,actor: SyncActor) {
    this.owner(actor); this.transaction(() => {
      const row = this.db.prepare('SELECT * FROM sync_generations WHERE id=?').get(generation); requireSync(row,'GENERATION_NOT_FOUND');
      if (Number(row.rolled)) return;
      const scope = String(row.scope_id), visible = this.db.prepare('SELECT visible_generation FROM sync_scopes WHERE scope_id=?').get(scope)!;
      this.db.prepare('UPDATE sync_generations SET rolled=1 WHERE id=?').run(generation);
      if (visible.visible_generation === generation) {
        let selected = row.parent_id;
        while (selected) { const candidate = this.db.prepare('SELECT parent_id,rolled FROM sync_generations WHERE id=?').get(selected)!; if (!Number(candidate.rolled)) break; selected = candidate.parent_id; }
        this.rebuildScope(scope,selected ? String(selected) : null);
        const tokens=selected?this.db.prepare('SELECT token_total FROM sync_generations WHERE id=?').get(selected)!.token_total:0;
        this.db.prepare('UPDATE sync_scopes SET visible_generation=?,fenced=1,token_total=? WHERE scope_id=?').run(selected,tokens,scope); this.bump();
      }
      this.audit('rollback',scope,generation,actor);
    });
  }
  rebuild(actor: SyncActor) { this.owner(actor); this.transaction(() => { for (const row of this.db.prepare('SELECT scope_id,visible_generation FROM sync_scopes').all()) this.rebuildScope(String(row.scope_id),row.visible_generation ? String(row.visible_generation) : null); }); }
}
