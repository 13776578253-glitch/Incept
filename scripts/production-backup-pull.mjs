import fs from 'node:fs/promises';
import { createReadStream, realpathSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const BACKUP_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:\.\d+)?Z-[a-f0-9-]{36}$/;
const ALLOWED_BACKUP_FILES = new Set(['database.dump', 'data.tar.gz', 'caddy.tar.gz', 'auth-key.json']);

function option(args, name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

export async function sha256File(filePath) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  return digest.digest('hex');
}

export async function verifyBackupDirectory(directory) {
  const manifestPath = path.join(directory, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.version !== 1 || typeof manifest.createdAt !== 'string' || !Number.isFinite(Date.parse(manifest.createdAt))) {
    throw new Error('INVALID_MANIFEST');
  }
  const hashes = manifest.sha256;
  if (!hashes || typeof hashes !== 'object') throw new Error('INVALID_MANIFEST_HASHES');
  const expectedFiles = Object.keys(hashes);
  if (!expectedFiles.includes('database.dump') || !expectedFiles.includes('data.tar.gz')) {
    throw new Error('MISSING_REQUIRED_BACKUP_FILES');
  }
  let totalBytes = (await fs.stat(manifestPath)).size;
  for (const name of expectedFiles) {
    if (!ALLOWED_BACKUP_FILES.has(name)) throw new Error(`UNEXPECTED_BACKUP_FILE:${name}`);
    const expected = hashes[name];
    if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) {
      throw new Error(`INVALID_SHA256:${name}`);
    }
    const target = path.join(directory, name);
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`INVALID_BACKUP_ENTRY:${name}`);
    const actual = await sha256File(target);
    if (actual !== expected) throw new Error(`CHECKSUM_MISMATCH:${name}`);
    totalBytes += stat.size;
  }
  return { manifest, files: expectedFiles, totalBytes };
}

async function directorySizeBytes(directory) {
  let bytes = 0;
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) bytes += await directorySizeBytes(full);
    else if (entry.isFile()) bytes += (await fs.stat(full)).size;
  }
  return bytes;
}

export async function pruneLocalBackups(destDir, { maxBytes, minKeep = 4, dryRun = false }) {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error('INVALID_MAX_BYTES');
  if (!Number.isInteger(minKeep) || minKeep < 1) throw new Error('INVALID_MIN_KEEP');
  const entries = await fs.readdir(destDir, { withFileTypes: true });
  const snapshots = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !BACKUP_DIR_PATTERN.test(entry.name)) continue;
    const fullPath = path.join(destDir, entry.name);
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(fullPath, 'manifest.json'), 'utf8'));
      const createdAtMs = Date.parse(manifest.createdAt);
      if (!Number.isFinite(createdAtMs)) continue;
      snapshots.push({ name: entry.name, fullPath, createdAtMs, bytes: await directorySizeBytes(fullPath) });
    } catch {
      // Ignore incomplete or non-manifest directories.
    }
  }
  snapshots.sort((a, b) => a.createdAtMs - b.createdAtMs || a.name.localeCompare(b.name));
  let totalBytes = snapshots.reduce((sum, item) => sum + item.bytes, 0);
  const removed = [];
  while (totalBytes > maxBytes && snapshots.length - removed.length > minKeep) {
    const oldest = snapshots[removed.length];
    if (!dryRun) await fs.rm(oldest.fullPath, { recursive: true, force: true });
    totalBytes -= oldest.bytes;
    removed.push({ name: oldest.name, bytes: oldest.bytes });
  }
  return {
    keptCount: snapshots.length - removed.length,
    totalBytes,
    removed,
  };
}

