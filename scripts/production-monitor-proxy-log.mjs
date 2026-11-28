import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function isSyncRoute(uri) {
  return uri === '/api/dashboard/sync' || (typeof uri === 'string' && uri.startsWith('/api/dashboard/sync/'));
}

export function summarizeCaddySync504Logs(logText, nowMs = Date.now(), windowMinutes = 15) {
  const cutoffMs = nowMs - windowMinutes * 60_000;
  let sync504Count = 0;
  let last504Ms = null;
  for (const rawLine of logText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('{')) continue;
    let entry;
    try { entry = JSON.parse(line); }
    catch { continue; }
    if (entry.status !== 504) continue;
    const uri = entry.safe_uri ?? entry.request?.uri;
    if (!isSyncRoute(uri)) continue;
    const tsNumber = Number(entry.ts);
    if (!Number.isFinite(tsNumber)) continue;
    const tsMs = tsNumber > 1e12 ? tsNumber : tsNumber * 1000;
    if (tsMs < cutoffMs || tsMs > nowMs + 60_000) continue;
    sync504Count += 1;
    if (last504Ms === null || tsMs > last504Ms) last504Ms = tsMs;
  }
  return {
    version: 1,
    collectedAt: new Date(nowMs).toISOString(),
    windowMinutes,
    sync504Count,
    last504At: last504Ms === null ? null : new Date(last504Ms).toISOString(),
  };
}

async function main() {
  const outputFile = process.env.INCEPT_SYNC_504_SUMMARY_FILE;
  if (!outputFile) return;
  if (!path.isAbsolute(outputFile)) throw new Error('INCEPT_SYNC_504_SUMMARY_FILE must be an absolute path.');
  const container = process.env.INCEPT_PROXY_CONTAINER ?? 'incept-proxy-1';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(container)) throw new Error('Invalid proxy container name.');
  const windowMinutes = Number(process.env.INCEPT_SYNC_504_WINDOW_MINUTES ?? '15');
  if (!Number.isFinite(windowMinutes) || windowMinutes < 1 || windowMinutes > 1440) {
    throw new Error('Invalid INCEPT_SYNC_504_WINDOW_MINUTES.');
  }
  const { stdout, stderr } = await execFileAsync(
    'docker',
    ['logs', '--since', `${Math.ceil(windowMinutes)}m`, container],
    { maxBuffer: 16 * 1024 * 1024, timeout: 10_000 },
  );
  const summary = {
    ...summarizeCaddySync504Logs(`${stdout}\n${stderr}`, Date.now(), windowMinutes),
    container,
  };
  await fs.mkdir(path.dirname(outputFile), { recursive: true, mode: 0o700 });
  const tempFile = `${outputFile}.${randomUUID()}.tmp`;
  try {
    // Monitor directory is 0700 owned by the monitor user; 0644 lets that user read without root/docker access.
    await fs.writeFile(tempFile, `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx', mode: 0o644 });
    await fs.rename(tempFile, outputFile);
  } finally {
    await fs.rm(tempFile, { force: true });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(() => {
    console.error(JSON.stringify({ event: 'production_proxy_log_extract_failed' }));
    process.exitCode = 1;
  });
}
