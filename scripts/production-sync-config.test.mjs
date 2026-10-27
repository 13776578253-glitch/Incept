import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {validateSyncConfiguration,validateAuthoritativeLedgerGate,advanceLedgerWatermark,generateLedgerWatermark,readLedgerMetrics} from './sync-config.mjs';
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

test('generateLedgerWatermark refuses to lower a live watermark unless forced',()=>{
  const directory=mkdtempSync(join(tmpdir(),'incept-watermark-downgrade-'));
  try{
    const dbPath=join(directory,'v4.db');
    const watermarkPath=join(directory,'ledger-watermark.json');
    const db=new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE sync_meta (id INTEGER PRIMARY KEY, data_revision INTEGER NOT NULL);
      CREATE TABLE sync_receipts (batch_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL);
      CREATE TABLE sync_scopes (scope_id TEXT PRIMARY KEY, token_total INTEGER NOT NULL);
      CREATE TABLE sync_current (scope_id TEXT, observation_id TEXT);
      INSERT INTO sync_meta VALUES(1, 700);
      INSERT INTO sync_receipts VALUES('batch-700', 'hash-700');
      INSERT INTO sync_scopes VALUES('s1', 10),('s2', 20),('s3', 30);
      INSERT INTO sync_current VALUES('s1','o1'),('s2','o2'),('s3','o3');
    `);
    db.close();

    // A stale watermark from a higher revision must survive a naive regenerate.
    const stale={canonicalLedger:'v4.db',minRevision:800,anchorBatchId:'batch-700',anchorPayloadHash:'hash-700',
      minScopes:3,minTokens:60,minVisibleRecords:3};
    writeFileSync(watermarkPath,JSON.stringify(stale));
    assert.throws(()=>generateLedgerWatermark(dbPath,watermarkPath),/WATERMARK_DOWNGRADE_REJECTED/);
    assert.equal(JSON.parse(readFileSync(watermarkPath,'utf8')).minRevision,800,'rejected generate must not touch the file');

    // Any single regressing floor is enough to reject, not just the revision.
    writeFileSync(watermarkPath,JSON.stringify({...stale,minRevision:1,minVisibleRecords:99}));
    assert.throws(()=>generateLedgerWatermark(dbPath,watermarkPath),/WATERMARK_DOWNGRADE_REJECTED/);

    // Forcing re-baselines and the result still satisfies the gate.
    const forced=generateLedgerWatermark(dbPath,watermarkPath,{force:true});
    assert.equal(forced.minRevision,700);
    assert.equal(forced.minVisibleRecords,3);
    assert.equal(JSON.parse(readFileSync(watermarkPath,'utf8')).minRevision,700);
    assert.doesNotThrow(()=>validateAuthoritativeLedgerGate({INCEPT_SYNC_ENABLED:'1',INCEPT_SYNC_DATABASE_FILE:dbPath}));

    // Regenerating at the same height is idempotent and needs no flag.
    assert.doesNotThrow(()=>generateLedgerWatermark(dbPath,watermarkPath));

    // A corrupt watermark is not silently replaced either.
    writeFileSync(watermarkPath,'{not json');
    assert.throws(()=>generateLedgerWatermark(dbPath,watermarkPath),/EXTERNAL_WATERMARK_CORRUPTED/);
    assert.doesNotThrow(()=>generateLedgerWatermark(dbPath,watermarkPath,{force:true}));

    // Pinning an anchor the ledger does not hold would make the next startup fail.
    assert.throws(()=>generateLedgerWatermark(dbPath,watermarkPath,{anchorBatchId:'missing-batch',force:true}),/ANCHOR_RECEIPT_MISSING/);
  }finally{
    rmSync(directory,{recursive:true,force:true});
  }
});

test('readLedgerMetrics reports ledger baselines and the latest receipt without mutating the ledger',()=>{
  const directory=mkdtempSync(join(tmpdir(),'incept-ledger-metrics-'));
  try{
    const dbPath=join(directory,'v4.db');
    const db=new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE sync_meta (id INTEGER PRIMARY KEY, data_revision INTEGER NOT NULL);
      CREATE TABLE sync_receipts (batch_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL);
      CREATE TABLE sync_scopes (scope_id TEXT PRIMARY KEY, token_total INTEGER NOT NULL);
      CREATE TABLE sync_current (scope_id TEXT, observation_id TEXT);
      INSERT INTO sync_meta VALUES(1, 688);
      INSERT INTO sync_receipts VALUES('batch-old','hash-old'),('batch-new','hash-new');
      INSERT INTO sync_scopes VALUES('s1', 1000),('s2', 2500);
      INSERT INTO sync_current VALUES('s1','o1'),('s2','o2'),('s2','o3');
    `);
    db.close();

    const metrics=readLedgerMetrics(dbPath);
    assert.equal(metrics.revision,688);
    assert.equal(metrics.scopes,2);
    assert.equal(metrics.tokens,3500);
    assert.equal(metrics.visibleRecords,3);
    assert.deepEqual(metrics.latestReceipt,{batchId:'batch-new',payloadHash:'hash-new'});
    assert.equal(metrics.anchor,null);

    // Explicit anchor lookup resolves the historical receipt instead of the latest one.
    assert.deepEqual(readLedgerMetrics(dbPath,{anchorBatchId:'batch-old'}).anchor,{batchId:'batch-old',payloadHash:'hash-old'});
    assert.equal(readLedgerMetrics(dbPath,{anchorBatchId:'missing-batch'}).anchor,null);
    // Read-only: a second read must observe the identical ledger.
    assert.deepEqual(readLedgerMetrics(dbPath),metrics);
  }finally{
    rmSync(directory,{recursive:true,force:true});
  }
});

