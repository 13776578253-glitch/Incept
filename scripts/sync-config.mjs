import {isAbsolute,resolve,basename} from 'node:path';
import {lstatSync,readFileSync,existsSync,writeFileSync,renameSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

export function validateSyncConfiguration(env=process.env) {
  for(const name of ['INCEPT_SYNC_ENABLED','INCEPT_SYNC_REMOTE_ENABLED'])if(env[name]!==undefined&&!['0','1'].includes(env[name]))throw Error('SYNC_FLAG_INVALID');
  if(!['v1','shadow','v2'].includes(env.INCEPT_SYNC_READ_MODE??'v1'))throw Error('SYNC_READ_MODE_INVALID');
  const enabled=env.INCEPT_SYNC_ENABLED==='1',remote=env.INCEPT_SYNC_REMOTE_ENABLED==='1';
  if(!enabled){if(remote||(env.INCEPT_SYNC_READ_MODE??'v1')!=='v1')throw Error('SYNC_DISABLED_CONFIG_CONFLICT');return;}
  if(!env.INCEPT_SYNC_DATABASE_FILE||!isAbsolute(env.INCEPT_SYNC_DATABASE_FILE)||resolve(env.INCEPT_SYNC_DATABASE_FILE)===resolve(env.INCEPT_DASHBOARD_IMPORTS_FILE??''))throw Error('SYNC_DISTINCT_DATABASE_REQUIRED');
  if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(env.INCEPT_SYNC_DEVICE_ALLOWLIST??''))throw Error('SYNC_SINGLE_CANARY_REQUIRED');
  const poll=Number(env.INCEPT_SYNC_POLL_MS??300000),queue=Number(env.INCEPT_SYNC_MAX_QUEUE??4),batch=Number(env.INCEPT_SYNC_MAX_BATCH_RECORDS??100000),memory=Number(env.INCEPT_SYNC_MEMORY_PERCENT??85);
  if(!Number.isInteger(poll)||poll<300000||poll>600000)throw Error('SYNC_POLL_INVALID');
  if(!Number.isInteger(queue)||queue<1||queue>64)throw Error('SYNC_QUEUE_INVALID');
  if(!Number.isInteger(batch)||batch<1||batch>100000)throw Error('SYNC_BATCH_INVALID');
  if(!Number.isInteger(memory)||memory<50||memory>95)throw Error('SYNC_MEMORY_PERCENT_INVALID');
  const size=(name,fallback)=>{const value=Number(env[name]??fallback);if(!Number.isSafeInteger(value)||value<0)throw Error('SYNC_DISK_LIMIT_INVALID');return value;};
  const warn=size('INCEPT_SYNC_WARN_BYTES',1024**3),review=size('INCEPT_SYNC_REVIEW_BYTES',2*1024**3);
  const freeWarn=size('INCEPT_SYNC_WARN_FREE_BYTES',5*1024**3),freeReject=size('INCEPT_SYNC_REJECT_FREE_BYTES',2*1024**3);
  if(size('INCEPT_SYNC_MAX_STORE_BYTES',4*1024**3)<1||warn>review||freeReject>freeWarn)throw Error('SYNC_DISK_LIMIT_INVALID');
  if(remote){
    const file=env.INCEPT_SYNC_RPC_KEY_FILE;
    if(!file||!isAbsolute(file))throw Error('SYNC_SECRET_FILE_REQUIRED');
    const entry=lstatSync(file);if(!entry.isFile()||entry.isSymbolicLink())throw Error('SYNC_SECRET_FILE_INVALID');
    const key=readFileSync(file,'utf8').trim();
    if(!/^[a-f\d]{64,128}$/i.test(key)||/^(.)\1+$/.test(key))throw Error('SYNC_SECRET_INVALID');
    const gateway=new URL(env.INCEPT_SYNC_GATEWAY_INTERNAL_URL??'');if(gateway.protocol!=='http:'||gateway.hostname!=='sync-gateway'||gateway.port!=='3101'||gateway.username||gateway.password||gateway.search)throw Error('SYNC_INTERNAL_GATEWAY_REQUIRED');
  }
}

