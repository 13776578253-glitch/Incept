import type { TransferBundle, TransferEvent } from '../../../../domain';
import { dashboardDate } from '../../../../domain';
import type { SyncBasis, SyncRecord, SyncScope } from '../../../../domain/sync';
import type { RawUsageEvent, UnitPricing } from '../../types';
import { canonicalModelName } from '../../overrides';
import { computeCostFromPricing, canPriceUsage, lookupPricing } from '../../pricing';
import { applyCommandCodeQuota } from '../../pricing-schedule';
import { canonicalTransferId, identityIndex, hasWeakIdentity } from '../matching';
import { nativeEventId, recordHash,hash } from '../identity';
import { capturedPricing } from '../pricing';
import { priceSyncRecord } from './pricing';
import type { CompatibleSyncService } from './legacy';
import { requireSync } from './contract';

export const LEGACY_READ_SQL = `SELECT p.*,o.record_json FROM sync_legacy_projection p JOIN sync_observations o ON o.id=p.observation_id
 LEFT JOIN sync_adoptions a ON a.batch_id=p.batch_id AND a.position=p.position LEFT JOIN sync_scopes s ON s.scope_id=a.scope_id
 WHERE s.visible_generation IS NULL ORDER BY p.source_order,p.position`;
export const CURRENT_READ_SQL = `SELECT c.*,o.record_json,g.basis_json,g.mappings_json,r.scope_json,r.label
 FROM sync_current c JOIN sync_observations o ON o.id=c.observation_id JOIN sync_scopes s ON s.scope_id=c.scope_id
 JOIN sync_generations g ON g.id=s.visible_generation JOIN sync_origins r ON r.scope_id=c.scope_id ORDER BY c.scope_id,c.position`;
export const PROVENANCE_READ_SQL='SELECT p.* FROM sync_provenance p JOIN sync_scopes s ON s.scope_id=p.scope_id WHERE s.visible_generation IS NOT NULL ORDER BY p.source_order';

