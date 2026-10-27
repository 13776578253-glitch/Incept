#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  validateAuthoritativeLedgerGate,
  readLedgerMetrics,
  generateLedgerWatermark,
  advanceLedgerWatermark
} from './sync-config.mjs';

function usage() {
  console.log(`
Usage:
  node scripts/ledger-watermark.mjs check [dbFile] [watermarkFile]
  node scripts/ledger-watermark.mjs generate [dbFile] [watermarkFile] [--force]
  node scripts/ledger-watermark.mjs advance [dbFile] [watermarkFile]

  --force  Allow 'generate' to lower an existing watermark. Without it, a generate
           that would weaken any floor is rejected with WATERMARK_DOWNGRADE_REJECTED.

Defaults:
  dbFile:        process.env.INCEPT_SYNC_DATABASE_FILE || '/data/sync/v4.db'
  watermarkFile: [dirname of dbFile]/ledger-watermark.json
`);
  process.exit(1);
}

// Flags may appear anywhere; the three positional arguments stay in order.
const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith('--')));
const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const action = positional[0];
if (!action || !['check', 'generate', 'advance'].includes(action)) {
  usage();
}
if (flags.has('--force') && action !== 'generate') {
  console.error('[FAIL] --force only applies to the generate action.');
  process.exit(1);
}

const defaultDb = process.env.INCEPT_SYNC_DATABASE_FILE || '/data/sync/v4.db';
const dbFile = resolve(positional[1] || defaultDb);
const watermarkFile = resolve(positional[2] || resolve(dbFile, '..', 'ledger-watermark.json'));

console.log(`[ledger-watermark] Action: ${action}`);
console.log(`[ledger-watermark] Database file: ${dbFile}`);
console.log(`[ledger-watermark] Watermark file: ${watermarkFile}`);

const rows = [
  ['Revision', 'revision', 'minRevision'],
  ['Scopes', 'scopes', 'minScopes'],
  ['Tokens', 'tokens', 'minTokens'],
  ['Visible records', 'visibleRecords', 'minVisibleRecords']
];

function report(watermark) {
  const metrics = readLedgerMetrics(dbFile);
  const width = Math.max(...rows.map(([label]) => label.length)) + 2;
  console.log('[PASS] Authoritative ledger gate passed successfully!');
  for (const [label, metric, floor] of rows) {
    const floorValue = watermark?.[floor];
    const floorText = floorValue === undefined ? 'not pinned' : `floor ${floorValue}`;
    console.log(`  ${label.padEnd(width)}${String(metrics[metric]).padEnd(14)}(${floorText})`);
  }
  const anchor = watermark?.anchorBatchId
    ? `${watermark.anchorBatchId}${watermark.anchorPayloadHash ? ' (verified)' : ' (hash not pinned)'}`
    : 'not pinned';
  console.log(`  ${'Anchor batch'.padEnd(width)}${anchor}`);
  console.log(`  ${'Watermark file'.padEnd(width)}${watermarkFile} (mode ${(statSync(watermarkFile).mode & 0o777).toString(8)})`);
}

try {
  if (action === 'check') {
    if (!existsSync(watermarkFile)) {
      console.error(`[FAIL] Watermark file not found at: ${watermarkFile}`);
      process.exit(1);
    }
    validateAuthoritativeLedgerGate({ INCEPT_SYNC_ENABLED: '1', INCEPT_SYNC_DATABASE_FILE: dbFile }, watermarkFile);
    report(JSON.parse(readFileSync(watermarkFile, 'utf8')));
  } else if (action === 'generate') {
    if (!existsSync(dbFile)) {
      console.error(`[FAIL] Database file not found at: ${dbFile}`);
      process.exit(1);
    }
    if (flags.has('--force')) console.log('[ledger-watermark] --force: existing floors may be lowered.');
    const created = generateLedgerWatermark(dbFile, watermarkFile, { force: flags.has('--force') });
    console.log('[OK] Generated ledger watermark:');
    console.log(JSON.stringify(created, null, 2));
    validateAuthoritativeLedgerGate({ INCEPT_SYNC_ENABLED: '1', INCEPT_SYNC_DATABASE_FILE: dbFile }, watermarkFile);
    report(created);
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
    validateAuthoritativeLedgerGate({ INCEPT_SYNC_ENABLED: '1', INCEPT_SYNC_DATABASE_FILE: dbFile }, watermarkFile);
    report(updated);
  }
} catch (err) {
  console.error(`[ERROR] ${err.message}`);
  if (err.message === 'WATERMARK_DOWNGRADE_REJECTED') {
    console.error('[HINT] The existing watermark pins a higher floor than this ledger holds.');
    console.error('[HINT] Inspect it first; re-run generate with --force only if the drop is legitimate.');
  }
  process.exit(1);
}
