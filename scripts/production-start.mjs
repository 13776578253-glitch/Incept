import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Fail before accepting traffic when the production runtime contract is incomplete.
function requireConfiguration() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major !== 24 || minor < 15) throw new Error('Node 24.15 or later on the 24 line is required.');
  if (process.env.NODE_ENV !== 'production') throw new Error('NODE_ENV must be production.');
  const key = process.env.INCEPT_AUTH_ENCRYPTION_KEY ?? '';
  if (!/^[a-fA-F0-9]{64}$/.test(key) || /^(.)\1+$/.test(key)) throw new Error('Configure a random Owner encryption key.');
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.username === 'postgres'
    || decodeURIComponent(url.password).length < 32) throw new Error('Configure a dedicated application database credential.');
  for (const key of ['INCEPT_DOCS_MEDIA_DIR', 'INCEPT_DOCS_DRAFTS_DIR', 'INCEPT_MUSIC_MEDIA_DIR', 'INCEPT_DASHBOARD_HOME']) {
    const directory = process.env[key];
    if (!directory || !path.isAbsolute(directory)) throw new Error(`Configure an absolute ${key}.`);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  for (const key of ['INCEPT_DASHBOARD_IMPORTS_FILE', 'INCEPT_DASHBOARD_CACHE_FILE']) {
    if (!process.env[key] || !path.isAbsolute(process.env[key])) throw new Error(`Configure an absolute ${key}.`);
  }
}

try { requireConfiguration(); }
catch { console.error(JSON.stringify({ event: 'production_configuration_invalid' })); process.exit(1); }

const child = spawn(process.execPath, ['apps/web/node_modules/next/dist/bin/next', 'start', 'apps/web',
  '--hostname', process.env.INCEPT_BIND_ADDRESS ?? '0.0.0.0', '--port', process.env.PORT ?? '3000'], { stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('error', () => { console.error(JSON.stringify({ event: 'web_process_start_failed' })); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = signal ? 0 : (code ?? 1); });