export function validateAuthoritativeLedgerGate(env=process.env, watermarkFile) {
  if(env.INCEPT_SYNC_ENABLED!=='1')return;
  const dbFile=env.INCEPT_SYNC_DATABASE_FILE;
  if(!dbFile||!isAbsolute(dbFile))throw Error('SYNC_DATABASE_NOT_CONFIGURED');
  const resolvedWatermark=watermarkFile?resolve(watermarkFile):resolve(dbFile,'..','ledger-watermark.json');
  if(!existsSync(resolvedWatermark))throw Error('EXTERNAL_WATERMARK_MISSING');
  let watermark;
  try{watermark=JSON.parse(readFileSync(resolvedWatermark,'utf8'));}
  catch{throw Error('EXTERNAL_WATERMARK_CORRUPTED');}
  if(watermark.canonicalLedger&&!dbFile.endsWith(watermark.canonicalLedger))throw Error('CANONICAL_LEDGER_MISMATCH');
  if(!existsSync(dbFile))throw Error('LEDGER_DATABASE_NOT_FOUND');
  const db=new DatabaseSync(dbFile,{readOnly:true});
  try{
    const integrity=db.prepare('PRAGMA quick_check').get();
    if(!integrity||integrity.quick_check!=='ok')throw Error('SQLITE_INTEGRITY_FAILED');
    if(watermark.minRevision){
      const meta=db.prepare('SELECT data_revision FROM sync_meta WHERE id=1').get();
      if(!meta||Number(meta.data_revision)<watermark.minRevision)throw Error('REVISION_BELOW_WATERMARK');
    }
    if(watermark.anchorBatchId){
      const receipt=db.prepare('SELECT payload_hash FROM sync_receipts WHERE batch_id=?').get(watermark.anchorBatchId);
      if(!receipt)throw Error('ANCHOR_RECEIPT_MISSING');
      if(watermark.anchorPayloadHash&&receipt.payload_hash!==watermark.anchorPayloadHash)throw Error('ANCHOR_PAYLOAD_HASH_MISMATCH');
    }
    if(watermark.minScopes){
      const scopes=Number(db.prepare('SELECT COUNT(*) c FROM sync_scopes').get()?.c??0);
      if(scopes<watermark.minScopes)throw Error('SCOPES_BELOW_BASELINE');
    }
    if(watermark.minTokens){
      const tokens=Number(db.prepare('SELECT SUM(token_total) t FROM sync_scopes').get()?.t??0);
      if(tokens<watermark.minTokens)throw Error('TOKENS_BELOW_BASELINE');
    }
    if(watermark.minVisibleRecords){
      const visible=Number(db.prepare('SELECT COUNT(*) c FROM sync_current').get()?.c??0);
      if(visible<watermark.minVisibleRecords)throw Error('VISIBLE_RECORDS_BELOW_BASELINE');
    }
  }finally{
    db.close();
  }
}

// Floors the gate enforces, paired with the ledger metric each one is compared against.
const WATERMARK_FLOORS = [
  ['minRevision', 'revision'],
  ['minScopes', 'scopes'],
  ['minTokens', 'tokens'],
  ['minVisibleRecords', 'visibleRecords']
];

// Read the authoritative baseline figures once, without mutating the ledger.
export function readLedgerMetrics(dbFile, options = {}) {
  if(!dbFile||!existsSync(dbFile))throw Error('LEDGER_DATABASE_NOT_FOUND');
  const db = new DatabaseSync(dbFile, {readOnly: true});
  try {
    const integrity = db.prepare('PRAGMA quick_check').get();
    if(!integrity||integrity.quick_check!=='ok')throw Error('SQLITE_INTEGRITY_FAILED');
    const meta = db.prepare('SELECT data_revision FROM sync_meta WHERE id=1').get();
    const latest = db.prepare('SELECT batch_id, payload_hash FROM sync_receipts ORDER BY rowid DESC LIMIT 1').get();
    let anchor = null;
    if(options.anchorBatchId) {
      const receipt = db.prepare('SELECT batch_id, payload_hash FROM sync_receipts WHERE batch_id=?').get(options.anchorBatchId);
      if(receipt) anchor = { batchId: String(receipt.batch_id), payloadHash: String(receipt.payload_hash) };
    }
    return {
      revision: Number(meta?.data_revision ?? 0),
      scopes: Number(db.prepare('SELECT COUNT(*) c FROM sync_scopes').get()?.c ?? 0),
      tokens: Number(db.prepare('SELECT SUM(token_total) t FROM sync_scopes').get()?.t ?? 0),
      visibleRecords: Number(db.prepare('SELECT COUNT(*) c FROM sync_current').get()?.c ?? 0),
      latestReceipt: latest ? { batchId: String(latest.batch_id), payloadHash: String(latest.payload_hash) } : null,
      anchor
    };
  } finally {
    db.close();
  }
}

