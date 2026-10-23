import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {validateSyncConfiguration,validateAuthoritativeLedgerGate,advanceLedgerWatermark,generateLedgerWatermark} from './sync-config.mjs';
test('sync defaults are disabled/v1 and activation requires a separate database and exactly one canary',()=>{
  assert.doesNotThrow(()=>validateSyncConfiguration({}));
  assert.throws(()=>validateSyncConfiguration({INCEPT_SYNC_REMOTE_ENABLED:'1'}),/CONFLICT/);
  const env={INCEPT_SYNC_ENABLED:'1',INCEPT_SYNC_DATABASE_FILE:process.cwd()+'/v2.db',INCEPT_DASHBOARD_IMPORTS_FILE:process.cwd()+'/v1.db'};
  assert.throws(()=>validateSyncConfiguration(env),/CANARY/);
  assert.doesNotThrow(()=>validateSyncConfiguration({...env,INCEPT_SYNC_DEVICE_ALLOWLIST:'00000000-0000-4000-8000-000000000001'}));
  assert.throws(()=>validateSyncConfiguration({...env,INCEPT_SYNC_DATABASE_FILE:env.INCEPT_DASHBOARD_IMPORTS_FILE}),/DISTINCT/);
  assert.throws(()=>validateSyncConfiguration({...env,INCEPT_SYNC_READ_MODE:'other'}),/READ_MODE/);
});
test('remote activation requires an injected secret file and the private Gateway identity',()=>{
  const directory=mkdtempSync(join(tmpdir(),'incept-sync-config-'));
  try{
    const secret=join(directory,'sync-rpc.key');writeFileSync(secret,'a'.repeat(63)+'b',{mode:0o600});
    const env={INCEPT_SYNC_ENABLED:'1',INCEPT_SYNC_REMOTE_ENABLED:'1',INCEPT_SYNC_DATABASE_FILE:join(directory,'v2.db'),
      INCEPT_DASHBOARD_IMPORTS_FILE:join(directory,'v1.db'),INCEPT_SYNC_DEVICE_ALLOWLIST:'00000000-0000-4000-8000-000000000001',
      INCEPT_SYNC_RPC_KEY_FILE:secret,INCEPT_SYNC_GATEWAY_INTERNAL_URL:'http://sync-gateway:3101'};
    assert.doesNotThrow(()=>validateSyncConfiguration(env));
    assert.throws(()=>validateSyncConfiguration({...env,INCEPT_SYNC_RPC_KEY_FILE:undefined}),/SECRET_FILE/);
    assert.throws(()=>validateSyncConfiguration({...env,INCEPT_SYNC_GATEWAY_INTERNAL_URL:'https://public.example'}),/INTERNAL_GATEWAY/);
    assert.throws(()=>validateSyncConfiguration({...env,INCEPT_SYNC_DEVICE_ALLOWLIST:'a,b'}),/CANARY/);
  }finally{rmSync(directory,{recursive:true,force:true});}
});


