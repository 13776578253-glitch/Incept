import { DatabaseSync } from 'node:sqlite';
import { isAbsolute } from 'node:path';
import type { SyncActor, SyncHeader, SyncRecord } from '../../../../domain/sync';
import type { TransferBundle, TransferEvent, ImportReceipt } from '../../../../domain';
import { hash } from '../identity';
import { canonicalTransferId } from '../matching';
import { SyncService } from './service';
import { requireSync, syncEnvelope, syncScopeId } from './contract';

export class CompatibleSyncService extends SyncService {
  constructor(...args: ConstructorParameters<typeof SyncService>) {
    super(...args);
    this.db.exec(`CREATE TABLE IF NOT EXISTS sync_legacy_quarantine(batch_id TEXT NOT NULL,position INTEGER NOT NULL,scope_id TEXT NOT NULL,PRIMARY KEY(batch_id,position));
      CREATE TABLE IF NOT EXISTS sync_adoption_decisions(id TEXT PRIMARY KEY,decision_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sync_provenance(scope_id TEXT NOT NULL,kind TEXT NOT NULL,target_key TEXT NOT NULL,legacy_event_id TEXT NOT NULL,batch_id TEXT NOT NULL,source_order INTEGER NOT NULL,PRIMARY KEY(scope_id,kind,target_key,legacy_event_id));
      CREATE TABLE IF NOT EXISTS sync_adoption_grants(batch_id TEXT NOT NULL,position INTEGER NOT NULL,scope_id TEXT NOT NULL,manifest_id TEXT NOT NULL,grant_json TEXT NOT NULL,PRIMARY KEY(batch_id,position,manifest_id));`);
    this.beforeVisible = header => {
      const scope = header.manifest.scope, id = syncScopeId(scope);
      const missing = this.db.prepare(`SELECT m.batch_id FROM sync_legacy_members m JOIN sync_legacy_batches b ON b.id=m.batch_id
        JOIN sync_observations o ON o.id=m.observation_id LEFT JOIN sync_adoptions a ON a.batch_id=m.batch_id AND a.position=m.position
        WHERE json_extract(b.metadata_json,'$.device.id')=? AND o.source=? AND o.session_id=? AND (a.scope_id IS NULL OR a.scope_id!=?)
        AND NOT EXISTS(SELECT 1 FROM sync_adoption_grants g WHERE g.batch_id=m.batch_id AND g.position=m.position AND g.manifest_id=? AND g.scope_id=?) LIMIT 1`)
        .get(scope.deviceId,scope.source,scope.sessionId,id,header.manifest.manifestHash,id);
      requireSync(!missing,'V1_ADOPTION_REVIEW_REQUIRED');
    };
    this.onVisible = header => {
      if(!this.db.prepare('SELECT 1 FROM sync_adoption_grants WHERE manifest_id=? LIMIT 1').get(header.manifest.manifestHash))return;
      this.db.prepare(`INSERT INTO sync_adoptions SELECT batch_id,position,scope_id,grant_json FROM sync_adoption_grants WHERE manifest_id=? ON CONFLICT(batch_id,position) DO NOTHING`).run(header.manifest.manifestHash);
      this.db.prepare(`DELETE FROM sync_legacy_quarantine WHERE EXISTS(SELECT 1 FROM sync_adoption_grants g WHERE g.manifest_id=? AND g.batch_id=sync_legacy_quarantine.batch_id AND g.position=sync_legacy_quarantine.position)`).run(header.manifest.manifestHash);
      this.rebuildProvenance();this.rebuildLegacyProjection();
      this.db.prepare('DELETE FROM sync_adoption_grants WHERE manifest_id=?').run(header.manifest.manifestHash);
      return true;
    };
  }
  legacyReviews(actor:SyncActor) {this.owner(actor);return this.db.prepare('SELECT q.batch_id,q.scope_id,COUNT(*) records,b.checksum FROM sync_legacy_quarantine q JOIN sync_legacy_batches b ON b.id=q.batch_id GROUP BY q.batch_id,q.scope_id').all();}
  rebuildProvenance() {
    const rebuild=()=>this.db.exec(`DELETE FROM sync_provenance;
      INSERT INTO sync_provenance SELECT scope_id,kind,target_key,legacy_event_id,batch_id,source_order FROM (
        SELECT a.scope_id,json_extract(a.grant_json,'$.kind') kind,json_extract(a.grant_json,'$.key') target_key,
          json_extract(a.grant_json,'$.legacyEventId') legacy_event_id,a.batch_id,b.source_order,
          ROW_NUMBER() OVER(PARTITION BY a.scope_id,json_extract(a.grant_json,'$.kind'),json_extract(a.grant_json,'$.key'),json_extract(a.grant_json,'$.legacyEventId') ORDER BY b.source_order) rank
        FROM sync_adoptions a JOIN sync_legacy_batches b ON b.id=a.batch_id) WHERE rank=1;`);
    if(this.db.isTransaction)rebuild();else this.transaction(rebuild);
  }
  override rebuild(actor:SyncActor) {
    this.owner(actor);this.transaction(()=>{for(const row of this.db.prepare('SELECT scope_id,visible_generation FROM sync_scopes').all())this.rebuildScope(String(row.scope_id),row.visible_generation?String(row.visible_generation):null);
      this.rebuildLegacyProjection();this.rebuildProvenance();});
  }
  rebuildLegacyProjection() {
    const rebuild=()=>this.db.exec(`DELETE FROM sync_legacy_projection;
      INSERT INTO sync_legacy_projection SELECT variant_hash,batch_id,position,observation_id,canonical_id,project,source_order FROM (
        SELECT m.*,b.source_order,ROW_NUMBER() OVER(PARTITION BY m.variant_hash ORDER BY b.source_order,m.position) rank
        FROM sync_legacy_members m JOIN sync_legacy_batches b ON b.id=m.batch_id
        LEFT JOIN sync_legacy_quarantine q ON q.batch_id=m.batch_id AND q.position=m.position
        WHERE b.status='active' AND q.batch_id IS NULL) WHERE rank=1;`);
    if(this.db.isTransaction)rebuild();else this.transaction(rebuild);
  }
  migrateV1(path: string, actor: SyncActor, stopAfter = Infinity) {
    this.owner(actor); requireSync(isAbsolute(path) && path !== this.path,'EXPLICIT_V1_COPY_REQUIRED');
    const source = new DatabaseSync(path,{readOnly:true}); let processed = 0;
    try {
      // One original batch at a time, preserving its order and checksum. The
      // retained source copy remains the byte-for-byte original payload oracle.
      for (const row of source.prepare('SELECT rowid original_order,* FROM batches ORDER BY rowid').iterate()) {
        const raw = JSON.parse(String(row.payload)) as {bundle:TransferBundle;mappings:Record<string,string|null>}, receipt = JSON.parse(String(row.receipt)) as ImportReceipt;
        const immutable = hash([raw.bundle,raw.mappings]), old = this.db.prepare('SELECT immutable_hash,source_order,status,receipt_json FROM sync_legacy_batches WHERE id=?').get(row.id);
        if (old) {
          requireSync(old.immutable_hash === immutable && Number(old.source_order) === Number(row.original_order),'LEGACY_SOURCE_CHANGED');
          const oldReceipt=JSON.parse(String(old.receipt_json));
          requireSync(hash({...oldReceipt,status:undefined,rolledBackAt:undefined})===hash({...receipt,status:undefined,rolledBackAt:undefined}),'LEGACY_RECEIPT_CHANGED');
          requireSync(old.status !== 'rolled_back' || receipt.status === 'rolled_back','LEGACY_ROLLBACK_FENCE');
          if (old.status !== receipt.status) this.transaction(()=>{ this.db.prepare('UPDATE sync_legacy_batches SET status=?,receipt_json=? WHERE id=?').run(receipt.status,JSON.stringify(receipt),row.id); this.rebuildLegacyProjection();this.bump();this.audit('legacy-status',null,String(row.id),actor); });
          continue;
        }
        this.transaction(()=>{
          const {events,prices,...metadata} = raw.bundle;
          this.db.prepare('INSERT INTO sync_legacy_batches VALUES(?,?,?,?,?,?,?,?)').run(row.id,row.original_order,raw.bundle.checksum,immutable,receipt.status,JSON.stringify(receipt),JSON.stringify(metadata),JSON.stringify(raw.mappings));
          const price = this.db.prepare('INSERT INTO sync_legacy_prices VALUES(?,?,?)'); for (const [model,value] of Object.entries(prices)) price.run(row.id,model,JSON.stringify(value));
          const observation = this.db.prepare('INSERT OR IGNORE INTO sync_observations VALUES(?,?,?,?,?)'), member = this.db.prepare('INSERT INTO sync_legacy_members VALUES(?,?,?,?,?,?)');
          const projection = this.db.prepare(`INSERT INTO sync_legacy_projection VALUES(?,?,?,?,?,?,?) ON CONFLICT(variant_hash) DO UPDATE SET
            batch_id=excluded.batch_id,position=excluded.position,observation_id=excluded.observation_id,canonical_id=excluded.canonical_id,project=excluded.project,source_order=excluded.source_order
            WHERE excluded.source_order<sync_legacy_projection.source_order OR excluded.source_order=sync_legacy_projection.source_order AND excluded.position<sync_legacy_projection.position`);
          const activeScopes = this.db.prepare('SELECT o.scope_id,o.scope_json FROM sync_origins o JOIN sync_scopes s ON s.scope_id=o.scope_id WHERE s.visible_generation IS NOT NULL').all();
          for (const [position,event] of events.entries()) {
            const record: SyncRecord = {event,envelopeHash:''}; record.envelopeHash=syncEnvelope(record);
            const observationId = hash(record), project = raw.mappings[event.projectKey] || 'external:'+raw.bundle.device.id+':'+event.projectKey;
            const variant = hash([event,project,raw.bundle.device.id,raw.bundle.device.label]), canonical = canonicalTransferId(event);
            observation.run(observationId,JSON.stringify(record),event.timestampMs,event.source,event.sessionId); member.run(row.id,position,observationId,canonical,variant,project);
            const collision = activeScopes.find(binding=>{const scope=JSON.parse(String(binding.scope_json));return scope.deviceId===raw.bundle.device.id && scope.source===event.source && scope.sessionId===event.sessionId;});
            if(collision) { this.db.prepare('INSERT INTO sync_legacy_quarantine VALUES(?,?,?)').run(row.id,position,collision.scope_id); this.audit('legacy-overlap-review',String(collision.scope_id),JSON.stringify([row.id,position]),actor); }
            else if(receipt.status==='active') projection.run(variant,row.id,position,observationId,canonical,project,row.original_order);
          }
          this.bump();this.audit('legacy-migrate',null,String(row.id),actor);
        });
        if(++processed>=stopAfter) break;
      }
    } finally {source.close();}
    return processed;
  }
  adopt(header: SyncHeader, batchId: string, actor: SyncActor, mode: 'exact'|'owner-reviewed'='exact') {
    this.owner(actor); requireSync(mode==='exact'||mode==='owner-reviewed','INVALID_ADOPTION_MODE');this.authorize(header.manifest.scope,actor);
    this.transaction(()=>{
      const batch = this.db.prepare('SELECT * FROM sync_legacy_batches WHERE id=?').get(batchId); requireSync(batch,'LEGACY_BATCH_NOT_FOUND');
      const metadata=JSON.parse(String(batch.metadata_json)) as Omit<TransferBundle,'events'|'prices'>, scope=header.manifest.scope;
      requireSync(metadata.device.id===scope.deviceId,'ADOPTION_DEVICE_MISMATCH');
      const rows=this.db.prepare(`SELECT m.position,m.observation_id,a.scope_id adopted,o.record_json FROM sync_legacy_members m JOIN sync_observations o ON o.id=m.observation_id
        LEFT JOIN sync_adoptions a ON a.batch_id=m.batch_id AND a.position=m.position WHERE m.batch_id=? AND o.source=? AND o.session_id=? ORDER BY m.position`).all(batchId,scope.source,scope.sessionId);
      requireSync(rows.length,'ADOPTION_SCOPE_MISMATCH'); const id=syncScopeId(scope);
      for(const row of rows) requireSync(!row.adopted || row.adopted===id,'ADOPTION_OWNERSHIP_CONFLICT');
      const staged=this.db.prepare('SELECT next_offset,payload_hash FROM sync_staging WHERE device_id=? AND batch_id=?').get(scope.deviceId,header.batchId);
      requireSync(staged && Number(staged.next_offset)===header.manifest.recordCount && staged.payload_hash===hash(header),'COMPLETE_STAGING_REQUIRED');
      if(mode==='exact') {
        const content=(event:TransferEvent)=>hash({...event,eventId:undefined}), next:string[]=[];
        for(const row of this.staged(scope.deviceId,header.batchId))next.push(content(row.event));const uniqueNext=new Set(next);
        const old=rows.map(row=>content((JSON.parse(String(row.record_json)) as SyncRecord).event));
        requireSync(old.length===next.length && new Set(old).size===old.length && uniqueNext.size===next.length && old.every(key=>uniqueNext.has(key)),'ADOPTION_REVIEW_REQUIRED');
        const mappings=JSON.parse(String(batch.mappings_json)), rates=new Map(this.db.prepare('SELECT model,price_json FROM sync_legacy_prices WHERE batch_id=?').all(batchId).map(row=>[String(row.model),JSON.parse(String(row.price_json))]));
        requireSync(!Object.keys(header.basis.aliases).length,'PRICING_REVIEW_REQUIRED');
        for(const row of rows) {const event=(JSON.parse(String(row.record_json)) as SyncRecord).event;
          requireSync((mappings[event.projectKey]||null)===(header.mappings[event.projectKey]||null),'MAPPING_REVIEW_REQUIRED'); requireSync(hash(rates.get(event.modelName))===hash(header.basis.rates[event.modelName]),'PRICING_REVIEW_REQUIRED');}
      }
      const put=this.db.prepare('INSERT INTO sync_adoption_grants VALUES(?,?,?,?,?) ON CONFLICT(batch_id,position,manifest_id) DO NOTHING');
      const decision={mode,actor,checksum:batch.checksum,manifestHash:header.manifest.manifestHash},decisionId=hash(decision);
      this.db.prepare('INSERT OR IGNORE INTO sync_adoption_decisions VALUES(?,?)').run(decisionId,JSON.stringify(decision));
      const targets=new Map<string,SyncRecord[]>(),content=(event:TransferEvent)=>hash({...event,eventId:undefined});
      for(const record of this.staged(scope.deviceId,header.batchId)){const key=content(record.event),list=targets.get(key)??[];list.push(record);targets.set(key,list);}
      for(const row of rows){const event=(JSON.parse(String(row.record_json)) as SyncRecord).event,matched=targets.get(content(event)),target=matched?.length===1?matched[0]:undefined;
        const kind=target?.nativeKey?'native':target?.pointKey?'point':target?'retained':'session',key=target?.nativeKey?.keyHash??target?.pointKey??(target?hash(target):id);
        put.run(batchId,row.position,id,header.manifest.manifestHash,JSON.stringify({decisionId,kind,key,legacyEventId:event.eventId}));}
      this.audit('adoption-grant',id,batchId,actor);
    });
  }
}
