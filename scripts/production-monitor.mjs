import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { notifyProbe } from './production-alert.mjs';

function parseBoundedNumber(raw, fallback, min, max, label) {
  const value = Number(raw ?? String(fallback));
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

async function persistJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function statMtimeMs(filePath) {
  try {
    return (await fs.stat(filePath)).mtimeMs;
  } catch (error) {
    if (error?.code === 'ENOENT') return 0;
    throw error;
  }
}

export function readLedgerRevision(dbFile) {
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    const row = db.prepare('SELECT data_revision FROM sync_meta WHERE id = 1').get();
    const revision = Number(row?.data_revision);
    if (!Number.isFinite(revision) || revision < 0) {
      throw new Error('Invalid ledger data_revision');
    }
    return revision;
  } finally {
    db.close();
  }
}

export async function checkSnapshotLag(configuration, nowMs = Date.now(), deps = {}) {
  const dbFile = configuration.INCEPT_SYNC_DATABASE_FILE;
  const cacheFile = configuration.INCEPT_DASHBOARD_CACHE_FILE;
  if (!dbFile && !cacheFile) return null;
  if (!dbFile || !cacheFile) throw new Error('Both INCEPT_SYNC_DATABASE_FILE and INCEPT_DASHBOARD_CACHE_FILE are required for snapshot lag check');
  const maxLagSeconds = parseBoundedNumber(configuration.INCEPT_SNAPSHOT_MAX_LAG_SECONDS, 300, 30, 3600, 'snapshot lag threshold');
  const readRevision = deps.readLedgerRevision ?? readLedgerRevision;
  const ledgerRevision = readRevision(dbFile);
  const cache = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
  const snapshotRevision = Number(cache?.sync?.revision ?? 0);
  if (!Number.isFinite(snapshotRevision) || snapshotRevision < 0) {
    throw new Error('Invalid snapshot revision');
  }
  const lagStateFile = configuration.INCEPT_SNAPSHOT_LAG_STATE_FILE
    ?? (configuration.INCEPT_MONITOR_STATE_FILE ? `${configuration.INCEPT_MONITOR_STATE_FILE}.snapshot-lag.json` : null);
  const lagRevisions = Math.max(0, ledgerRevision - snapshotRevision);
  if (lagRevisions === 0) {
    if (lagStateFile) await fs.rm(lagStateFile, { force: true });
    return { ledgerRevision, snapshotRevision, lagRevisions: 0, lagSeconds: 0 };
  }
  const dbMtimeMs = Math.max(await statMtimeMs(dbFile), await statMtimeMs(`${dbFile}-wal`));
  const snapMtimeMs = await statMtimeMs(cacheFile);
  let lagState = null;
  if (lagStateFile) {
    try {
      lagState = JSON.parse(await fs.readFile(lagStateFile, 'utf8'));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  const firstSeenBehindAt = Number.isFinite(lagState?.firstSeenBehindAt) && lagState?.snapshotRevision === snapshotRevision
    ? lagState.firstSeenBehindAt
    : nowMs;
  if (lagStateFile && (!lagState || lagState.snapshotRevision !== snapshotRevision)) {
    await persistJsonAtomic(lagStateFile, { snapshotRevision, firstSeenBehindAt });
  }
  const mtimeLagMs = dbMtimeMs > snapMtimeMs ? Math.max(0, nowMs - dbMtimeMs) : 0;
  const observedLagMs = Math.max(0, nowMs - firstSeenBehindAt);
  const effectiveLagMs = Math.max(observedLagMs, mtimeLagMs);
  const lagSeconds = Math.round(effectiveLagMs / 1000);
  if (effectiveLagMs >= maxLagSeconds * 1000) {
    throw new Error(`Snapshot lagging behind ledger by ${lagRevisions} revision(s) for ${lagSeconds}s`);
  }
  return { ledgerRevision, snapshotRevision, lagRevisions, lagSeconds };
}

export async function checkSync504(configuration, nowMs = Date.now()) {
  const summaryFile = configuration.INCEPT_SYNC_504_SUMMARY_FILE;
  if (!summaryFile) return null;
  const maxCount = parseBoundedNumber(configuration.INCEPT_SYNC_504_MAX_COUNT, 1, 1, 1000, 'sync 504 threshold');
  const maxStaleMinutes = parseBoundedNumber(configuration.INCEPT_SYNC_504_MAX_STALE_MINUTES, 10, 2, 120, 'sync 504 summary freshness');
  const summary = JSON.parse(await fs.readFile(summaryFile, 'utf8'));
  const collectedAt = Date.parse(summary?.collectedAt);
  if (summary?.version !== 1 || !Number.isFinite(collectedAt) || collectedAt > nowMs + 60_000 || nowMs - collectedAt > maxStaleMinutes * 60_000) {
    throw new Error('Sync 504 proxy summary missing or stale');
  }
  const sync504Count = Number(summary.sync504Count);
  if (!Number.isInteger(sync504Count) || sync504Count < 0) {
    throw new Error('Invalid sync 504 count');
  }
  if (sync504Count >= maxCount) {
    throw new Error(`Detected ${sync504Count} sync 504 response(s) in window`);
  }
  return { sync504Count, windowMinutes: summary.windowMinutes ?? null };
}

export async function runProductionChecks(configuration = process.env, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch;
  const nowMs = deps.nowMs ?? Date.now();
  const statfsImpl = deps.statfs ?? fs.statfs;
  const url = configuration.INCEPT_HEALTH_URL;
  let check = 'configuration';
  try {
    if (!url || new URL(url).protocol !== 'https:') throw new Error('Missing HTTPS probe URL');

    check = 'health';
    const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(5_000) });
    if (!response.ok || (await response.json()).status !== 'ready') throw new Error('Service unavailable');

    check = 'disk';
    const storage = await statfsImpl(configuration.INCEPT_DATA_DIR);
    const minimumFreePercent = parseBoundedNumber(configuration.INCEPT_DISK_MIN_FREE_PERCENT, 15, 15, 100, 'disk threshold');
    const diskFreePercent = Number(storage.blocks) > 0
      ? Number(storage.bavail) / Number(storage.blocks) * 100
      : 0;
    if (!(Number(storage.blocks) > 0) || diskFreePercent < minimumFreePercent) throw new Error('Low disk space');

    check = 'backup';
    const maxBackupAgeHours = parseBoundedNumber(configuration.INCEPT_BACKUP_MAX_AGE_HOURS, 26, 1, 168, 'backup max age');
    const maxBackupAgeMs = maxBackupAgeHours * 60 * 60_000;
    const manifest = JSON.parse(await fs.readFile(configuration.INCEPT_LAST_BACKUP_MANIFEST, 'utf8'));
    const createdAt = Date.parse(manifest.createdAt);
    if (!Number.isFinite(createdAt) || createdAt > nowMs || nowMs - createdAt > maxBackupAgeMs) throw new Error('Backup overdue');
    const offsite = JSON.parse(await fs.readFile(configuration.INCEPT_LAST_OFFSITE_RECEIPT, 'utf8'));
    const verifiedAt = Date.parse(offsite.verifiedAt), backupCreatedAt = Date.parse(offsite.backupCreatedAt);
    if (offsite.version !== 1 || !/^[a-f0-9]{8,64}$/.test(offsite.snapshotId ?? '') ||
      ![verifiedAt, backupCreatedAt].every(time => Number.isFinite(time) && time <= nowMs && nowMs - time <= maxBackupAgeMs)) {
      throw new Error('Verified offsite backup overdue');
    }

    check = 'sync_504';
    const sync504 = await checkSync504(configuration, nowMs);

    check = 'snapshot_lag';
    const snapshotLag = await checkSnapshotLag(configuration, nowMs, deps);

    return {
      healthy: true,
      check: null,
      metrics: {
        diskFreePercent: Math.round(diskFreePercent * 10) / 10,
        backupAgeMinutes: Math.round((nowMs - createdAt) / 60_000),
        offsiteAgeMinutes: Math.round((nowMs - verifiedAt) / 60_000),
        ...(sync504 ? { sync504Count: sync504.sync504Count } : {}),
        ...(snapshotLag ? {
          ledgerRevision: snapshotLag.ledgerRevision,
          snapshotRevision: snapshotLag.snapshotRevision,
          snapshotLagRevisions: snapshotLag.lagRevisions,
          snapshotLagSeconds: snapshotLag.lagSeconds,
        } : {}),
      },
    };
  } catch {
    return { healthy: false, check, metrics: null };
  }
}

// A timer can turn a failing exit into the operator's configured alert channel.
async function main() {
  const result = await runProductionChecks(process.env);
  if (result.healthy) {
    console.log(JSON.stringify({ event: 'production_probe_ok', checks: result.metrics }));
  } else {
    console.error(JSON.stringify({ event: 'production_probe_failed', check: result.check }));
    process.exitCode = 1;
  }
  try {
    await notifyProbe(result.healthy, result.healthy ? null : result.check);
  } catch {
    console.error(JSON.stringify({ event: 'production_alert_failed' }));
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
