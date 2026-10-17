import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {syncStage} from './sync-stage.mjs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
test('rollout dry run preserves existing secrets; apply requires Owner and v2 requires a fresh exact comparison',()=>{
  const dir=mkdtempSync(join(tmpdir(),'phase5-stage-')),envFile=join(dir,'env');writeFileSync(envFile,'EXISTING_SECRET=synthetic-private\n');
  try{
    const options={envFile,stage:'upload',device:'00000000-0000-4000-8000-000000000005'};
    assert.equal(syncStage(options).applied,false);assert.equal(readFileSync(envFile,'utf8'),'EXISTING_SECRET=synthetic-private\n');
    assert.throws(()=>syncStage({...options,apply:true}),/OWNER/);
    syncStage({...options,apply:true,ownerConfirmed:true});assert.match(readFileSync(envFile,'utf8'),/INCEPT_SYNC_READ_MODE=v1/);assert.match(readFileSync(envFile,'utf8'),/EXISTING_SECRET=synthetic-private/);
    assert.throws(()=>syncStage({...options,stage:'v2'}),/COMPARISON/);
    syncStage({envFile,stage:'disabled',apply:true,ownerConfirmed:true});assert.match(readFileSync(envFile,'utf8'),/INCEPT_SYNC_ENABLED=0/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('v2 gate accepts a fresh zero-difference report and refuses later v1 rollback or v2 commits',()=>{
  const dir=mkdtempSync(join(tmpdir(),'phase5-v2-gate-')),envFile=join(dir,'env'),v1=join(dir,'v1.db'),v2=join(dir,'v2.db'),report=join(dir,'report.json');
  writeFileSync(envFile,`INCEPT_SYNC_READ_MODE=shadow\nINCEPT_DASHBOARD_IMPORTS_FILE=${v1}\nINCEPT_SYNC_DATABASE_FILE=${v2}\n`);
  const a=new DatabaseSync(v1),b=new DatabaseSync(v2);a.exec(`CREATE TABLE batches(id TEXT,checksum TEXT,receipt TEXT);INSERT INTO batches VALUES('b','checksum','{"status":"committed"}')`);b.exec('CREATE TABLE sync_meta(data_revision INTEGER);INSERT INTO sync_meta VALUES(7)');
  const v1StateHash=createHash('sha256').update(JSON.stringify([['b','checksum','committed']])).digest('hex');
  writeFileSync(report,JSON.stringify({ok:true,revision:7,v1StateHash,generatedAt:new Date().toISOString(),ranges:['7d','30d','all'].map(range=>({range,equal:true,difference:null}))}));
  const options={envFile,stage:'v2',device:'00000000-0000-4000-8000-000000000005',report,v1,v2};
  try{
    assert.equal(syncStage(options).readMode,'v2');
    const correct=readFileSync(envFile,'utf8');writeFileSync(envFile,correct.replace(v2,join(dir,'different-v2.db')));assert.throws(()=>syncStage(options),/ENV_COMPARISON_PATH_MISMATCH/);writeFileSync(envFile,correct);
    b.exec('UPDATE sync_meta SET data_revision=8');assert.throws(()=>syncStage(options),/STALE/);b.exec('UPDATE sync_meta SET data_revision=7');a.exec(`UPDATE batches SET receipt='{"status":"rolled-back"}'`);assert.throws(()=>syncStage(options),/STALE/);
  }
  finally{a.close();b.close();rmSync(dir,{recursive:true,force:true});}
});