test('authoritative ledger gate asserts physical identity, watermark, anchor and baselines before startup',()=>{
  const directory=mkdtempSync(join(tmpdir(),'incept-ledger-gate-'));
  try{
    const dbPath=join(directory,'v4.db');
    const watermarkPath=join(directory,'ledger-watermark.json');
    const anchorId='b4efa79f-8ac3-41b2-8d99-cecceb5ca20c';
    const anchorHash='29e9ce198ff7c1273cdb83e9b6883472b0a5fdbf3ac98aa0993e50c3d996583c';

    // 1. Gate no-ops when sync is disabled
    assert.doesNotThrow(()=>validateAuthoritativeLedgerGate({INCEPT_SYNC_ENABLED:'0'}));

    // 2. Gate fails when watermark is missing
    const env={INCEPT_SYNC_ENABLED:'1',INCEPT_SYNC_DATABASE_FILE:dbPath};
    assert.throws(()=>validateAuthoritativeLedgerGate(env),/EXTERNAL_WATERMARK_MISSING/);

    // Write base watermark
    const watermark={
      canonicalLedger:'v4.db',
      minRevision:597,
      anchorBatchId:anchorId,
      anchorPayloadHash:anchorHash,
      minScopes:1,
      minTokens:100,
      minVisibleRecords:1
    };
    writeFileSync(watermarkPath,JSON.stringify(watermark));

    // 3. Gate fails if canonical name does not match
    assert.throws(()=>validateAuthoritativeLedgerGate({...env,INCEPT_SYNC_DATABASE_FILE:join(directory,'v2.db')}),/CANONICAL_LEDGER_MISMATCH/);

    // 4. Gate fails if DB file does not exist
    assert.throws(()=>validateAuthoritativeLedgerGate(env),/LEDGER_DATABASE_NOT_FOUND/);

    // Initialize test SQLite DB
    let db=new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE sync_meta (id INTEGER PRIMARY KEY, data_revision INTEGER NOT NULL);
      CREATE TABLE sync_receipts (batch_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL);
      CREATE TABLE sync_scopes (scope_id TEXT PRIMARY KEY, token_total INTEGER NOT NULL);
      CREATE TABLE sync_current (scope_id TEXT, observation_id TEXT);
      INSERT INTO sync_meta VALUES(1, 46);
    `);
    db.close();

    // 5. Gate fails if revision < watermark (e.g. rev 46)
    assert.throws(()=>validateAuthoritativeLedgerGate(env),/REVISION_BELOW_WATERMARK/);

    // Update revision to 597, but omit anchor receipt
    db=new DatabaseSync(dbPath);
    db.exec("UPDATE sync_meta SET data_revision = 597 WHERE id = 1");
    db.close();
    assert.throws(()=>validateAuthoritativeLedgerGate(env),/ANCHOR_RECEIPT_MISSING/);

    // Insert fake anchor receipt with wrong hash
    db=new DatabaseSync(dbPath);
    db.prepare("INSERT INTO sync_receipts VALUES(?, ?)").run(anchorId, "wrong_hash");
    db.close();
    assert.throws(()=>validateAuthoritativeLedgerGate(env),/ANCHOR_PAYLOAD_HASH_MISMATCH/);

    // Update to correct anchor hash, but omit scopes/tokens/records
    db=new DatabaseSync(dbPath);
    db.prepare("UPDATE sync_receipts SET payload_hash = ? WHERE batch_id = ?").run(anchorHash, anchorId);
    db.close();
    assert.throws(()=>validateAuthoritativeLedgerGate(env),/SCOPES_BELOW_BASELINE/);

    // Populate valid baseline metrics
    db=new DatabaseSync(dbPath);
    db.exec("INSERT INTO sync_scopes VALUES('scope-1', 150)");
    db.exec("INSERT INTO sync_current VALUES('scope-1', 'obs-1')");
    db.close();

    // 6. Gate passes fully
    assert.doesNotThrow(()=>validateAuthoritativeLedgerGate(env));
  }finally{
    rmSync(directory,{recursive:true,force:true});
  }
});

test('advanceLedgerWatermark enforces monotonic progression and rejects metric regression',()=>{
  const directory=mkdtempSync(join(tmpdir(),'incept-watermark-advance-'));
  try{
    const dbPath=join(directory,'v4.db');
    const watermarkPath=join(directory,'ledger-watermark.json');
    const initialWatermark={
      canonicalLedger:'v4.db',
      minRevision:597,
      anchorBatchId:'b4efa79f-8ac3-41b2-8d99-cecceb5ca20c',
      anchorPayloadHash:'29e9ce198ff7c1273cdb83e9b6883472b0a5fdbf3ac98aa0993e50c3d996583c',
      minScopes:477,
      minTokens:1000,
      minVisibleRecords:100
    };
    writeFileSync(watermarkPath,JSON.stringify(initialWatermark));

    const db=new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE sync_meta (id INTEGER PRIMARY KEY, data_revision INTEGER NOT NULL);
      CREATE TABLE sync_receipts (batch_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL);
      CREATE TABLE sync_scopes (scope_id TEXT PRIMARY KEY, token_total INTEGER NOT NULL);
      CREATE TABLE sync_current (scope_id TEXT, observation_id TEXT);
      INSERT INTO sync_meta VALUES(1, 596);
      INSERT INTO sync_scopes VALUES('s1', 999);
      INSERT INTO sync_current VALUES('s1', 'o1');
    `);
    db.close();

    // 1. Rejects regression when revision < 597
    assert.throws(()=>advanceLedgerWatermark(dbPath,watermarkPath),/WATERMARK_REGRESSION_REJECTED/);

    // 2. Advance revision to 605 and metrics
    const db2=new DatabaseSync(dbPath);
    db2.exec("UPDATE sync_meta SET data_revision = 605 WHERE id = 1");
    db2.exec("UPDATE sync_scopes SET token_total = 5000 WHERE scope_id = 's1'");
    for(let i=2;i<=478;i++) db2.exec(`INSERT INTO sync_scopes VALUES('s${i}', 10)`);
    for(let i=2;i<=150;i++) db2.exec(`INSERT INTO sync_current VALUES('s1', 'o${i}')`);
    db2.close();

    // 3. Advancing watermark succeeds and updates numbers monotonically
    const updated=advanceLedgerWatermark(dbPath,watermarkPath);
    assert.equal(updated.minRevision,605);
    assert.equal(updated.minScopes,478);
    assert.equal(updated.minTokens,9770);
    assert.equal(updated.minVisibleRecords,150);

    // 4. Gate validates against updated watermark
    const env={INCEPT_SYNC_ENABLED:'1',INCEPT_SYNC_DATABASE_FILE:dbPath};
    const db3=new DatabaseSync(dbPath);
    db3.prepare("INSERT INTO sync_receipts VALUES(?, ?)").run(initialWatermark.anchorBatchId,initialWatermark.anchorPayloadHash);
    db3.close();
    assert.doesNotThrow(()=>validateAuthoritativeLedgerGate(env));
  }finally{
    rmSync(directory,{recursive:true,force:true});
  }
});

