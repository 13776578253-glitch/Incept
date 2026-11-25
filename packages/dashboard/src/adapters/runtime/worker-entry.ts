import { parentPort, workerData } from 'node:worker_threads';
import { loadTokenDashboardData } from '../local/loader';
import type { UsageRange } from '../../domain';

type Job = { id: number; range: UsageRange; force: boolean; background?: boolean };

// Interactive and forced jobs never wait behind background revalidation or sibling pre-warming.
// Each class is serialized; a background job paused at an await only holds an immutable snapshot,
// so an interactive job may start immediately. Background work resumes once the interactive queue drains.
const interactive: Job[] = [];
const background: Job[] = [];
let runningInteractive = false, runningBackground = false;

async function run(job: Job) {
  try {
    const data = await loadTokenDashboardData({ range: job.range, force: job.force, home: workerData.home });
    parentPort?.postMessage({ id: job.id, data });
  } catch {
    parentPort?.postMessage({ id: job.id, error: 'Usage collection failed' });
  }
}

function pump() {
  if (!runningInteractive && interactive.length) {
    runningInteractive = true;
    void run(interactive.shift()!).finally(() => { runningInteractive = false; pump(); });
  }
  if (!runningInteractive && !interactive.length && !runningBackground && background.length) {
    runningBackground = true;
    void run(background.shift()!).finally(() => { runningBackground = false; pump(); });
  }
}

parentPort?.on('message', (job: Job) => {
  (job.background && !job.force ? background : interactive).push(job);
  pump();
});
