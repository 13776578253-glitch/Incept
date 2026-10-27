// Copy-only local publication candidate. No HTTP uploads, collectors or production writes.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync,constants} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {backupSqlite} from '../production-sync-backup.mjs';

const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const parse = text => JSON.parse(String(text));
const save = (file,value) => writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
const scopeTables=['sync_origins','sync_scopes','sync_manifests','sync_generations','sync_entities','sync_current','sync_audit'];
const tables=[...scopeTables,'sync_observations','sync_changes','sync_receipts','sync_receipt_clock','sync_admissions'];
const quote = id => '"'+id.replaceAll('"','""')+'"';

export function insertAllowedRows(db,bundles){
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const bundle of bundles)for(const table of tables){
      assert(Array.isArray(bundle.rows[table]),'MISSING_RELATION');
      const columns=db.prepare(`PRAGMA table_info(${quote(table)})`).all().map(row=>row.name);
      const insert=db.prepare(`INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES (${columns.map(()=>'?').join(',')})`);
      for(const row of bundle.rows[table]){
        assert.deepEqual(Object.keys(row).sort(),[...columns].sort(),'COLUMN_SET_CHANGED');
        insert.run(...columns.map(column=>row[column]));
      }
    }
    const revision=db.prepare('SELECT MAX(json_extract(receipt_json,\'$.dataRevision\')) n FROM sync_receipts').get().n;
    db.prepare('UPDATE sync_meta SET data_revision=MAX(data_revision,?) WHERE id=1').run(revision);
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
}

// Executed inside the existing acceptance App as a read-only transaction.
const exportCode=String.raw`
const fs=require('node:fs'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const requested=JSON.parse(fs.readFileSync(0,'utf8')),db=new DatabaseSync('/data/sync/v4.db',{readOnly:true});
db.exec('BEGIN');try{const bundles=requested.map(({id,batch,device})=>{
 const rows={},all=(sql,...args)=>db.prepare(sql).all(...args);
 for(const table of ['sync_origins','sync_scopes','sync_manifests','sync_generations','sync_entities','sync_current','sync_audit'])rows[table]=all('SELECT * FROM '+table+' WHERE scope_id=?',id);
 assert.equal(rows.sync_manifests.length,1);assert.equal(rows.sync_generations.length,1);
 const generation=rows.sync_generations[0];assert.equal(generation.parent_id,null);
 rows.sync_changes=all('SELECT * FROM sync_changes WHERE generation_id=? ORDER BY position',generation.id);
 rows.sync_observations=all('SELECT * FROM sync_observations WHERE id IN (SELECT observation_id FROM sync_current WHERE scope_id=? UNION SELECT observation_id FROM sync_changes WHERE generation_id=?)',id,generation.id);
 rows.sync_receipts=all('SELECT * FROM sync_receipts WHERE device_id=? AND batch_id=?',device,batch);
 rows.sync_receipt_clock=all('SELECT * FROM sync_receipt_clock WHERE device_id=? AND batch_id=?',device,batch);
 const scope=JSON.parse(rows.sync_origins[0].scope_json);
 rows.sync_admissions=all('SELECT * FROM sync_admissions WHERE device_id=? AND source=? AND session_id=?',device,scope.source,scope.sessionId);
 assert.equal(rows.sync_receipts.length,1);assert.equal(rows.sync_receipt_clock.length,1);assert.equal(rows.sync_admissions.length,1);
 assert.equal(all('SELECT 1 FROM sync_reviews WHERE scope_id=?',id).length,0);
 return {id,rows};});console.log(JSON.stringify({bundles,sourceScopeCount:db.prepare('SELECT COUNT(*) n FROM sync_scopes').get().n}));}finally{db.close();}`;