test('generateLedgerWatermark inspects database, creates watermark and passes gate validation',()=>{
  const directory=mkdtempSync(join(tmpdir(),'incept-watermark-gen-'));
  try{
    const dbPath=join(directory,'v4.db');
    const watermarkPath=join(directory,'ledger-watermark.json');
    const db=new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE sync_meta (id INTEGER PRIMARY KEY, data_revision INTEGER NOT NULL);
      CREATE TABLE sync_receipts (batch_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL);
      CREATE TABLE sync_scopes (scope_id TEXT PRIMARY KEY, token_total INTEGER NOT NULL);
      CREATE TABLE sync_current (scope_id TEXT, observation_id TEXT);
      INSERT INTO sync_meta VALUES(1, 387);
      INSERT INTO sync_receipts VALUES('batch-100', 'hash-100');
      INSERT INTO sync_scopes VALUES('scope-100', 5000000);
      INSERT INTO sync_current VALUES('scope-100', 'obs-100');
    `);
    db.close();

    const created=generateLedgerWatermark(dbPath,watermarkPath);
    assert.equal(created.canonicalLedger,'v4.db');
    assert.equal(created.minRevision,387);
    assert.equal(created.anchorBatchId,'batch-100');
    assert.equal(created.anchorPayloadHash,'hash-100');
    assert.equal(created.minScopes,1);
    assert.equal(created.minTokens,5000000);
    assert.equal(created.minVisibleRecords,1);

    const env={INCEPT_SYNC_ENABLED:'1',INCEPT_SYNC_DATABASE_FILE:dbPath};
    assert.doesNotThrow(()=>validateAuthoritativeLedgerGate(env));
  }finally{
    rmSync(directory,{recursive:true,force:true});
  }
});
