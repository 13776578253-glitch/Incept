import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { backupSqlite } from './production-sync-backup.mjs';

test('sync SQLite backup uses a consistent copy and refuses overwrite',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'incept-sync-backup-'));
  try{
    const source=join(directory,'imports.db'),out=join(directory,'backup.db');
    const db=new DatabaseSync(source);
    try{db.exec("PRAGMA journal_mode=WAL;CREATE TABLE batches(id TEXT PRIMARY KEY,payload TEXT);INSERT INTO batches VALUES('b','synthetic')");}
    finally{db.close();}
    const result=await backupSqlite(source,out);
    assert.equal(result.integrity,'ok');assert.match(result.sha256,/^[a-f0-9]{64}$/);
    const copy=new DatabaseSync(out,{readOnly:true});
    try{assert.equal(copy.prepare('SELECT payload FROM batches').get().payload,'synthetic');}
    finally{copy.close();}
    await assert.rejects(()=>backupSqlite(source,out),/OUTPUT_EXISTS/);
  } finally {rmSync(directory,{recursive:true,force:true});}
});
