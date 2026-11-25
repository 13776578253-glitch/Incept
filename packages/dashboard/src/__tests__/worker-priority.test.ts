import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: [] as Array<(job: unknown) => void>,
  posted: [] as Array<{ id: number; data?: unknown; error?: string }>,
  started: [] as number[],
  release: new Map<number, () => void>(),
}));
vi.mock('node:worker_threads', () => ({
  parentPort: { on: (_event: string, handler: (job: unknown) => void) => { mocks.handlers.push(handler); }, postMessage: (message: { id: number }) => { mocks.posted.push(message); } },
  workerData: { home: '/fixture' },
}));
vi.mock('../adapters/local/loader', () => ({
  loadTokenDashboardData: ({ range }: { range: string }) => {
    const id = Number(range.replace('job', ''));
    mocks.started.push(id);
    return new Promise(resolve => { mocks.release.set(id, () => resolve({ range })); });
  },
}));

beforeEach(() => {
  mocks.handlers.length = 0; mocks.posted.length = 0; mocks.started.length = 0; mocks.release.clear(); vi.resetModules();
});
const send = (id: number, flags: { force?: boolean; background?: boolean }) =>
  mocks.handlers[0]({ id, range: 'job' + id, force: !!flags.force, background: flags.background });
const finish = async (id: number) => { mocks.release.get(id)!(); await new Promise(resolve => setTimeout(resolve, 0)); };

describe('usage worker priority queue', () => {
  it('starts an interactive job immediately and drains it before queued background jobs', async () => {
    await import('../adapters/runtime/worker-entry');
    send(1, { background: true });
    send(2, { background: true });
    send(3, { force: true });
    expect(mocks.started).toEqual([1, 3]);
    await finish(3);
    expect(mocks.started).toEqual([1, 3]);
    await finish(1);
    expect(mocks.started).toEqual([1, 3, 2]);
    await finish(2);
    expect(mocks.posted.map(message => message.id)).toEqual([3, 1, 2]);
  });
  it('serializes interactive jobs and never lets two background jobs interleave', async () => {
    await import('../adapters/runtime/worker-entry');
    send(1, {}); send(2, {}); send(3, { background: true }); send(4, { background: true });
    expect(mocks.started).toEqual([1]);
    await finish(1);
    expect(mocks.started).toEqual([1, 2]);
    await finish(2);
    expect(mocks.started).toEqual([1, 2, 3]);
    await finish(3);
    expect(mocks.started).toEqual([1, 2, 3, 4]);
    await finish(4);
  });
});
