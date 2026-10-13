import 'server-only';
import { Worker } from 'node:worker_threads';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { TokenDashboardData, UsageRange } from '../../domain';

function workerFile() {
  if (process.env.INCEPT_DASHBOARD_WORKER_FILE) return resolve(process.env.INCEPT_DASHBOARD_WORKER_FILE);
  let directory = process.cwd();
  while (true) {
    for (const path of [join(directory, 'packages/dashboard/dist/dashboard-usage-worker.mjs'),
      join(directory, 'node_modules/@incept/dashboard/dist/dashboard-usage-worker.mjs')]) if (existsSync(path)) return path;
    if (dirname(directory) === directory) throw new Error('Dashboard worker is missing; run dashboard:build-runtime');
    directory = dirname(directory);
  }
}
type Pending = { resolve: (data: TokenDashboardData) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
let worker: Worker | undefined, currentHome = '', nextId = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
const pending = new Map<number, Pending>();
function stop(error: Error) {
  clearTimeout(idleTimer);
  const previous = worker; worker = undefined;
  for (const job of pending.values()) { clearTimeout(job.timer); job.reject(error); }
  pending.clear(); void previous?.terminate();
}
export function collectInWorker(home: string, range: UsageRange, force: boolean): Promise<TokenDashboardData> {
  const file = workerFile();
  const source = JSON.stringify([home, process.cwd(), process.env.INCEPT_DASHBOARD_IMPORTS_FILE,
    process.env.INCEPT_DASHBOARD_OVERRIDES_FILE, process.env.INCEPT_COMMANDCODE_CATALOG_FILE, process.env.INCEPT_DASHBOARD_CCUSAGE_BIN,
    file, statSync(file).mtimeMs]);
  if (worker && currentHome !== source) stop(new Error('Dashboard source changed'));
  if (!worker) {
    currentHome = source;
    // This file is bundled separately. Prevent Turbopack from interpreting the
    // runtime filesystem lookup as a glob of application worker entry points.
    const instance = Reflect.construct(Worker, [file, { workerData: { home } }]) as Worker;
    worker = instance;
    instance.on('message', (message: { id: number; data?: TokenDashboardData; error?: string }) => {
      const job = pending.get(message.id); if (!job) return;
      clearTimeout(job.timer); pending.delete(message.id);
      if (message.data) job.resolve(message.data); else job.reject(new Error(message.error ?? 'Usage collection failed'));
      if (!pending.size) { idleTimer = setTimeout(() => stop(new Error('Usage worker idle')), 5 * 60_000); idleTimer.unref(); }
    });
    instance.on('error', () => { if (worker === instance) stop(new Error('Usage worker failed')); });
    instance.on('exit', () => { if (worker === instance) stop(new Error('Usage worker stopped')); });
    instance.unref();
  }
  const instance = worker, id = ++nextId;
  clearTimeout(idleTimer);
  return new Promise((resolveJob, reject) => {
    const timer = setTimeout(() => { if (worker === instance) stop(new Error('Usage collection timed out')); }, 90_000);
    timer.unref();
    pending.set(id, { resolve: resolveJob, reject, timer });
    instance.postMessage({ id, range, force });
  });
}
export function closeUsageWorker() { stop(new Error('Usage worker closed')); }
