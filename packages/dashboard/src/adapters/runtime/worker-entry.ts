import { parentPort, workerData } from 'node:worker_threads';
import { loadTokenDashboardData } from '../local/loader';
import type { UsageRange } from '../../domain';

parentPort?.on('message', async (job: { id: number; range: UsageRange; force: boolean }) => {
  try {
    const data = await loadTokenDashboardData({ range: job.range, force: job.force, home: workerData.home });
    parentPort?.postMessage({ id: job.id, data });
  } catch {
    parentPort?.postMessage({ id: job.id, error: 'Usage collection failed' });
  }
});