test('ledger-watermark CLI checks a ledger, reports metrics and gates the downgrade behind --force',()=>{
  const directory=mkdtempSync(join(tmpdir(),'incept-watermark-cli-'));
  try{
    const dbPath=join(directory,'v4.db');
    const watermarkPath=join(directory,'ledger-watermark.json');
    const cli=join(import.meta.dirname,'ledger-watermark.mjs');
    const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});

    const db=new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE sync_meta (id INTEGER PRIMARY KEY, data_revision INTEGER NOT NULL);
      CREATE TABLE sync_receipts (batch_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL);
      CREATE TABLE sync_scopes (scope_id TEXT PRIMARY KEY, token_total INTEGER NOT NULL);
      CREATE TABLE sync_current (scope_id TEXT, observation_id TEXT);
      INSERT INTO sync_meta VALUES(1, 700);
      INSERT INTO sync_receipts VALUES('batch-700', 'hash-700');
      INSERT INTO sync_scopes VALUES('s1', 10),('s2', 20);
      INSERT INTO sync_current VALUES('s1','o1'),('s2','o2');
    `);
    db.close();

    const first=run('generate',dbPath,watermarkPath);
    assert.equal(first.status,0,first.stderr);

    const checked=run('check',dbPath,watermarkPath);
    assert.equal(checked.status,0,checked.stderr);
    assert.match(checked.stdout,/\[PASS\] Authoritative ledger gate passed successfully!/);
    assert.match(checked.stdout,/Revision\s+700\s+\(floor 700\)/);
    assert.match(checked.stdout,/Visible records\s+2\s+\(floor 2\)/);
    assert.match(checked.stdout,/Anchor batch\s+batch-700 \(verified\)/);

    const lowered=new DatabaseSync(dbPath);
    lowered.exec('UPDATE sync_meta SET data_revision = 650 WHERE id = 1');
    lowered.close();
    const rejected=run('generate',dbPath,watermarkPath);
    assert.equal(rejected.status,1);
    assert.match(rejected.stderr,/WATERMARK_DOWNGRADE_REJECTED/);
    assert.equal(JSON.parse(readFileSync(watermarkPath,'utf8')).minRevision,700);

    const forced=run('generate',dbPath,watermarkPath,'--force');
    assert.equal(forced.status,0,forced.stderr);
    assert.equal(JSON.parse(readFileSync(watermarkPath,'utf8')).minRevision,650);
    assert.equal(run('check',dbPath,watermarkPath).status,0);

    const raised=new DatabaseSync(dbPath);
    raised.exec('UPDATE sync_meta SET data_revision = 720 WHERE id = 1');
    raised.close();
    const advanced=run('advance',dbPath,watermarkPath);
    assert.equal(advanced.status,0,advanced.stderr);
    assert.equal(JSON.parse(readFileSync(watermarkPath,'utf8')).minRevision,720);
  }finally{
    rmSync(directory,{recursive:true,force:true});
  }
});

test('ledger-watermark CLI honors an explicit watermark path outside the ledger directory',()=>{
  const directory=mkdtempSync(join(tmpdir(),'incept-watermark-explicit-'));
  try{
    const dbDir=join(directory,'db'),stateDir=join(directory,'state');
    mkdirSync(dbDir);mkdirSync(stateDir);
    const dbPath=join(dbDir,'v4.db'),adjacent=join(dbDir,'ledger-watermark.json'),explicit=join(stateDir,'ledger-watermark.json');
    const cli=join(import.meta.dirname,'ledger-watermark.mjs');
    const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});

    const db=new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE sync_meta (id INTEGER PRIMARY KEY, data_revision INTEGER NOT NULL);
      CREATE TABLE sync_receipts (batch_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL);
      CREATE TABLE sync_scopes (scope_id TEXT PRIMARY KEY, token_total INTEGER NOT NULL);
      CREATE TABLE sync_current (scope_id TEXT, observation_id TEXT);
      INSERT INTO sync_meta VALUES(1, 700);
    `);
    db.close();
    // The adjacent file would reject the ledger; the explicit path must win.
    writeFileSync(adjacent,JSON.stringify({canonicalLedger:'v4.db',minRevision:9999}));

    const generated=run('generate',dbPath,explicit);
    assert.equal(generated.status,0,generated.stderr);
    assert.equal(JSON.parse(readFileSync(explicit,'utf8')).minRevision,700);

    const checked=run('check',dbPath,explicit);
    assert.equal(checked.status,0,checked.stderr);
    assert.ok(checked.stdout.includes(explicit));

    const advanced=run('advance',dbPath,explicit);
    assert.equal(advanced.status,0,advanced.stderr);

    const defaulted=run('check',dbPath);
    assert.equal(defaulted.status,1);
    assert.match(defaulted.stderr,/REVISION_BELOW_WATERMARK/);
  }finally{
    rmSync(directory,{recursive:true,force:true});
  }
});