export async function buildCleanCandidate(){
 const privateBase='C:/Users/86139/AppData/Local/Incept/v4-acceptance-20261019';
 const root=join(privateBase,'release-candidate-2026-10-20');
 assert(!existsSync(root),'RELEASE_TARGET_EXISTS');mkdirSync(root,{mode:0o700});
 const {protectDirectory}=await import('../../apps/sync-agent/dist/library.mjs');await protectDirectory(root);
 const {build}=createRequire(new URL('../../packages/dashboard/package.json',import.meta.url))('esbuild');
 const rulesFile=join(root,'release-rules.mjs');
 await build({stdin:{contents:`export {hash} from ${JSON.stringify(resolve('packages/dashboard/src/adapters/local/imports/identity.ts'))};export {validateHeader,validateRecords,qualifyRanges,qualifyRecords,sequenceHash,syncScopeId,syncEntityId} from ${JSON.stringify(resolve('packages/dashboard/src/adapters/local/imports/sync/contract.ts'))};`,resolveDir:process.cwd(),loader:'ts'},outfile:rulesFile,bundle:true,platform:'node',format:'esm',target:'node24'});
 const rules=await import(pathToFileURL(rulesFile).href);
 const baseline=join(privateBase,'v4-baseline.db'),pg=join(privateBase,'production-copy.pgdump');
 const protectedFiles=[baseline,pg,...['sync-agent','sync-agent-v4-prodcheck'].flatMap(name=>['state.db','config.json','credential.dpapi'].map(file=>join(process.env.LOCALAPPDATA,'Incept',name,file)))];
 const before=protectedFiles.map(sha);
 const normal=parse(readFileSync('output/r5-real-usage-final.json')),review=parse(readFileSync('output/r5-auto-review-acceptance.json'));
 assert.equal(normal.verifiedCanaries,'passed');assert.equal(review.status,'passed');
 const expected=[{report:normal,source:'codex',...normal.sourceResults.codex},{report:normal,source:'antigravity',...normal.sourceResults.antigravity},{report:review,source:'codex',sessionHash:review.sessionHash,recordCount:454,tokenIncrease:57624007}];
 for(const item of expected){
  const state=new DatabaseSync(join(item.report.evidenceDirectory,'state','state.db'),{readOnly:true});
  try{const matches=state.prepare('SELECT * FROM lineage').all().filter(row=>{const scope=parse(row.parent_json).header.manifest.scope;return scope.source===item.source&&rules.hash(scope.sessionId)===item.sessionHash;});
   assert.equal(matches.length,1,'EXACT_ACCEPTED_SESSION_REQUIRED');item.stateRow=matches[0];item.parent=parse(matches[0].parent_json);item.receipt=parse(matches[0].receipt_json);
   assert.equal(item.receipt.status,'committed');assert.equal(item.receipt.manifestHash,item.parent.header.manifest.manifestHash);
   const proof=parse(readFileSync(join(item.report.evidenceDirectory,item.report===review?'record-checks.json':item.source+'-record-check.json')));
   assert.deepEqual(proof.receipt,item.receipt);item.recordChecks=proof.checks;
  }finally{state.close();}
 }
 assert.equal(new Set(expected.map(item=>rules.syncScopeId(item.parent.header.manifest.scope))).size,3);
 const req=expected.map(item=>({id:rules.syncScopeId(item.parent.header.manifest.scope),batch:item.receipt.batchId,device:item.parent.header.manifest.scope.deviceId}));
 const result=spawnSync('docker',['exec','-i','incept-v4-acceptance-app-1','node','-e',exportCode],{input:JSON.stringify(req),encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
 assert.equal(result.status,0,'READONLY_ACCEPTED_SCOPE_EXPORT_FAILED');const exported=parse(result.stdout);
 save(join(root,'accepted-real-scope-export.json'),exported);
 const dbFile=join(root,'v4-release.db');await backupSqlite(baseline,dbFile);
 const db=new DatabaseSync(dbFile),base=new DatabaseSync(baseline,{readOnly:true});
 let final,scopeChecks=[];
 try{
  assert.deepEqual({...base.prepare('SELECT COUNT(*) scopes,SUM(token_total) tokens FROM sync_scopes').get()},{scopes:359,tokens:4480530511});
  assert.equal(base.prepare('SELECT COUNT(*) n FROM sync_receipts').get().n,359);
  for(const [index,bundle]of exported.bundles.entries()){
   const item=expected[index],header=rules.validateHeader(parse(bundle.rows.sync_manifests[0].header_json));assert.deepEqual(header,item.parent.header);
   assert.equal(bundle.id,rules.syncScopeId(header.manifest.scope));assert.equal(base.prepare('SELECT 1 FROM sync_scopes WHERE scope_id=?').get(bundle.id),undefined);
   assert.deepEqual(parse(bundle.rows.sync_receipts[0].receipt_json),item.receipt);
   const observations=new Map(bundle.rows.sync_observations.map(row=>[row.id,parse(row.record_json)]));
   const records=[...bundle.rows.sync_current].sort((a,b)=>a.position-b.position).map((row,index)=>{assert.equal(row.position,index);const record=observations.get(row.observation_id);assert(record);assert.equal(rules.hash(record),row.observation_id);assert.equal(rules.syncEntityId(header.manifest.scope,record),row.entity_id);return record;});
   assert.equal(records.length,item.recordCount);assert.equal(rules.sequenceHash(records),header.manifest.sequenceHash);
   assert.equal(rules.qualifyRecords([],records,header.manifest),item.tokenIncrease);rules.qualifyRanges(undefined,header.manifest);
   assert.equal(records.length,item.recordChecks.length);
   records.forEach((record,i)=>assert.equal(rules.hash(record),item.recordChecks[i].recordHash??item.recordChecks[i].hash));
   assert.equal(item.receipt.payloadHash,rules.hash(header));
  }
  insertAllowedRows(db,exported.bundles);
  // Preserve every baseline row byte-for-byte. No table from acceptance is copied wholesale.
  for(const {name}of base.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()){
   if(name==='sync_meta')continue;
   const columns=base.prepare(`PRAGMA table_info(${quote(name)})`).all(),keys=columns.filter(row=>row.pk).sort((a,b)=>a.pk-b.pk).map(row=>row.name);
   assert(keys.length>0);const find=db.prepare(`SELECT * FROM ${quote(name)} WHERE ${keys.map(key=>quote(key)+'=?').join(' AND ')}`);
   for(const row of base.prepare(`SELECT * FROM ${quote(name)}`).iterate())assert.deepEqual(find.get(...keys.map(key=>row[key])),row,'BASELINE_ROW_CHANGED');
   const added=exported.bundles.reduce((sum,bundle)=>sum+(bundle.rows[name]?.length??0),0);
   assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${quote(name)}`).get().n,base.prepare(`SELECT COUNT(*) n FROM ${quote(name)}`).get().n+added,'UNALLOWLISTED_ROW');
  }
  const states=new DatabaseSync(join(process.env.LOCALAPPDATA,'Incept','sync-agent-v4-prodcheck','state.db'),{readOnly:true});
  const baselineParents=new Map();try{for(const row of states.prepare('SELECT parent_json,receipt_json FROM lineage').iterate()){const parent=parse(row.parent_json);baselineParents.set(rules.syncScopeId(parent.header.manifest.scope),{header:parent.header,receipt:parse(row.receipt_json)});}}finally{states.close();}
  for(const scope of db.prepare('SELECT * FROM sync_scopes ORDER BY scope_id').iterate()){
   const origin=parse(db.prepare('SELECT scope_json FROM sync_origins WHERE scope_id=?').get(scope.scope_id).scope_json);
   assert.equal(rules.syncScopeId(origin),scope.scope_id);assert.equal(origin.deviceId,req[0].device);
   const header=rules.validateHeader(parse(db.prepare('SELECT header_json FROM sync_manifests WHERE id=?').get(scope.head_manifest).header_json));
   assert.deepEqual(header.manifest.scope,origin);assert.equal(header.manifest.generationId,scope.head_generation);assert.equal(scope.visible_generation,scope.head_generation);assert.equal(scope.fenced,0);
   const records=db.prepare('SELECT c.position,c.entity_id,o.* FROM sync_current c JOIN sync_observations o ON o.id=c.observation_id WHERE c.scope_id=? ORDER BY c.position').all(scope.scope_id).map((row,index)=>{assert.equal(row.position,index);const record=parse(row.record_json);assert.equal(rules.hash(record),row.id);assert.equal(rules.syncEntityId(origin,record),row.entity_id);return record;});
   // Bound pages by both records and bytes, matching the service contract.
   let page=[],bytes=2;for(const record of records){const size=Buffer.byteLength(JSON.stringify(record))+1;if(page.length&&(page.length>=500||bytes+size>512*1024)){rules.validateRecords(page,header);page=[];bytes=2;}page.push(record);bytes+=size;}if(page.length)rules.validateRecords(page,header);
   assert.equal(rules.sequenceHash(records),header.manifest.sequenceHash);assert.equal(rules.qualifyRecords([],records,header.manifest),scope.token_total);
   const receipt=parse(db.prepare('SELECT receipt_json FROM sync_receipts WHERE device_id=? AND batch_id=?').get(origin.deviceId,header.batchId).receipt_json);
   assert.equal(receipt.status,'committed');assert.equal(receipt.manifestHash,scope.head_manifest);assert.equal(receipt.generationId,scope.head_generation);assert.equal(receipt.payloadHash,rules.hash(header));
   const known=baselineParents.get(scope.scope_id)??expected.find(item=>rules.syncScopeId(item.parent.header.manifest.scope)===scope.scope_id);
   assert(known,'UNAPPROVED_SCOPE');assert.deepEqual(receipt,known.receipt);assert.deepEqual(header,known.header??known.parent.header);
   scopeChecks.push({scopeHash:scope.scope_id,records:records.length,tokens:scope.token_total,receiptMatched:true,identityMatched:true});
  }
  final={...db.prepare('SELECT COUNT(*) scopes,SUM(token_total) tokens FROM sync_scopes').get(),receipts:db.prepare('SELECT COUNT(*) n FROM sync_receipts').get().n,revision:db.prepare('SELECT data_revision FROM sync_meta').get().data_revision};
  assert.deepEqual(final,{scopes:362,tokens:4558021501,receipts:362,revision:387});
  for(const table of ['sync_reviews','sync_staging','sync_stage_pages','sync_stage_records'])assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;');
 }finally{db.close();base.close();}
 // Keep the untouched original PostgreSQL copy, never the test-auth acceptance PG.
 copyFileSync(pg,join(root,'production-copy.pgdump'),constants.COPYFILE_EXCL);
 const priorMigration=parse(readFileSync('output/state-migration-review-coverage.json')).privateEvidenceDirectory;
 const agentDir=join(root,'agent-state');mkdirSync(agentDir,{mode:0o700});
 await backupSqlite(join(priorMigration,'candidate','state.db'),join(agentDir,'state.db'));
 const state=new DatabaseSync(join(agentDir,'state.db'));
 try{state.exec('BEGIN IMMEDIATE');for(const item of expected){const row=item.stateRow;state.prepare('INSERT INTO lineage VALUES(?,?,?,?)').run(row.scope,row.parent_json,row.signature,row.receipt_json);state.prepare('INSERT INTO receipts VALUES(?,?)').run(item.receipt.batchId,JSON.stringify(item.receipt));state.prepare('INSERT INTO lineage_tokens VALUES(?,?)').run(row.scope,item.tokenIncrease);}
  for(const row of scopeChecks){const origin=exported.bundles.find(bundle=>bundle.id===row.scopeHash)?.rows.sync_origins[0];void origin;}
  assert.equal(state.prepare('SELECT COUNT(*) n FROM lineage').get().n,362);assert.equal(state.prepare('SELECT COUNT(*) n FROM receipts').get().n,362);assert.equal(state.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);state.exec('COMMIT; PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;');
 }catch(error){state.exec('ROLLBACK');throw error;}finally{state.close();}
 const candidateConfig=parse(readFileSync(join(priorMigration,'candidate','config.json')));candidateConfig.home=join(root,'empty-home');mkdirSync(candidateConfig.home,{mode:0o700});candidateConfig.remote=false;candidateConfig.allowIncomplete=false;save(join(agentDir,'config.json'),candidateConfig);
 // No test token or formal DPAPI credential is packaged into the publication state.
 assert.deepEqual(protectedFiles.map(sha),before,'PROTECTED_INPUT_CHANGED');
 save(join(root,'scope-checks.json'),scopeChecks);
 const report={status:'passed',candidateDirectory:root,final,baseline:{scopes:359,receipts:359,tokens:4480530511,sha256:before[0]},realIncrement:{scopes:3,records:641,tokens:77490990},excludedAcceptanceScopes:exported.sourceScopeCount-362,syntheticRowsImported:0,baselineRowsUnchanged:true,protectedInputsUnchanged:true,receiptRevisionsPreserved:true,revisionGapReason:'Original real receipts retain acceptance revision385-387; synthetic scope data excluded',agentState:{scopes:362,receipts:362,credentialsIncluded:false,enabled:false},postgresql:'unchanged pre-acceptance production-copy.pgdump; test-auth PG not used',files:['v4-release.db','production-copy.pgdump','agent-state/state.db','agent-state/config.json','release-rules.mjs','accepted-real-scope-export.json','scope-checks.json'].map(file=>({file,sha256:sha(join(root,file))})),productionModified:false,formalAgentStarted:false,releaseDecision:'NO-GO',completedAt:new Date().toISOString()};
 save(join(root,'candidate-report.json'),report);save('output/release-clean-candidate-2026-10-20.json',report);console.log(JSON.stringify({status:report.status,final,excludedAcceptanceScopes:report.excludedAcceptanceScopes}));
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)buildCleanCandidate().catch(error=>{console.error(error);process.exitCode=1;});
