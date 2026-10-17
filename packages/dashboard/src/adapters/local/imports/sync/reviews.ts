import type { DatabaseSync } from 'node:sqlite';
import type { SyncScope } from '../../../../domain/sync';
import { hash } from '../identity';

export type ReviewSummary = {
  id: number|string;
  source: string;
  sessionSummary: string;
  code: string;
  createdAt: string;
  oldDataRetained: boolean;
  nextStep: 'OWNER_MAINTENANCE_REVIEW';
};

export function listReviewSummaries(db: DatabaseSync, limit = 100): ReviewSummary[] {
  const capped = Math.max(1, Math.min(500, Math.trunc(limit)));
  const reviews:ReviewSummary[]=db.prepare(`SELECT r.id,r.code,r.created_at,r.header_json,s.visible_generation
    FROM sync_reviews r
    LEFT JOIN sync_scopes s ON s.scope_id=r.scope_id
    LEFT JOIN sync_review_resolutions done ON done.review_id=r.id
    WHERE done.review_id IS NULL
    ORDER BY r.id DESC LIMIT ?`).all(capped).map(row => {
    const scope = JSON.parse(String(row.header_json)) as { manifest: { scope: SyncScope } };
    const legacy = db.prepare(`SELECT 1 FROM sync_legacy_members m JOIN sync_observations o ON o.id=m.observation_id
      JOIN sync_legacy_batches b ON b.id=m.batch_id WHERE json_extract(b.metadata_json,'$.device.id')=?
      AND o.source=? AND o.session_id=? LIMIT 1`).get(scope.manifest.scope.deviceId,scope.manifest.scope.source,scope.manifest.scope.sessionId);
    return {
      id: Number(row.id),
      source: scope.manifest.scope.source,
      sessionSummary: hash([scope.manifest.scope.source, scope.manifest.scope.sessionId]).slice(0, 12),
      code: String(row.code),
      createdAt: new Date(Number(row.created_at)).toISOString(),
      oldDataRetained: !!row.visible_generation||!!legacy,
      nextStep: 'OWNER_MAINTENANCE_REVIEW',
    };
  });
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sync_admission_reviews'").get()){
    for(const row of db.prepare(`SELECT r.* FROM sync_admission_reviews r WHERE NOT EXISTS(SELECT 1 FROM sync_origins o JOIN sync_scopes s ON s.scope_id=o.scope_id WHERE json_extract(o.scope_json,'$.deviceId')=r.device_id AND json_extract(o.scope_json,'$.source')=r.source AND json_extract(o.scope_json,'$.sessionId')=r.session_id AND s.visible_generation IS NOT NULL) ORDER BY created_at DESC LIMIT ?`).all(capped)){
      const sessionSummary=hash([row.source,row.session_id]).slice(0,12);
      if(!reviews.some(r=>r.source===row.source&&r.sessionSummary===sessionSummary))reviews.push({id:'admission:'+String(row.id).slice(0,12),source:String(row.source),sessionSummary,code:String(row.code),createdAt:new Date(Number(row.created_at)).toISOString(),oldDataRetained:true,nextStep:'OWNER_MAINTENANCE_REVIEW'});
    }
  }
  return reviews.slice(0,capped);
}