// O(distinct eligible legacy variants + visible v2 records), independent of the
// number of duplicate historical batch JSON payloads. No temporary compat DB.
export function readSyncView(service: CompatibleSyncService, native: RawUsageEvent[] = [], receiver = new Map<string,UnitPricing>(), aliases: Record<string,string> = {}) {
  const db=service.db; db.exec('BEGIN');
  try {
    const dataRevision=service.revision(), resolve=(model:string)=>canonicalModelName(model,aliases);
    const catalogs=new Map<string,{bundle:TransferBundle;captured:Map<string,UnitPricing>;mappings:Record<string,string|null>;order:number}>();
    const pricesByBatch=new Map<string,Record<string,UnitPricing>>();
    for(const row of db.prepare(`SELECT p.* FROM sync_legacy_prices p JOIN sync_legacy_batches b ON b.id=p.batch_id WHERE b.status='active' ORDER BY b.source_order DESC`).iterate()) {
      const id=String(row.batch_id), prices=pricesByBatch.get(id)??{};prices[String(row.model)]=JSON.parse(String(row.price_json));pricesByBatch.set(id,prices);
    }
    const pricing=new Map(receiver); let updatedAt=0;
    for(const row of db.prepare("SELECT * FROM sync_legacy_batches WHERE status='active' ORDER BY source_order DESC").iterate()) {
      const id=String(row.id), bundle={...JSON.parse(String(row.metadata_json)),events:[],prices:pricesByBatch.get(id)??{}} as TransferBundle, captured=capturedPricing(bundle,aliases);
      for(const [model,price] of captured) if(!lookupPricing(pricing,model)) pricing.set(model,price);
      catalogs.set(id,{bundle,captured,mappings:JSON.parse(String(row.mappings_json)),order:Number(row.source_order)});
      updatedAt=Math.max(updatedAt,Date.parse(JSON.parse(String(row.receipt_json)).importedAt));
    }
    const records:Array<{event:TransferEvent;catalog:NonNullable<ReturnType<typeof catalogs.get>>;batchId:string;project:string}>=[];
    for(const row of db.prepare(LEGACY_READ_SQL).iterate()) records.push({event:(JSON.parse(String(row.record_json)) as SyncRecord).event,
      catalog:catalogs.get(String(row.batch_id))!,batchId:String(row.batch_id),project:String(row.project)});
    const local=identityIndex(native.map(raw=>({raw,event:{...raw,eventId:nativeEventId(raw),source:raw.sourceId} as TransferEvent})),resolve), transferred=identityIndex(records,resolve);
    const seen=new Set<string>(), replacedIndexed=new Set<RawUsageEvent>(), events:RawUsageEvent[]=[], issues:string[]=[], targets=new Map(native.map(row=>[row.projectKey,row]));
    for(const {event,catalog,batchId,project:effectiveProject} of records) {
      const identity=canonicalTransferId(event); if(seen.has(identity)) continue;
      if(hasWeakIdentity(event) && transferred.hasWeak(event)) {
        const strong=transferred.related(event).filter(row=>!hasWeakIdentity(row.event));
        if(strong.length) {const ids=new Set(strong.map(row=>row.event.eventId)), fingerprint=recordHash(event,resolve(event.modelName));
          if(ids.size===1 && strong.every(row=>recordHash(row.event,resolve(row.event.modelName))===fingerprint && row.project===effectiveProject)) continue;
          issues.push('Ambiguous historical import identity; review the affected batches before updating data.');}
      }
      const match=local.find(event,transferred);
      if(match.matches.length && !match.ambiguous) {
        const indexed=match.matches.filter(row=>!row.raw.eventId && ['codex','commandcode'].includes(row.raw.sourceId));
        if(indexed.length!==match.matches.length) continue;for(const row of indexed) replacedIndexed.add(row.raw);
      } else if(match.ambiguous) issues.push('Ambiguous native/import identity; review the affected batches before updating data.');
      seen.add(identity);
      const modelName=resolve(event.modelName), price=lookupPricing(receiver,modelName)??lookupPricing(catalog.captured,event.modelName)??lookupPricing(catalog.captured,modelName)??lookupPricing(pricing,modelName);
      if(price && !lookupPricing(pricing,modelName)) pricing.set(modelName.toLowerCase(),price);
      const target=catalog.mappings[event.projectKey], project=target?targets.get(target):undefined,dateKey=dashboardDate(event.timestampMs);
      const labels={codex:'Codex CLI',commandcode:'CommandCode',antigravity:'Antigravity',claudeCode:'Claude Code',geminiCli:'Gemini CLI',opencode:'OpenCode',zcode:'ZCode'};
      events.push(applyCommandCodeQuota({...event,modelName,sourceId:event.source,sourceLabel:labels[event.source],deviceId:catalog.bundle.device.id,deviceLabel:catalog.bundle.device.label,importBatchId:batchId,
        projectKey:effectiveProject,projectName:project?.projectName??(target?event.projectName:event.projectName+' · '+catalog.bundle.device.label),workspacePath:project?.workspacePath??event.workspacePath,
        costSource:event.recordedCost===undefined?'calculated':'recorded',cost:event.recordedCost??computeCostFromPricing(price,event),missingPricing:event.recordedCost===undefined&&!canPriceUsage(price,event),dateKey,monthKey:dateKey.slice(0,7)}));
    }
    const ancestors=new Map<string,{batchId:string;legacyEventId:string}[]>();
    for(const row of db.prepare(PROVENANCE_READ_SQL).iterate()) {
      const key=JSON.stringify([row.scope_id,row.kind,row.target_key]),list=ancestors.get(key)??[];
      // Only the earliest general support and earliest exact legacy ID support
      // are needed; duplicate memberships never become per-read event copies.
      list.push({batchId:String(row.batch_id),legacyEventId:String(row.legacy_event_id)});ancestors.set(key,list);
    }
    for(const row of db.prepare(CURRENT_READ_SQL).iterate()) {
      const record=JSON.parse(String(row.record_json)) as SyncRecord, scope=JSON.parse(String(row.scope_json)) as SyncScope;
      const match=local.find(record.event);
      if(match.matches.length&&!match.ambiguous) {const indexed=match.matches.filter(item=>!item.raw.eventId&&['codex','commandcode'].includes(item.raw.sourceId));
        if(indexed.length!==match.matches.length) continue;for(const item of indexed)replacedIndexed.add(item.raw);}
      else if(match.ambiguous)issues.push('Ambiguous native/import identity; review the affected batches before updating data.');
      const event=priceSyncRecord(scope,record,JSON.parse(String(row.basis_json)) as SyncBasis,JSON.parse(String(row.mappings_json)),String(row.label));
      const kind=record.nativeKey?'native':record.pointKey?'point':'retained',key=record.nativeKey?.keyHash??record.pointKey??hash(record);
      const supports=ancestors.get(JSON.stringify([row.scope_id,kind,key]))??ancestors.get(JSON.stringify([row.scope_id,'session',row.scope_id]))??[];
      const ancestor=(supports.find(item=>item.legacyEventId===record.event.eventId)??supports[0])?.batchId,target=targets.get(event.projectKey);
      events.push({...event,...(target?{projectName:target.projectName,workspacePath:target.workspacePath}:{}),...(ancestor?{importBatchId:ancestor}:{})});
    }
    if(Number(db.prepare('SELECT COUNT(*) n FROM sync_legacy_quarantine').get()!.n))issues.push('LEGACY_OVERLAP_REVIEW_REQUIRED');
    const combined=[...native.filter(row=>!replacedIndexed.has(row)),...events];let tokens=0;
    for(const row of combined){tokens+=row.inputTokens+row.outputTokens+row.cacheReadTokens+row.cacheCreationTokens+row.reasoningTokens;requireSync(Number.isSafeInteger(tokens),'TOKEN_TOTAL_OVERFLOW');}
    return {events:combined,pricing,updatedAt,dataRevision,issues:[...new Set(issues)],replacedIndexed};
  } finally {db.exec('COMMIT');}
}
