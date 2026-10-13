import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Back up only a quiescent deployment; database bytes never pass through a text shell pipe.
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
function option(name) { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; }
const envFile = option('--env-file');
if (!envFile) throw new Error('--env-file is required.');
process.loadEnvFile(path.resolve(envFile));
const project = option('--project') ?? 'incept';
const database = process.env.INCEPT_DATABASE_NAME ?? 'incept';
if (!/^[a-z][a-z0-9_]*$/.test(database)) throw new Error('Invalid database name.');
if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(project)) throw new Error('Invalid project name.');
const compose = ['compose', '--project-name', project, '--env-file', path.resolve(envFile), '-f', path.join(root, 'deployment/compose.production.yml')];
async function docker(arguments_, input, output) {
  const child = spawn('docker', [...compose, ...arguments_], { stdio: ['pipe', 'pipe', 'pipe'] });
  let text = '', errors = '';
  const exited = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.stderr.on('data', value => { errors += value; });
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`Docker operation failed (${code}); inspect the target deployment logs.`)));
  });
  const tasks = [exited];
  if (output) tasks.push(pipeline(child.stdout, createWriteStream(output, { flags: 'wx', mode: 0o600 })));
  else child.stdout.on('data', value => { text += value; });
  if (input) tasks.push(pipeline(createReadStream(input), child.stdin)); else child.stdin.end();
  await Promise.all(tasks);
  return text.trim();
}
async function checksum(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
async function tar(arguments_) {
  const child = spawn('tar', arguments_, { stdio: ['ignore', 'pipe', 'pipe'] });
  let text = '';
  child.stdout.on('data', value => { text += value; });
  child.stderr.resume();
  await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error('Archive operation failed.'))); });
  return text;
}

async function main() {
  if (await docker(['ps', '--status', 'running', '--quiet', 'app'])) throw new Error('Stop the app and all authoring CLIs before backup or restore.');
  const data = path.resolve(process.env.INCEPT_DATA_DIR ?? '');
  if (!process.env.INCEPT_DATA_DIR || data === path.parse(data).root || (await fs.lstat(data)).isSymbolicLink()) throw new Error('Invalid persistent directory.');
  if (args.includes('--restore')) {
    if (!args.includes('--confirm-empty-target')) throw new Error('Restore requires --confirm-empty-target.');
    const backup = path.resolve(option('--restore'));
    const manifest = JSON.parse(await fs.readFile(path.join(backup, 'manifest.json'), 'utf8'));
    if (manifest.version !== 1) throw new Error('Unsupported backup.');
    for (const name of ['database.dump', 'data.tar.gz']) if (await checksum(path.join(backup, name)) !== manifest.sha256[name]) throw new Error('Backup checksum mismatch.');
    if ((await fs.readdir(data)).length) throw new Error('Restore data directory must be empty.');
    const tables = await docker(['exec', '-T', 'postgres', 'psql', '-U', 'incept_migrator', '-d', database, '-Atc', "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"]);
    if (tables !== '0') throw new Error('Restore database must be empty.');
    const entries = (await tar(['-tzf', path.join(backup, 'data.tar.gz')])).split('\n').filter(Boolean);
    if (entries.some(entry => path.posix.isAbsolute(entry) || entry.split('/').includes('..') || entry.includes('\\'))) throw new Error('Unsafe archive path.');
    const verbose = await tar(['-tvzf', path.join(backup, 'data.tar.gz')]);
    if (verbose.split('\n').some(entry => /^[lh]/.test(entry))) throw new Error('Restore archive must not contain links.');
    const staging = `${data}.restore-${randomUUID()}`;
    await fs.mkdir(staging, { mode: 0o700 });
    await tar(['-xzf', path.join(backup, 'data.tar.gz'), '-C', staging]);
    await docker(['exec', '-T', 'postgres', 'pg_restore', '-U', 'incept_migrator', '-d', database, '--no-owner', '--no-privileges', '--exit-on-error'], path.join(backup, 'database.dump'));
    await docker(['exec', '-T', 'postgres', 'psql', '-U', 'incept_migrator', '-d', database, '-v', 'ON_ERROR_STOP=1', '-c',
      'GRANT USAGE ON SCHEMA public TO incept_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO incept_app; GRANT USAGE,SELECT,UPDATE ON ALL SEQUENCES IN SCHEMA public TO incept_app;']);
    await fs.rmdir(data);
    await fs.rename(staging, data);
    console.log(JSON.stringify({ event: 'restore_complete', image: manifest.image }));
    return;
  }
  const destination = path.resolve(option('--output') ?? path.join(root, 'output/backups'));
  const relative = path.relative(data, destination);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) throw new Error('Backups must live outside the data directory.');
  const backup = path.join(destination, `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`);
  await fs.mkdir(backup, { recursive: true, mode: 0o700 });
  await docker(['exec', '-T', 'postgres', 'pg_dump', '-U', 'incept_migrator', '-d', database, '-Fc'], undefined, path.join(backup, 'database.dump'));
  await tar(['-czf', path.join(backup, 'data.tar.gz'), '-C', data, '.']);
  const hashes = {};
  for (const name of ['database.dump', 'data.tar.gz']) hashes[name] = await checksum(path.join(backup, name));
  await fs.writeFile(path.join(backup, 'manifest.json'), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), image: process.env.INCEPT_APP_IMAGE, sha256: hashes }, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ event: 'backup_complete', directory: backup }));
}
main().catch(() => { console.error(JSON.stringify({ event: 'backup_or_restore_failed' })); process.exitCode = 1; });
