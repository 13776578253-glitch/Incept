import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

// Upload only verified completed backups; remote retention is scoped to this application's host/tag.
const arguments_ = process.argv.slice(2);
function option(name) { const index = arguments_.indexOf(name); return index < 0 ? undefined : arguments_[index + 1]; }
let phase = 'configuration';
async function digest(file) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}
async function restic(command, configuration) {
  const options = configuration.RESTIC_SFTP_COMMAND ? ['-o', `sftp.command=${configuration.RESTIC_SFTP_COMMAND}`] : [];
  const child = spawn(configuration.INCEPT_RESTIC_BIN ?? 'restic', [...options, ...command], { env: configuration, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', bytes => { output += bytes; }); child.stderr.resume();
  await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error('Encrypted repository operation failed.'))); });
  return output;
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
  if (arguments_.includes('--init')) { phase = 'repository_initialization'; await restic(['init'], configuration); }
  phase = 'encrypted_upload';
  const output = await restic(['backup', backup, '--tag', 'incept-production', '--host', host, '--json'], configuration);
  const summary = output.split('\n').filter(Boolean).map(line => JSON.parse(line)).find(item => item.message_type === 'summary');
  if (!/^[a-f0-9]{8,64}$/.test(summary?.snapshot_id ?? '')) throw new Error('No complete encrypted snapshot was acknowledged.');
  phase = 'repository_verification';
  await restic(['check', '--read-data'], configuration);
  const receipt = { version: 1, repositoryFingerprint: fingerprint, host, snapshotId: summary.snapshot_id,
    verifiedAt: new Date().toISOString(), backupCreatedAt: manifest.createdAt, backupSha256: manifest.sha256 };
  const temporary = path.join(backup, `.offsite-${randomUUID()}.tmp`);
  try { await fs.writeFile(temporary, JSON.stringify(receipt, null, 2), { flag: 'wx', mode: 0o600 }); await fs.rename(temporary, path.join(backup, 'offsite-receipt.json')); }
  finally { await fs.rm(temporary, { force: true }); }
  if (arguments_.includes('--apply-retention')) {
    phase = 'scoped_remote_retention';
    await restic(['forget', '--host', host, '--tag', 'incept-production', '--group-by', 'host',
      '--keep-within', '14d', '--keep-last', '2', '--prune'], configuration);
  }
  console.log(JSON.stringify({ event: 'encrypted_backup_verified', snapshotId: summary.snapshot_id, retentionApplied: arguments_.includes('--apply-retention') }));
}
main().catch(() => { console.error(JSON.stringify({ event: 'offsite_backup_failed', phase })); process.exitCode = 1; });