// Every floor in an existing watermark must still hold, otherwise generating would weaken the guard.
function assertNoDowngrade(existing, metrics) {
  for (const [floor, metric] of WATERMARK_FLOORS) {
    if (Number(existing?.[floor] ?? 0) > metrics[metric]) throw Error('WATERMARK_DOWNGRADE_REJECTED');
  }
}

export function generateLedgerWatermark(dbFile, watermarkFile, options = {}) {
  const targetFile = watermarkFile ?? resolve(dbFile, '..', 'ledger-watermark.json');
  const metrics = readLedgerMetrics(dbFile, { anchorBatchId: options.anchorBatchId });
  if (options.anchorBatchId && !metrics.anchor) throw Error('ANCHOR_RECEIPT_MISSING');
  // Refuse to lower a live watermark unless the operator explicitly forces it: a silent
  // downgrade would let a stale or rolled-back ledger re-baseline the startup gate.
  if (existsSync(targetFile) && !options.force) {
    let existing;
    try { existing = JSON.parse(readFileSync(targetFile, 'utf8')); }
    catch { throw Error('EXTERNAL_WATERMARK_CORRUPTED'); }
    assertNoDowngrade(existing, metrics);
  }

  const anchorBatchId = options.anchorBatchId ?? metrics.latestReceipt?.batchId;
  const anchorPayloadHash = options.anchorPayloadHash
    ?? (options.anchorBatchId ? metrics.anchor?.payloadHash : metrics.latestReceipt?.payloadHash);

  const watermark = {
    canonicalLedger: options.canonicalLedger ?? basename(dbFile),
    minRevision: options.minRevision ?? metrics.revision,
    // Only anchor on a receipt the ledger actually holds; an unknown batch would fail the next startup.
    ...(anchorBatchId && anchorPayloadHash ? { anchorBatchId, anchorPayloadHash } : {}),
    minScopes: options.minScopes ?? metrics.scopes,
    minTokens: options.minTokens ?? metrics.tokens,
    minVisibleRecords: options.minVisibleRecords ?? metrics.visibleRecords,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const tempFile = targetFile + '.tmp-' + process.pid;
  writeFileSync(tempFile, JSON.stringify(watermark, null, 2) + '\n', { mode: 0o600 });
  renameSync(tempFile, targetFile);
  return watermark;
}

export function advanceLedgerWatermark(dbFile, watermarkFile) {
  if(!watermarkFile||!existsSync(watermarkFile))throw Error('EXTERNAL_WATERMARK_MISSING');
  let current;
  try{current=JSON.parse(readFileSync(watermarkFile,'utf8'));}
  catch{throw Error('EXTERNAL_WATERMARK_CORRUPTED');}
  const metrics = readLedgerMetrics(dbFile);

  // Monotonic regression guard: none of the metrics may regress below existing watermark
  for (const [floor, metric] of WATERMARK_FLOORS) {
    if (current[floor] && metrics[metric] < current[floor]) throw Error('WATERMARK_REGRESSION_REJECTED');
  }

  const updated = {
    ...current,
    minRevision: Math.max(current.minRevision ?? 0, metrics.revision),
    minScopes: Math.max(current.minScopes ?? 0, metrics.scopes),
    minTokens: Math.max(current.minTokens ?? 0, metrics.tokens),
    minVisibleRecords: Math.max(current.minVisibleRecords ?? 0, metrics.visibleRecords),
    updatedAt: new Date().toISOString()
  };

  // Atomic write
  const tempFile=watermarkFile+'.tmp-'+process.pid;
  writeFileSync(tempFile,JSON.stringify(updated,null,2),{mode:0o600});
  renameSync(tempFile,watermarkFile);
  return updated;
}
