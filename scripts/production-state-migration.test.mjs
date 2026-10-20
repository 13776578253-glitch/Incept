import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {rehearseStateMigration} from './local-r5-state-migration-rehearsal.mjs';

function fixture(){
  const root=mkdtempSync(join(tmpdir(),'incept-migration-'));
  const formalDirectory=join(root,'formal'),v4Directory=join(root,'v4'),acceptanceDirectory=join(root,'acceptance');
  for(const path of [formalDirectory,v4Directory,acceptanceDirectory])mkdirSync(path);
  const receipt={batchId:'same-batch',status:'committed',payloadHash:'same-payload'};
  for(const [path,manifest] of [[formalDirectory,'old-head'],[v4Directory,'accepted-head']]){
    const db=new DatabaseSync(join(path,'state.db'));
    db.exec(`CREATE TABLE lineage(scope TEXT PRIMARY KEY,parent_json TEXT,signature TEXT,receipt_json TEXT);
      CREATE TABLE receipts(batch TEXT PRIMARY KEY,json TEXT);CREATE TABLE outbox(serial INTEGER PRIMARY KEY,batch TEXT,scope TEXT,state TEXT,header_json TEXT,error TEXT);
      CREATE TABLE records(batch TEXT,position INTEGER,json TEXT);CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE commands(id TEXT PRIMARY KEY,kind TEXT,state TEXT,at INTEGER);
      CREATE TABLE remote_jobs(id TEXT PRIMARY KEY,expires_at INTEGER,state TEXT,cursor INTEGER,result_json TEXT,attempts INTEGER,next_retry INTEGER);`);
    db.prepare('INSERT INTO commands VALUES(?,?,?,?)').run('stale-sync','sync','pending',1);
    db.prepare('INSERT INTO remote_jobs VALUES(?,?,?,?,?,?,?)').run('stale-remote-job',9999999999999,'pending',0,null,1,0);
    const parent={header:{manifest:{scope:{deviceId:'test-device',source:'codex',sessionId:'ordinary'},manifestHash:manifest,generationId:'gen'}},proofs:[{range:{root:'proof'}}]};
    db.prepare('INSERT INTO lineage VALUES(?,?,?,?)').run('scope',JSON.stringify(parent),'signature',JSON.stringify(receipt));
    db.prepare('INSERT INTO receipts VALUES(?,?)').run('same-batch',JSON.stringify(receipt));
    if(path===formalDirectory){db.prepare('INSERT INTO outbox VALUES(?,?,?,?,?,?)').run(1,'review-batch','scope','review','original-header','V1_ADOPTION_REVIEW_REQUIRED');
      db.prepare('INSERT INTO records VALUES(?,?,?)').run('review-batch',0,'{"event":"unchanged legacy evidence"}');}
    db.close();writeFileSync(join(path,'config.json'),JSON.stringify({deviceId:'test-device',endpoint:'https://production.invalid'}));
    writeFileSync(join(path,'credential.dpapi'),Buffer.from([0,11,255,31]));writeFileSync(join(path,'agent.log'),'opaque log\n');
  }
  writeFileSync(join(acceptanceDirectory,'config.json'),JSON.stringify({deviceId:'test-device',endpoint:'http://127.0.0.1:3305',remote:false,allowLoopbackHttp:true}));
  writeFileSync(join(acceptanceDirectory,'token.txt'),'independent-test-token');
  const hooks={protectDirectory(){},initializeState(path){const db=new DatabaseSync(join(path,'state.db'));return {db,set(key,value){db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run(key,JSON.stringify(value));},close(){db.close();}};},
    storeToken(path,token){assert.equal(token,'independent-test-token');writeFileSync(join(path,'credential.dpapi'),'test-dpapi-opaque');}};
  return {root,formalDirectory,v4Directory,acceptanceDirectory,targetDirectory:join(acceptanceDirectory,'state-migration-test'),hooks,
    cleanup(){rmSync(root,{recursive:true,force:true});}};
}
test('preserves complete old review and opaque files while retaining accepted v4 active head',async()=>{
  const f=fixture();try{
    const result=await rehearseStateMigration({...f,expectedLegacyScopes:1,expectedReviews:1});
    assert.equal(result.summary.status,'prepared_pending_review');assert.equal(result.summary.readyForProduction,false);
    assert.equal(result.summary.archivedReviewRecords,1);assert.equal(result.summary.sourceFilesUnchanged,true);
    const archive=join(f.targetDirectory,'archive','formal');
    for(const name of ['config.json','credential.dpapi','agent.log'])assert.deepEqual(readFileSync(join(archive,name)),readFileSync(join(f.formalDirectory,name)));
    const review=JSON.parse(readFileSync(join(f.targetDirectory,'archive','legacy-review-decisions.json')))[0];
    assert.equal(review.disposition,'pending_owner_review');assert.equal(review.records[0].json,'{"event":"unchanged legacy evidence"}');assert.equal(review.outbox.header_json,'original-header');
    const db=new DatabaseSync(join(f.targetDirectory,'candidate','state.db'),{readOnly:true});
    try{assert.equal(db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);assert.equal(JSON.parse(db.prepare('SELECT parent_json FROM lineage').get().parent_json).header.manifest.manifestHash,'accepted-head');
      assert.equal(db.prepare('SELECT COUNT(*) n FROM commands').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM remote_jobs').get().n,0);
    }finally{db.close();}
    for(const path of [f.formalDirectory,f.v4Directory,join(f.targetDirectory,'archive','formal'),join(f.targetDirectory,'archive','v4')]){
      const retained=new DatabaseSync(join(path,'state.db'),{readOnly:true});try{
        assert.deepEqual({...retained.prepare('SELECT * FROM commands').get()},{id:'stale-sync',kind:'sync',state:'pending',at:1});
        assert.deepEqual({...retained.prepare('SELECT * FROM remote_jobs').get()},{id:'stale-remote-job',expires_at:9999999999999,state:'pending',cursor:0,result_json:null,attempts:1,next_retry:0});
      }finally{retained.close();}
    }
    const config=JSON.parse(readFileSync(join(f.targetDirectory,'candidate','config.json')));assert.equal(config.remote,false);assert.equal(config.allowIncomplete,false);
    assert(existsSync(config.home));assert.equal(JSON.parse(readFileSync(join(f.targetDirectory,'archive','legacy-head-decisions.json')))[0].forwardMovementProven,false);
  }finally{f.cleanup();}
});
test('refuses repeat execution and never overwrites an existing target',async()=>{const f=fixture();try{await rehearseStateMigration(f);await assert.rejects(()=>rehearseStateMigration(f),/TARGET_EXISTS/);}finally{f.cleanup();}});
test('rejects targets overlapping either original state',async()=>{const f=fixture();try{await assert.rejects(()=>rehearseStateMigration({...f,targetDirectory:join(f.formalDirectory,'child')}),/TARGET_SOURCE_OVERLAP/);assert(!existsSync(join(f.formalDirectory,'child')));}finally{f.cleanup();}});
test('different receipt payload blocks candidate and preserves conflict evidence',async()=>{const f=fixture();try{
  const db=new DatabaseSync(join(f.v4Directory,'state.db'));db.prepare('UPDATE receipts SET json=?').run(JSON.stringify({batchId:'same-batch',payloadHash:'different'}));db.close();
  const {summary}=await rehearseStateMigration(f);assert.equal(summary.status,'blocked');assert.equal(summary.receiptConflicts,1);assert.equal(summary.readyForProduction,false);assert(!existsSync(join(f.targetDirectory,'candidate')));
  assert.equal(JSON.parse(readFileSync(join(f.targetDirectory,'archive','receipt-collisions.json'))).length,1);
}finally{f.cleanup();}});
test('rejects a production endpoint before writing any target',async()=>{const f=fixture();try{
  writeFileSync(join(f.acceptanceDirectory,'config.json'),JSON.stringify({deviceId:'test-device',endpoint:'https://production.invalid',remote:false}));
  await assert.rejects(()=>rehearseStateMigration(f),/LOOPBACK_ENDPOINT_REQUIRED/);assert(!existsSync(f.targetDirectory));
}finally{f.cleanup();}});
test('D-drive summary contains counts and dispositions without scope IDs or secrets',async()=>{const f=fixture();try{
  const summaryFile=join(f.root,'summary.json');await rehearseStateMigration({...f,summaryFile});const text=readFileSync(summaryFile,'utf8');
  for(const privateValue of ['test-device','ordinary','review-batch','independent-test-token','old-head','original-header'])assert(!text.includes(privateValue));
  assert.equal(JSON.parse(text).historical359Revalidation,false);
}finally{f.cleanup();}});
test('rejects summary output inside original state and differing device identity',async()=>{const f=fixture();try{
  await assert.rejects(()=>rehearseStateMigration({...f,summaryFile:join(f.formalDirectory,'new-summary.json')}),/SUMMARY_SOURCE_OVERLAP/);
  assert(!existsSync(f.targetDirectory));
  writeFileSync(join(f.v4Directory,'config.json'),JSON.stringify({deviceId:'different-device'}));
  await assert.rejects(()=>rehearseStateMigration(f),/DEVICE_ID_MISMATCH/);assert(!existsSync(f.targetDirectory));
}finally{f.cleanup();}});
