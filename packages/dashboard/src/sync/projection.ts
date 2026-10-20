import {DatabaseSync} from 'node:sqlite';
import {existsSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {readSyncView} from '../adapters/local/imports/sync/read';
import type {CompatibleSyncService} from '../adapters/local/imports/sync/legacy';
import {requireSync} from '../adapters/local/imports/sync/contract';
import {dateWindow,type UsageRange} from '../domain';
import {summarizeUsageEvents} from '../adapters/local/aggregation/summarize';
import {loadLocalPricingMap} from '../adapters/local/pricing';
import {readLocalOverrides} from '../adapters/local/overrides';
import {applyCommandCodeQuota} from '../adapters/local/pricing-schedule';
import {collectCommandCodeEvents} from '../adapters/local/collectors/commandcode';
import {collectAiusageAndRawAgentEvents} from '../adapters/local/collectors/agents';
import {normalizeFile} from '../adapters/local/collectors/common';
// An explicit immutable v1 migration is required before opting into this view.
// A changed/new/rolled-back v1 batch fails closed instead of simple addition.
export function projection(service:CompatibleSyncService,home:string,range:UsageRange,minimumRevision=0,legacyPath?:string,now=Date.now()){
  if(legacyPath&&existsSync(legacyPath)){const old=new DatabaseSync(legacyPath,{readOnly:true});try{for(const row of old.prepare('SELECT id,checksum,receipt FROM batches').iterate()){
    const migrated=service.db.prepare('SELECT checksum,status FROM sync_legacy_batches WHERE id=?').get(row.id as string);requireSync(migrated?.checksum===row.checksum&&migrated.status===JSON.parse(String(row.receipt)).status,'LEGACY_PROJECTION_STALE');
  }}finally{old.close();}}
  const trusted=process.env.INCEPT_SYNC_TRUSTED_MODE==='1';
  const overrides=readLocalOverrides(),pricing=loadLocalPricingMap(home,overrides);
  // Public trusted projections use committed records only. Do not even invoke
  // the native collectors: ignored results would still scan original logs.
  const cc:Pick<ReturnType<typeof collectCommandCodeEvents>,'events'|'latestMtimeMs'|'errors'>=trusted?{events:[],latestMtimeMs:0,errors:[]}:collectCommandCodeEvents(home,pricing);
  const agents:Pick<ReturnType<typeof collectAiusageAndRawAgentEvents>,'events'|'latestMtimeMs'|'errors'|'fallbackEvents'>=trusted?{events:[],latestMtimeMs:0,errors:[],fallbackEvents:[]}:collectAiusageAndRawAgentEvents(home,pricing);
  const covered=new Set(cc.events.flatMap(r=>r.sourceFile?[normalizeFile(r.sourceFile)]:[]));
  const native=trusted?[]:[...cc.events,...agents.events.filter(r=>r.sourceId!=='commandcode'||!r.sourceFile||!covered.has(normalizeFile(r.sourceFile)))];
  const view=readSyncView(service,native,pricing,overrides.aliases);requireSync(view.dataRevision>=minimumRevision,'REVISION_NOT_VISIBLE');
  // Preserve immutable legacy membership order after exact adoption. The old
  // summarizer deliberately retains first-seen ordering for equal-cost rows.
  // These keys affect display order only, never entity/adoption identity.
  const positions=new Map<string,[number,number]>(),sessionPositions=new Map<string,[number,number]>();
  for(const row of service.db.prepare(`SELECT m.batch_id,b.source_order,m.position,o.source,o.session_id,json_extract(o.record_json,'$.event.eventId') event_id FROM sync_legacy_members m JOIN sync_legacy_batches b ON b.id=m.batch_id JOIN sync_observations o ON o.id=m.observation_id ORDER BY b.source_order,m.position`).iterate()){
    const order:[number,number]=[Number(row.source_order),Number(row.position)];positions.set(JSON.stringify([row.batch_id,row.event_id]),order);const key=JSON.stringify([row.batch_id,row.source,row.session_id]);if(!sessionPositions.has(key))sessionPositions.set(key,order);
  }
  const order=(event:typeof view.events[number],index:number):[number,number]=>event.importBatchId?(positions.get(JSON.stringify([event.importBatchId,event.eventId]))??sessionPositions.get(JSON.stringify([event.importBatchId,event.sourceId,event.sessionId]))??[Number.MAX_SAFE_INTEGER,index]):[0,index];
  const eligible=view.events.map((event,index)=>({event,order:order(event,index)})).sort((a,b)=>a.order[0]-b.order[0]||a.order[1]-b.order[1]).map(r=>r.event).filter(r=>r.timestampMs<=now),first=eligible.map(r=>r.dateKey).sort()[0],window=dateWindow(range,now,first);
  const selected=eligible.filter(r=>r.dateKey>=window.from&&r.dateKey<=window.to).map(applyCommandCodeQuota);
  const lastCommitted=Number(service.db.prepare('SELECT MAX(committed_at) at FROM sync_receipt_clock').get()?.at??0);
  const legacyImported=service.db.prepare("SELECT MAX(json_extract(receipt_json,'$.importedAt')) at FROM sync_legacy_batches WHERE status='active'").get()?.at;
  let updatedAt=lastCommitted||Math.max(view.updatedAt,cc.latestMtimeMs,agents.latestMtimeMs);
  if(!lastCommitted)for(const path of [['.aiusage','config.json'],['.aiusage','cache.db-wal'],['.commandcode','config.json'],['.codex','models_cache.json']])try{updatedAt=Math.max(updatedAt,statSync(join(home,...path)).mtimeMs);}catch{ /* Optional source metadata. */ }
  const data=summarizeUsageEvents(selected,home,view.pricing,updatedAt,window);
  for(const source of data.sources){const modes=new Set(selected.filter(e=>e.sourceId===source.sourceId).map(e=>e.deviceId?'imported' as const:agents.fallbackEvents.includes(e)?'indexed' as const:'native' as const));source.collectionMode=modes.size>1?'mixed':[...modes][0];}
  return {...data,range,checkedAt:new Date(now).toISOString(),collectionIssues:[...view.issues,...(cc.errors.length||agents.errors.length?['NATIVE_COLLECTION_INCOMPLETE']:[])],sync:{readMode:'v2' as const,dataRevision:view.dataRevision,
    ...(lastCommitted?{lastCommittedAt:new Date(lastCommitted).toISOString()}:{}),...(legacyImported?{legacyImportedAt:new Date(String(legacyImported)).toISOString()}:{})}};
}
