import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { checkDeviceIntegrity, checkSnapshotLag, checkSync504, runProductionChecks } from './production-monitor.mjs';
import { summarizeCaddySync504Logs } from './production-monitor-proxy-log.mjs';

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'incept-monitor-test-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function createV4Ledger(dbFile, revision) {
  const db = new DatabaseSync(dbFile);
  db.exec('CREATE TABLE IF NOT EXISTS sync_meta(id INTEGER PRIMARY KEY CHECK(id=1), schema_version INTEGER NOT NULL, data_revision INTEGER NOT NULL)');
  db.prepare('INSERT OR REPLACE INTO sync_meta(id, schema_version, data_revision) VALUES (1, 3, ?)').run(revision);
  db.close();
}

test('summarizeCaddySync504Logs counts only sync route 504s within window', () => {
  const nowMs = Date.parse('2026-11-28T08:00:00.000Z');
  const logs = [
    // Inside window, sync 504 -> counted
    JSON.stringify({ ts: (nowMs - 60_000) / 1000, status: 504, safe_uri: '/api/dashboard/sync/batches/abc/commit' }),
    // Inside window, sync 200 -> ignored
    JSON.stringify({ ts: (nowMs - 30_000) / 1000, status: 200, safe_uri: '/api/dashboard/sync/batches' }),
    // Inside window, non-sync 504 -> ignored
    JSON.stringify({ ts: (nowMs - 20_000) / 1000, status: 504, safe_uri: '/zh/dashboard' }),
    // Outside 15m window, sync 504 -> ignored
    JSON.stringify({ ts: (nowMs - 20 * 60_000) / 1000, status: 504, safe_uri: '/api/dashboard/sync/batches' }),
    'not-json-line',
  ].join('\n');

  const summary = summarizeCaddySync504Logs(logs, nowMs, 15);
  assert.equal(summary.version, 1);
  assert.equal(summary.sync504Count, 1);
  assert.equal(summary.last504At, new Date(nowMs - 60_000).toISOString());
});

test('checkSync504 passes when zero and fails when count hits threshold or summary is stale', async () => {
  await withTempDir(async dir => {
    const summaryFile = path.join(dir, 'sync-504.json');
    const nowMs = Date.parse('2026-11-28T08:00:00.000Z');

    await fs.writeFile(summaryFile, JSON.stringify({
      version: 1,
      collectedAt: new Date(nowMs - 30_000).toISOString(),
      windowMinutes: 15,
      sync504Count: 0,
      last504At: null,
    }));
    const ok = await checkSync504({ INCEPT_SYNC_504_SUMMARY_FILE: summaryFile }, nowMs);
    assert.equal(ok.sync504Count, 0);

    await fs.writeFile(summaryFile, JSON.stringify({
      version: 1,
      collectedAt: new Date(nowMs - 30_000).toISOString(),
      windowMinutes: 15,
      sync504Count: 1,
      last504At: new Date(nowMs - 45_000).toISOString(),
    }));
    await assert.rejects(() => checkSync504({ INCEPT_SYNC_504_SUMMARY_FILE: summaryFile }, nowMs), /sync 504/i);

    await fs.writeFile(summaryFile, JSON.stringify({
      version: 1,
      collectedAt: new Date(nowMs - 20 * 60_000).toISOString(),
      windowMinutes: 15,
      sync504Count: 0,
      last504At: null,
    }));
    await assert.rejects(() => checkSync504({ INCEPT_SYNC_504_SUMMARY_FILE: summaryFile }, nowMs), /stale/i);
  });
});

test('checkSnapshotLag allows brief rebuild grace period and alerts once lag exceeds threshold', async () => {
  await withTempDir(async dir => {
    const dbFile = path.join(dir, 'v4.db');
    const cacheFile = path.join(dir, 'snapshots.json');
    const stateFile = path.join(dir, 'state.json');
    createV4Ledger(dbFile, 4615);
    await fs.writeFile(cacheFile, JSON.stringify({ version: 1, sync: { revision: 4615 } }));

    const t0 = Date.parse('2026-11-28T08:00:00.000Z');
    const cfg = {
      INCEPT_SYNC_DATABASE_FILE: dbFile,
      INCEPT_DASHBOARD_CACHE_FILE: cacheFile,
      INCEPT_MONITOR_STATE_FILE: stateFile,
      INCEPT_SNAPSHOT_MAX_LAG_SECONDS: '300',
    };

    // Caught up
    const caughtUp = await checkSnapshotLag(cfg, t0);
    assert.equal(caughtUp.lagRevisions, 0);

    // Advance ledger to 4616 while snapshot stays at 4615; brief lag (t0 -> t0+60s) is tolerated
    createV4Ledger(dbFile, 4616);
    await fs.utimes(cacheFile, new Date(t0 - 10_000), new Date(t0 - 10_000));
    await fs.utimes(dbFile, new Date(t0), new Date(t0));
    const brief = await checkSnapshotLag(cfg, t0 + 60_000);
    assert.equal(brief.lagRevisions, 1);
    assert.equal(brief.lagSeconds, 60);

    // Still behind at t0 + 365s -> triggers snapshot_lag failure even if another commit bumps db mtime
    createV4Ledger(dbFile, 4617);
    await fs.utimes(dbFile, new Date(t0 + 360_000), new Date(t0 + 360_000));
    await assert.rejects(() => checkSnapshotLag(cfg, t0 + 365_000), /Snapshot lagging/i);

    // Catch up snapshot -> clears lag state
    await fs.writeFile(cacheFile, JSON.stringify({ version: 1, sync: { revision: 4617 } }));
    const recovered = await checkSnapshotLag(cfg, t0 + 400_000);
    assert.equal(recovered.lagRevisions, 0);
  });
});

