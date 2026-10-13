import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectInWorker, closeUsageWorker } from '../adapters/runtime/worker-client';
let home: string;
afterEach(() => {
  closeUsageWorker();
  if (home && resolve(home).startsWith(join(resolve(tmpdir()), 'dashboard-worker-'))) rmSync(home, { recursive: true, force: true });
});
describe('isolated collection runtime', () => {
  it('collects native usage in a real worker and picks up appended requests on force refresh', async () => {
    home = mkdtempSync(join(tmpdir(), 'dashboard-worker-'));
    const path = join(home, '.commandcode/projects/project'); mkdirSync(path, { recursive: true });
    const file = join(path, 'session.jsonl');
    const row = (id: string) => JSON.stringify({ id, timestamp: Date.now() - 1000, model: 'test-worker-model', usage: { inputTokens: 20, outputTokens: 2, costUsd: .1 } }) + '\n';
    writeFileSync(file, row('one'));
    const first = await collectInWorker(home, '30d', true);
    expect(first.totals.totalTokens).toBe(22); expect(first.range).toBe('30d');
    appendFileSync(file, row('two'));
    const next = await collectInWorker(home, '30d', true);
    expect(next.totals.totalTokens).toBe(44); expect(next.totals.cost).toBeCloseTo(.2);
    expect(first.totals.totalTokens).toBe(22);
  });
});
