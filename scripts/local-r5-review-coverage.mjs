// Review only the two archived legacy batches against the existing private v4 copy.
import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
const directory='C:/Users/86139/AppData/Local/Incept/v4-acceptance-20261019';
assert.equal(resolve(process.env.INCEPT_V4_ACCEPTANCE_DIR??''),resolve(directory));
const candidates=readdirSync(directory).filter(n=>n.startsWith('state-migration-')).map(n=>join(directory,n)).sort((a,b)=>statSync(b).mtimeMs-statSync(a).mtimeMs);
assert(candidates.length>0);const root=candidates[0];
const decisions=JSON.parse(readFileSync(join(root,'archive','legacy-review-decisions.json'),'utf8'));
const {root:preparation}=JSON.parse(readFileSync(join(directory,'real-source-current.json'),'utf8'));
const {hash}=await import(pathToFileURL(join(preparation,'rules.mjs')).href);
const db=new DatabaseSync(join(directory,'v4-baseline.db'),{readOnly:true});db.exec('BEGIN');
const details=[];
try{for(const review of decisions){
 const header=JSON.parse(review.outbox.header_json),scope=header.manifest.scope;
 const scopeId=hash(['sync-scope/2',scope.deviceId,scope.source,scope.sessionId]);
 const head=db.prepare('SELECT head_manifest FROM sync_scopes WHERE scope_id=?').get(scopeId);
 const current=db.prepare('SELECT o.record_json FROM sync_current c JOIN sync_observations o ON o.id=c.observation_id WHERE c.scope_id=? ORDER BY c.position').all(scopeId).map(r=>JSON.parse(r.record_json));
 const records=review.records.map(r=>JSON.parse(r.json));
 const exact=records.map(record=>current.some(next=>isDeepStrictEqual(record,next)));
 const headRow=head?.head_manifest?db.prepare('SELECT header_json FROM sync_manifests WHERE id=?').get(head.head_manifest):null;
 const currentHeader=headRow?JSON.parse(headRow.header_json):null;
 details.push({batch:String(review.outbox.batch),source:scope.source,sessionId:scope.sessionId,reviewCode:review.outbox.error,
  recordCount:records.length,manifestRecordCount:header.manifest.recordCount,scopeFound:!!head,
  exactRecordsMatched:exact.filter(Boolean).length,allRecordsCovered:records.length===header.manifest.recordCount&&exact.every(Boolean),
  basisEqualsV4:!!currentHeader&&isDeepStrictEqual(header.basis,currentHeader.basis),
  reviewManifestEqualsV4:!!currentHeader&&header.manifest.manifestHash===currentHeader.manifest.manifestHash,
  disposition:'pending_owner_review',coverageEvidence:exact.map((matched,index)=>({index,recordHash:hash(records[index]),matched}))});
}}finally{db.close();}
writeFileSync(join(root,'review-coverage-evidence.json'),JSON.stringify(details,null,2),{flag:'wx',mode:0o600});
const summary={checkedAt:new Date().toISOString(),privateEvidenceDirectory:root,reviewCount:details.length,
  recordCount:details.reduce((n,r)=>n+r.recordCount,0),allRecordsCovered:details.every(r=>r.allRecordsCovered),
  readyForProduction:false,ownerDispositionRequired:true,sourceModified:false,historical359Revalidation:false,
  batches:details.map(({batch,sessionId,coverageEvidence,...r})=>({...r,batchHash:hash(batch),sessionHash:hash(sessionId)}))};
writeFileSync('output/state-migration-review-coverage.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
