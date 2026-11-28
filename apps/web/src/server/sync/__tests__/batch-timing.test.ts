// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
vi.mock('server-only', () => ({}));
import { SyncExecutor } from '@incept/dashboard/sync';
import { createSyncHandler, type SyncBatchTimingLog } from '../controller';
import { fromEvents } from '../../../../../../packages/dashboard/src/__tests__/phase1/fixtures';
import { hash } from '../../../../../../packages/dashboard/src/adapters/local/imports/identity';

const deviceId = '00000000-0000-4000-8000-000000000099';
const ownerActor = { role: 'owner' as const, subject: 'owner', reason: 'timing test' };

let dir: string;
let executor: SyncExecutor;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sync-batch-timing-'));
  executor = new SyncExecutor(join(dir, 'v4.db'), { trusted: true });
});

afterEach(async () => {
  await executor?.close();
  rmSync(dir, { recursive: true, force: true });
});

it('logs queue wait and execution timing for begin, stage, and commit with correlated X-Request-ID', async () => {
  const scope = { deviceId, source: 'claudeCode' as const, sessionId: 'timing-session', originId: 'timing-origin' };
  await executor.execute({ op: 'register', scope, label: 'Timing Fixture', actor: ownerActor });

  const candidate = fromEvents([
    {
      eventId: hash('timing-event-1'),
      source: scope.source,
      sessionId: scope.sessionId,
      timestampMs: Date.UTC(2026, 10, 27, 12, 0, 0),
      modelName: 'phase0-fixture-model',
      projectKey: 'synthetic',
      projectName: 'Synthetic',
      inputTokens: 120,
      outputTokens: 30,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      reasoningTokens: 0,
    },
  ], scope, undefined, 'timing-batch-1');

  const logs: SyncBatchTimingLog[] = [];
  const handler = createSyncHandler({
    executor,
    enabled: () => true,
    owner: async () => ({ sessionId: 'owner-session', ownerId: 'owner' }),
    authenticate: async () => ({
      deviceId,
      ownerAccountId: 'owner',
      version: 1,
      allowedSources: ['claudeCode'],
      name: 'Timing Fixture',
    }),
    onBatchTiming: entry => { logs.push(entry); },
  });

  // Hold the single worker briefly to verify queueWaitMs and runningOpAtEnqueue.
  let releaseBlocker!: () => void;
  const blocker = executor.execute(
    { op: 'capacity', actor: ownerActor },
    () => new Promise<void>(resolve => { releaseBlocker = resolve; }),
  );
  await new Promise(resolve => setTimeout(resolve, 25));

  const beginPromise = handler(new Request('http://localhost/api/dashboard/sync/batches', {
    method: 'POST',
    headers: {
      authorization: 'Bearer synthetic-token',
      'content-type': 'application/json',
      'x-request-id': 'req-begin-001',
    },
    body: JSON.stringify({ header: candidate.header }),
  }));
  await new Promise(resolve => setTimeout(resolve, 40));
  releaseBlocker();
  await blocker;

  const beginResponse = await beginPromise;
  expect(beginResponse.status).toBe(200);
  expect(beginResponse.headers.get('x-request-id')).toBe('req-begin-001');

  const stageResponse = await handler(new Request('http://localhost/api/dashboard/sync/batches/timing-batch-1/pages/0', {
    method: 'PUT',
    headers: {
      authorization: 'Bearer synthetic-token',
      'content-type': 'application/json',
      'x-request-id': 'req-stage-001',
    },
    body: JSON.stringify({ records: candidate.records }),
  }));
  expect(stageResponse.status).toBe(200);
  expect(stageResponse.headers.get('x-request-id')).toBe('req-stage-001');

  const commitResponse = await handler(new Request('http://localhost/api/dashboard/sync/batches/timing-batch-1/commit', {
    method: 'POST',
    headers: {
      authorization: 'Bearer synthetic-token',
      'x-request-id': 'req-commit-001',
    },
  }));
  expect(commitResponse.status).toBe(200);
  expect(commitResponse.headers.get('x-request-id')).toBe('req-commit-001');

  expect(logs.map(entry => [entry.op, entry.requestId, entry.status, entry.code])).toEqual([
    ['begin', 'req-begin-001', 200, 'ok'],
    ['stage', 'req-stage-001', 200, 'ok'],
    ['commit', 'req-commit-001', 200, 'ok'],
  ]);

  expect(logs[0].queueWaitMs).toBeGreaterThanOrEqual(20);
  expect(logs[0].runningOpAtEnqueue).toBe('capacity');
  expect(logs[1].offset).toBe(0);
  expect(logs[1].recordCount).toBe(1);
  for (const entry of logs) {
    expect(entry.batchPrefix).toMatch(/^[a-f0-9]{12}$/);
    expect(JSON.stringify(entry)).not.toContain('timing-batch-1');
    expect(JSON.stringify(entry)).not.toContain('synthetic-token');
    expect(entry.execMs).toBeGreaterThanOrEqual(0);
    expect(entry.workerWallMs).toBeTypeOf('number');
    expect(entry.totalMs).toBeGreaterThanOrEqual(entry.queueWaitMs);
    expect(entry.cancelled).toBe(false);
  }

  const state = executor.state();
  expect(state.opTiming.begin.count).toBe(1);
  expect(state.opTiming.stage.count).toBe(1);
  expect(state.opTiming.commit.count).toBe(1);
  expect(state.opTiming.begin.maxQueueWaitMs).toBeGreaterThanOrEqual(20);
});
