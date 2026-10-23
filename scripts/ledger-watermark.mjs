#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  validateAuthoritativeLedgerGate,
  generateLedgerWatermark,
  advanceLedgerWatermark
} from './sync-config.mjs';

function usage() {
  console.log(`
Usage:
  node scripts/ledger-watermark.mjs check [dbFile] [watermarkFile]
  node scripts/ledger-watermark.mjs generate [dbFile] [watermarkFile]
  node scripts/ledger-watermark.mjs advance [dbFile] [watermarkFile]

Defaults:
  dbFile:        process.env.INCEPT_SYNC_DATABASE_FILE || '/data/sync/v4.db'
  watermarkFile: [dirname of dbFile]/ledger-watermark.json
`);
  process.exit(1);
}

const action = process.argv[2];
if (!action || !['check', 'generate', 'advance'].includes(action)) {
  usage();
}

const defaultDb = process.env.INCEPT_SYNC_DATABASE_FILE || '/data/sync/v4.db';
const rawDb = process.argv[3] || defaultDb;
const dbFile = resolve(rawDb);
const defaultWatermark = resolve(dbFile, '..', 'ledger-watermark.json');
const watermarkFile = resolve(process.argv[4] || defaultWatermark);

console.log(`[ledger-watermark] Action: ${action}`);
console.log(`[ledger-watermark] Database file: ${dbFile}`);
console.log(`[ledger-watermark] Watermark file: ${watermarkFile}`);

try {
  if (action === 'check') {
    if (!existsSync(watermarkFile)) {
      console.error(`[FAIL] Watermark file not found at: ${watermarkFile}`);
      process.exit(1);
    }
    const env = {
      INCEPT_SYNC_ENABLED: '1',
      INCEPT_SYNC_DATABASE_FILE: dbFile,
    };
    validateAuthoritativeLedgerGate(env);
    const content = JSON.parse(readFileSync(watermarkFile, 'utf8'));
    console.log('[PASS] Authoritative ledger gate passed successfully!');
    console.log('[PASS] Verified Watermark content:', JSON.stringify(content, null, 2));
  } else if (action === 'generate') {
    if (!existsSync(dbFile)) {
      console.error(`[FAIL] Database file not found at: ${dbFile}`);
      process.exit(1);
    }
    const created = generateLedgerWatermark(dbFile, watermarkFile);
    console.log('[OK] Generated ledger watermark:');
    console.log(JSON.stringify(created, null, 2));
    // Immediately verify
    validateAuthoritativeLedgerGate({
      INCEPT_SYNC_ENABLED: '1',
      INCEPT_SYNC_DATABASE_FILE: dbFile,
    });
    console.log('[PASS] Immediate gate verification succeeded.');
  } else if (action === 'advance') {
    if (!existsSync(dbFile)) {
      console.error(`[FAIL] Database file not found at: ${dbFile}`);
      process.exit(1);
    }
    if (!existsSync(watermarkFile)) {
      console.error(`[FAIL] Watermark file not found at: ${watermarkFile}. Use 'generate' first.`);
      process.exit(1);
    }
    const updated = advanceLedgerWatermark(dbFile, watermarkFile);
    console.log('[OK] Advanced ledger watermark:');
    console.log(JSON.stringify(updated, null, 2));
    validateAuthoritativeLedgerGate({
      INCEPT_SYNC_ENABLED: '1',
      INCEPT_SYNC_DATABASE_FILE: dbFile,
    });
    console.log('[PASS] Immediate gate verification succeeded.');
  }
} catch (err) {
  console.error(`[ERROR] ${err.message}`);
  process.exit(1);
}