test('runProductionChecks reports exact failing check for backup, sync_504, snapshot_lag, and ok metrics', async () => {
  await withTempDir(async dir => {
    const manifestFile = path.join(dir, 'manifest.json');
    const receiptFile = path.join(dir, 'receipt.json');
    const summaryFile = path.join(dir, 'sync-504.json');
    const dbFile = path.join(dir, 'v4.db');
    const cacheFile = path.join(dir, 'snapshots.json');
    const stateFile = path.join(dir, 'state.json');

    const nowMs = Date.parse('2026-11-28T08:00:00.000Z');
    await fs.writeFile(manifestFile, JSON.stringify({ version: 1, createdAt: new Date(nowMs - 60 * 60_000).toISOString() }));
    await fs.writeFile(receiptFile, JSON.stringify({
      version: 1,
      snapshotId: 'd5ef31712ac46e42459f6e358cbf171c',
      verifiedAt: new Date(nowMs - 30 * 60_000).toISOString(),
      backupCreatedAt: new Date(nowMs - 60 * 60_000).toISOString(),
    }));
    await fs.writeFile(summaryFile, JSON.stringify({
      version: 1,
      collectedAt: new Date(nowMs - 10_000).toISOString(),
      windowMinutes: 15,
      sync504Count: 0,
      last504At: null,
    }));
    createV4Ledger(dbFile, 4615);
    await fs.writeFile(cacheFile, JSON.stringify({ version: 1, sync: { revision: 4615 } }));

    const baseCfg = {
      INCEPT_HEALTH_URL: 'https://site.example/api/health/ready',
      INCEPT_DATA_DIR: dir,
      INCEPT_LAST_BACKUP_MANIFEST: manifestFile,
      INCEPT_LAST_OFFSITE_RECEIPT: receiptFile,
      INCEPT_MONITOR_STATE_FILE: stateFile,
      INCEPT_SYNC_504_SUMMARY_FILE: summaryFile,
      INCEPT_SYNC_DATABASE_FILE: dbFile,
      INCEPT_DASHBOARD_CACHE_FILE: cacheFile,
      INCEPT_SNAPSHOT_MAX_LAG_SECONDS: '300',
    };
    const deps = {
      nowMs,
      fetch: async () => new Response(JSON.stringify({ status: 'ready' }), { status: 200 }),
      statfs: async () => ({ blocks: 100, bavail: 50 }),
    };

    const ok = await runProductionChecks(baseCfg, deps);
    assert.equal(ok.healthy, true);
    assert.equal(ok.check, null);
    assert.equal(ok.metrics.diskFreePercent, 50);
    assert.equal(ok.metrics.sync504Count, 0);
    assert.equal(ok.metrics.snapshotLagRevisions, 0);

    // Trigger sync_504
    await fs.writeFile(summaryFile, JSON.stringify({
      version: 1,
      collectedAt: new Date(nowMs - 10_000).toISOString(),
      windowMinutes: 15,
      sync504Count: 2,
      last504At: new Date(nowMs - 20_000).toISOString(),
    }));
    const fail504 = await runProductionChecks(baseCfg, deps);
    assert.equal(fail504.healthy, false);
    assert.equal(fail504.check, 'sync_504');

    // Clear sync_504, trigger snapshot_lag via stale db mtime
    await fs.writeFile(summaryFile, JSON.stringify({
      version: 1,
      collectedAt: new Date(nowMs - 10_000).toISOString(),
      windowMinutes: 15,
      sync504Count: 0,
      last504At: null,
    }));
    createV4Ledger(dbFile, 4620);
    await fs.utimes(cacheFile, new Date(nowMs - 700_000), new Date(nowMs - 700_000));
    await fs.utimes(dbFile, new Date(nowMs - 400_000), new Date(nowMs - 400_000));
    const failLag = await runProductionChecks(baseCfg, deps);
    assert.equal(failLag.healthy, false);
    assert.equal(failLag.check, 'snapshot_lag');

    // Catch up snapshot and trigger collection_isolation via device integrity report
    await fs.writeFile(cacheFile, JSON.stringify({ version: 1, sync: { revision: 4620 } }));
    const integrityFile = path.join(dir, 'device-integrity.json');
    await fs.writeFile(integrityFile, JSON.stringify({
      version: 1,
      updatedAt: new Date(nowMs).toISOString(),
      devices: {
        'dev-1': { actionableSessions: 2, totalBlockedTokens: 88084618 },
      },
    }));
    const failIso = await runProductionChecks({ ...baseCfg, INCEPT_DEVICE_INTEGRITY_FILE: integrityFile }, deps);
    assert.equal(failIso.healthy, false);
    assert.equal(failIso.check, 'collection_isolation');

    await fs.writeFile(integrityFile, JSON.stringify({
      version: 1,
      updatedAt: new Date(nowMs).toISOString(),
      devices: {
        'dev-1': { actionableSessions: 0, totalBlockedTokens: 0 },
      },
    }));
    const cleanIso = await checkDeviceIntegrity({ INCEPT_DEVICE_INTEGRITY_FILE: integrityFile });
    assert.equal(cleanIso.totalBlockedTokens, 0);
  });
});
