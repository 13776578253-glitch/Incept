import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DAILY_BACKUP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:\.\d+)?Z-[a-f0-9-]{36}$/;

function option(args, name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

export async function pruneServerBackups(backupRoot, { keep = 3, dryRun = false, requireLatestManifest = true } = {}) {
  if (!Number.isInteger(keep) || keep < 1) throw new Error('INVALID_KEEP_COUNT');
  const root = path.resolve(backupRoot);
  const entries = await fs.readdir(root, { withFileTypes: true });
  const daily = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !DAILY_BACKUP_PATTERN.test(entry.name)) continue;
    const fullPath = path.join(root, entry.name);
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(fullPath, 'manifest.json'), 'utf8'));
      const createdAtMs = Date.parse(manifest.createdAt);
      if (manifest.version !== 1 || !Number.isFinite(createdAtMs)) continue;
      daily.push({ name: entry.name, fullPath, createdAtMs });
    } catch {
      // Never prune unrecognized or incomplete directories automatically.
    }
  }
  if (requireLatestManifest && daily.length === 0) {
    throw new Error('NO_VERIFIED_DAILY_BACKUPS');
  }
  daily.sort((a, b) => b.createdAtMs - a.createdAtMs || b.name.localeCompare(a.name));
  const kept = daily.slice(0, keep);
  const expired = daily.slice(keep);
  if (!dryRun) {
    for (const item of expired) {
      await fs.rm(item.fullPath, { recursive: true, force: true });
    }
  }
  return {
    keep,
    dryRun,
    kept: kept.map((item) => item.name),
    removed: expired.map((item) => item.name),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const dir = option(args, '--dir');
  const keep = Number(option(args, '--keep') ?? '3');
  const dryRun = args.includes('--dry-run');
  if (!dir) {
    console.error(JSON.stringify({ event: 'backup_prune_failed', error: 'DIR_REQUIRED' }));
    process.exitCode = 1;
  } else {
    pruneServerBackups(dir, { keep, dryRun })
      .then((result) => console.log(JSON.stringify({ event: 'backup_pruned', ...result })))
      .catch((error) => {
        console.error(JSON.stringify({ event: 'backup_prune_failed', error: error instanceof Error ? error.message : String(error) }));
        process.exitCode = 1;
      });
  }
}