function runProcess(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} failed (${code}): ${stderr.trim() || stdout.trim()}`));
    });
  });
}

function buildSshArgs({ identity, port }) {
  const args = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=30'];
  if (identity) args.push('-i', identity);
  if (port) args.push('-p', String(port));
  return args;
}

function buildScpArgs({ identity, port }) {
  const args = ['-p', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=30'];
  if (identity) args.push('-i', identity);
  if (port) args.push('-P', String(port));
  return args;
}

async function main() {
  const args = process.argv.slice(2);
  const host = option(args, '--host') ?? process.env.INCEPT_BACKUP_SSH_HOST ?? 'root@43.155.136.83';
  const identity = option(args, '--identity') ?? process.env.INCEPT_BACKUP_SSH_KEY ?? path.join(os.homedir(), '.ssh', 'incept_ed25519');
  const port = option(args, '--port') ?? process.env.INCEPT_BACKUP_SSH_PORT;
  const deployRoot = option(args, '--remote-root') ?? '/srv/incept';
  const destDir = path.resolve(option(args, '--dest') ?? 'D:\\web-backup\\incept');
  const maxGib = Number(option(args, '--max-gib') ?? '50');
  const minKeep = Number(option(args, '--min-keep') ?? '4');
  const dryRun = args.includes('--dry-run');

  if (!Number.isFinite(maxGib) || maxGib < 1) throw new Error('INVALID_MAX_GIB');
  if (!Number.isInteger(minKeep) || minKeep < 1) throw new Error('INVALID_MIN_KEEP');
  const maxBytes = Math.floor(maxGib * 1024 * 1024 * 1024);

  await fs.mkdir(destDir, { recursive: true });
  const sshBase = buildSshArgs({ identity, port });
  const scpBase = buildScpArgs({ identity, port });

  const latestPathResult = await runProcess('ssh', [...sshBase, host, `cat ${deployRoot}/latest-backup-path`]);
  const remoteManifestPath = latestPathResult.stdout.trim();
  const remoteBackupDir = path.posix.dirname(remoteManifestPath);
  const backupName = path.posix.basename(remoteBackupDir);
  if (!BACKUP_DIR_PATTERN.test(backupName) || path.posix.basename(remoteManifestPath) !== 'manifest.json') {
    throw new Error(`INVALID_REMOTE_BACKUP_PATH:${remoteManifestPath}`);
  }

  const finalDir = path.join(destDir, backupName);
  let alreadyPresent = false;
  try {
    const existing = await verifyBackupDirectory(finalDir);
    alreadyPresent = true;
    const pruned = await pruneLocalBackups(destDir, { maxBytes, minKeep, dryRun });
    const summary = {
      event: 'backup_already_present',
      backup: backupName,
      createdAt: existing.manifest.createdAt,
      bytes: existing.totalBytes,
      keptCount: pruned.keptCount,
      localTotalBytes: pruned.totalBytes,
      maxBytes,
      removed: pruned.removed,
      checkedAt: new Date().toISOString(),
    };
    if (!dryRun) {
      await fs.writeFile(path.join(destDir, 'latest-pull-status.json'), JSON.stringify(summary, null, 2));
    }
    console.log(JSON.stringify(summary, null, 2));
    return;
  } catch {
    // Missing or incomplete local copy; proceed with fresh download.
  }

  if (dryRun) {
    console.log(JSON.stringify({ event: 'backup_pull_dry_run', host, remoteBackupDir, finalDir, maxBytes, minKeep }, null, 2));
    return;
  }

  const stagingDir = path.join(destDir, `.staging-${backupName}-${randomUUID()}`);
  await fs.mkdir(stagingDir, { recursive: true });
  try {
    await runProcess('scp', [...scpBase, `${host}:${remoteManifestPath}`, path.join(stagingDir, 'manifest.json')]);
    const manifest = JSON.parse(await fs.readFile(path.join(stagingDir, 'manifest.json'), 'utf8'));
    if (manifest.version !== 1 || !manifest.sha256 || typeof manifest.sha256 !== 'object') {
      throw new Error('INVALID_REMOTE_MANIFEST');
    }
    const filesToPull = Object.keys(manifest.sha256);
    for (const fileName of filesToPull) {
      if (!ALLOWED_BACKUP_FILES.has(fileName)) throw new Error(`UNEXPECTED_REMOTE_FILE:${fileName}`);
      await runProcess('scp', [...scpBase, `${host}:${path.posix.join(remoteBackupDir, fileName)}`, path.join(stagingDir, fileName)]);
    }
    const verified = await verifyBackupDirectory(stagingDir);
    await fs.rm(finalDir, { recursive: true, force: true });
    await fs.rename(stagingDir, finalDir);
    const pruned = await pruneLocalBackups(destDir, { maxBytes, minKeep, dryRun: false });
    const summary = {
      event: 'backup_pulled_and_verified',
      backup: backupName,
      createdAt: verified.manifest.createdAt,
      image: verified.manifest.image ?? null,
      files: verified.files,
      bytes: verified.totalBytes,
      alreadyPresent,
      keptCount: pruned.keptCount,
      localTotalBytes: pruned.totalBytes,
      maxBytes,
      removed: pruned.removed,
      pulledAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(destDir, 'latest-pull-status.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    await fs.rm(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ event: 'backup_pull_failed', error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  });
}
