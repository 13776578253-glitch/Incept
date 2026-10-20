import fs from 'node:fs/promises';
import { notifyProbe } from './production-alert.mjs';

// A timer can turn a failing exit into the operator's configured alert channel.
const url = process.env.INCEPT_HEALTH_URL;
let check = 'configuration';
let healthy = false;
try {
  if (!url || new URL(url).protocol !== 'https:') throw new Error('Missing HTTPS probe URL');
  check = 'health';
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5_000) });
  if (!response.ok || (await response.json()).status !== 'ready') throw new Error('Service unavailable');
  check = 'disk';
  const storage = await fs.statfs(process.env.INCEPT_DATA_DIR);
  const minimumFreePercent = Number(process.env.INCEPT_DISK_MIN_FREE_PERCENT ?? '15');
  if (!Number.isFinite(minimumFreePercent) || minimumFreePercent < 15 || minimumFreePercent > 100) throw new Error('Invalid disk threshold');
  if (!(Number(storage.blocks) > 0) || Number(storage.bavail) / Number(storage.blocks) * 100 < minimumFreePercent) throw new Error('Low disk space');
  check = 'backup';
  const manifest = JSON.parse(await fs.readFile(process.env.INCEPT_LAST_BACKUP_MANIFEST, 'utf8'));
  const createdAt = Date.parse(manifest.createdAt);
  if (!Number.isFinite(createdAt) || createdAt > Date.now() || Date.now() - createdAt > 24 * 60 * 60_000) throw new Error('Backup overdue');
  const offsite = JSON.parse(await fs.readFile(process.env.INCEPT_LAST_OFFSITE_RECEIPT, 'utf8'));
  const verifiedAt = Date.parse(offsite.verifiedAt), backupCreatedAt = Date.parse(offsite.backupCreatedAt);
  if (offsite.version !== 1 || !/^[a-f0-9]{8,64}$/.test(offsite.snapshotId ?? '') ||
    ![verifiedAt, backupCreatedAt].every(time => Number.isFinite(time) && time <= Date.now() && Date.now() - time <= 24 * 60 * 60_000)) throw new Error('Verified offsite backup overdue');
  healthy = true;
  console.log(JSON.stringify({ event: 'production_probe_ok' }));
} catch {
  console.error(JSON.stringify({ event: 'production_probe_failed', check }));
  process.exitCode = 1;
}
try { await notifyProbe(healthy, healthy ? null : check); }
catch { console.error(JSON.stringify({ event: 'production_alert_failed' })); process.exitCode = 1; }
