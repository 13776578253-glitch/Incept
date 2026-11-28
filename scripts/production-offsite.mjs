import fs from 'node:fs/promises';
import { createReadStream, realpathSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Upload only verified completed backups; remote retention is scoped to this application's host/tag.
const arguments_ = process.argv.slice(2);
function option(name) { const index = arguments_.indexOf(name); return index < 0 ? undefined : arguments_[index + 1]; }
let phase = 'configuration';
let activeChild = null;
const startedAt = Date.now();
let phaseStartedAt = startedAt;
const phaseDurationsMs = {};
function logPhaseEvent(event, extra = {}) {
  console.error(JSON.stringify({ event, phase, ...extra }));
}
async function runPhase(name, fn) {
  phase = name;
  phaseStartedAt = Date.now();
  logPhaseEvent('offsite_phase_start');
  const result = await fn();
  const durationMs = Date.now() - phaseStartedAt;
  phaseDurationsMs[name] = durationMs;
  logPhaseEvent('offsite_phase_complete', { durationMs });
  return result;
}
async function digest(file) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}
async function runCommand(binary, command, configuration, { streamStderr = false } = {}) {
  const child = spawn(binary, command, { env: configuration, stdio: ['ignore', 'pipe', 'pipe'] });
  activeChild = child;
  let output = '';
  let errors = '';
  child.stdout.on('data', bytes => { output += bytes; });
  child.stderr.on('data', bytes => {
    const chunk = bytes.toString('utf8');
    if (errors.length < 4096) errors += chunk.slice(0, 4096 - errors.length);
    if (streamStderr) process.stderr.write(chunk);
  });
  try {
    await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code, signal) => code === 0 ? resolve() : reject(new Error(`${binary} operation failed (${code ?? signal}): ${errors.trim()}`)));
    });
    return output;
  } finally {
    if (activeChild === child) activeChild = null;
  }
}
async function restic(command, configuration, options_ = {}) {
  const options = [];
  if (configuration.RESTIC_SFTP_COMMAND) options.push('-o', `sftp.command=${configuration.RESTIC_SFTP_COMMAND}`);
  if (configuration.INCEPT_RESTIC_RCLONE_ARGS) options.push('-o', `rclone.args=${configuration.INCEPT_RESTIC_RCLONE_ARGS}`);
  if (configuration.INCEPT_RESTIC_RCLONE_CONNECTIONS) options.push('-o', `rclone.connections=${configuration.INCEPT_RESTIC_RCLONE_CONNECTIONS}`);
  return runCommand(configuration.INCEPT_RESTIC_BIN ?? 'restic', [...options, ...command], configuration, { streamStderr: true, ...options_ });
}
export function backupArgs(uploadTarget, host, stagedUncompressed) {
  return [
    'backup', uploadTarget,
    '--tag', 'incept-production',
    '--host', host,
    ...(stagedUncompressed ? ['--ignore-inode', '--ignore-ctime'] : []),
    '--json',
  ];
}
async function extractStage(backup, manifest, stageRoot, configuration) {
  const stageDir = path.resolve(stageRoot);
  if (stageDir === path.parse(stageDir).root) throw new Error('Invalid staging directory.');
  await fs.rm(stageDir, { recursive: true, force: true });
  await fs.mkdir(path.join(stageDir, 'data'), { recursive: true, mode: 0o700 });
  await runCommand('tar', ['-xzf', path.join(backup, 'data.tar.gz'), '-C', path.join(stageDir, 'data')], configuration);
  if (manifest.sha256['caddy.tar.gz']) {
    await fs.mkdir(path.join(stageDir, 'caddy'), { recursive: true, mode: 0o700 });
    await runCommand('tar', ['-xzf', path.join(backup, 'caddy.tar.gz'), '-C', path.join(stageDir, 'caddy')], configuration);
  }
  await fs.copyFile(path.join(backup, 'database.dump'), path.join(stageDir, 'database.dump'));
  await fs.copyFile(path.join(backup, 'manifest.json'), path.join(stageDir, 'manifest.json'));
  if (manifest.sha256['auth-key.json']) {
    await fs.copyFile(path.join(backup, 'auth-key.json'), path.join(stageDir, 'auth-key.json'));
    if (process.platform !== 'win32') await fs.chmod(path.join(stageDir, 'auth-key.json'), 0o600);
  }
  return stageDir;
}
export function checkCommand(configuration, now = new Date()) {
  const mode = (option('--check-mode') ?? configuration.INCEPT_RESTIC_CHECK_MODE ?? 'full').trim().toLowerCase();
  const subset = (option('--check-subset') ?? configuration.INCEPT_RESTIC_CHECK_SUBSET ?? '5%').trim();
  if (mode === 'metadata') return ['check'];
  if (mode === 'subset') return ['check', `--read-data-subset=${subset}`];
  if (mode === 'auto') {
    const isWeeklyAuditDay = now.getUTCDay() === 0;
    return isWeeklyAuditDay ? ['check', `--read-data-subset=${subset}`] : ['check'];
  }
  return ['check', '--read-data'];
}
export function retentionArgs(configuration, host) {
  const base = ['forget', '--host', host, '--tag', 'incept-production', '--group-by', 'host'];
  const daily = configuration.INCEPT_RESTIC_KEEP_DAILY;
  const weekly = configuration.INCEPT_RESTIC_KEEP_WEEKLY;
  const monthly = configuration.INCEPT_RESTIC_KEEP_MONTHLY;
  if (daily || weekly || monthly) {
    if (daily) base.push('--keep-daily', String(daily));
    if (weekly) base.push('--keep-weekly', String(weekly));
    if (monthly) base.push('--keep-monthly', String(monthly));
    base.push('--prune');
    return base;
  }
  return [...base, '--keep-within', '14d', '--keep-last', '2', '--prune'];
}
async function main() {
  const envFile = option('--env-file'), backupPath = option('--backup');
  if (!envFile || !backupPath) throw new Error('Specify the backup and backup configuration file.');
  process.loadEnvFile(path.resolve(envFile));
  const configuration = { ...process.env };
  const repository = configuration.RESTIC_REPOSITORY;
  if (!repository || !configuration.RESTIC_PASSWORD_FILE) throw new Error('Configure an encrypted repository and password file.');
  if (/^(rest|s3):http:\/\//.test(repository)) throw new Error('HTTP remote repositories must use HTTPS.');
  const credential = path.resolve(configuration.RESTIC_PASSWORD_FILE);
  const credentialStat = await fs.lstat(credential);
  if (credentialStat.isSymbolicLink() || !credentialStat.isFile()) throw new Error('Password file must be a regular private file.');
  if (process.platform !== 'win32' && ((await fs.stat(credential)).mode & 0o077)) throw new Error('Password file permissions must be private.');
  const secret = (await fs.readFile(credential, 'utf8')).trim();
  if (secret.length < 32 || /^(.)\1+$/.test(secret) || /change|example|placeholder/i.test(secret)) throw new Error('Configure a strong independent backup password.');
  const host = configuration.INCEPT_BACKUP_HOST_ID;
  if (!host || !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(host)) throw new Error('Configure a stable backup host identifier.');
  const backup = await fs.realpath(path.resolve(backupPath));
  const manifest = JSON.parse(await fs.readFile(path.join(backup, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || !Number.isFinite(Date.parse(manifest.createdAt)) || Date.parse(manifest.createdAt) > Date.now()) throw new Error('Invalid completed backup manifest.');
  for (const name of ['database.dump', 'data.tar.gz', ...(manifest.sha256['caddy.tar.gz'] ? ['caddy.tar.gz'] : []), ...(manifest.sha256['auth-key.json'] ? ['auth-key.json'] : [])]) {
    const file = path.join(backup, name);
    if ((await fs.lstat(file)).isSymbolicLink() || !/^[a-f0-9]{64}$/.test(manifest.sha256?.[name] ?? '') || await digest(file) !== manifest.sha256[name]) throw new Error('Backup validation failed.');
  }
  const fingerprint = createHash('sha256').update(repository).digest('hex');
  if (arguments_.includes('--init')) await runPhase('repository_initialization', () => restic(['init'], configuration));
  if (arguments_.includes('--unlock-stale') || configuration.INCEPT_RESTIC_UNLOCK_STALE === '1') {
    await runPhase('unlock_stale_locks', () => restic(['unlock'], configuration));
  }
  const stageRoot = option('--stage-dir') ?? configuration.INCEPT_OFFSITE_STAGE_DIR;
  let uploadTarget = backup;
  let stagedDir;
  let interrupted = false;
  const onSignal = signal => {
    if (interrupted) return;
    interrupted = true;
    logPhaseEvent('offsite_backup_interrupted', {
      signal,
      phaseElapsedMs: Date.now() - phaseStartedAt,
      totalElapsedMs: Date.now() - startedAt,
    });
    try { activeChild?.kill('SIGTERM'); } catch { /* Best-effort child termination. */ }
  };
  process.once('SIGTERM', onSignal);
  process.once('SIGINT', onSignal);
  try {
    if (stageRoot) {
      stagedDir = await runPhase('staging_uncompressed_snapshot', () => extractStage(backup, manifest, stageRoot, configuration));
      uploadTarget = stagedDir;
    }
    const output = await runPhase('encrypted_upload', () => restic(backupArgs(uploadTarget, host, Boolean(stagedDir)), configuration));
    const summary = output.split('\n').filter(Boolean).map(line => JSON.parse(line)).find(item => item.message_type === 'summary');
    if (!/^[a-f0-9]{8,64}$/.test(summary?.snapshot_id ?? '')) throw new Error('No complete encrypted snapshot was acknowledged.');
    const checkArgs = checkCommand(configuration);
    await runPhase('repository_verification', () => restic(checkArgs, configuration));
    let repoRawBytes = null;
    try {
      const statsOutput = await runPhase('repository_stats', () => restic(['stats', '--mode', 'raw-data', '--json'], configuration));
      const parsedStats = JSON.parse(statsOutput);
      if (Number.isFinite(parsedStats?.total_size)) repoRawBytes = parsedStats.total_size;
    } catch {
      // Non-fatal metadata query.
    }
    const warnGib = Number(configuration.INCEPT_OFFSITE_WARN_GIB ?? '220');
    const capWarning = repoRawBytes !== null && Number.isFinite(warnGib) && repoRawBytes > warnGib * 1024 * 1024 * 1024;
    const receipt = {
      version: 1, repositoryFingerprint: fingerprint, host, snapshotId: summary.snapshot_id,
      verifiedAt: new Date().toISOString(), backupCreatedAt: manifest.createdAt, backupSha256: manifest.sha256,
      stagedUncompressed: Boolean(stagedDir), checkArgs, dataAddedBytes: summary.data_added ?? null,
      repoRawBytes, capWarning,
    };
    const temporary = path.join(backup, `.offsite-${randomUUID()}.tmp`);
    try { await fs.writeFile(temporary, JSON.stringify(receipt, null, 2), { flag: 'wx', mode: 0o600 }); await fs.rename(temporary, path.join(backup, 'offsite-receipt.json')); }
    finally { await fs.rm(temporary, { force: true }); }
    if (arguments_.includes('--apply-retention')) {
      await runPhase('scoped_remote_retention', () => restic(retentionArgs(configuration, host), configuration));
    }
    console.log(JSON.stringify({
      event: 'encrypted_backup_verified',
      snapshotId: summary.snapshot_id,
      stagedUncompressed: Boolean(stagedDir),
      checkArgs,
      dataAddedBytes: summary.data_added ?? null,
      repoRawBytes,
      capWarning,
      retentionApplied: arguments_.includes('--apply-retention'),
      phaseDurationsMs,
      totalDurationMs: Date.now() - startedAt,
    }));
  } finally {
    process.off('SIGTERM', onSignal);
    process.off('SIGINT', onSignal);
    if (stagedDir) await fs.rm(stagedDir, { recursive: true, force: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch(() => { console.error(JSON.stringify({ event: 'offsite_backup_failed', phase })); process.exitCode = 1; });
}
