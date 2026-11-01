import { appendFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { captureHome, buildCandidate } from '../agent/capture';
import type { ParentCapture } from '../agent/capture';
import { hash } from '../adapters/local/imports/identity';

let home = '';
afterEach(() => { if (home) rmSync(home, { recursive: true, force: true }); home = ''; });

const count = (timestamp: string, input: number, output = 0) => ({
  timestamp, type: 'event_msg', payload: { type: 'token_count', info: {
    total_token_usage: { input_tokens: input, output_tokens: output },
    last_token_usage: { input_tokens: input, output_tokens: output },
  } },
});

it('retains legacy merged subagent ranges in the parent without double-uploading the exact child file', async () => {
  home = mkdtempSync(join(tmpdir(), 'codex-split-parent-'));
  const dir = join(home, '.codex', 'sessions', '2026', '10', '31');
  mkdirSync(dir, { recursive: true });
  const parentPath = join(dir, 'parent.jsonl');
  const childPath = join(dir, 'child.jsonl');
  const parentRows = [
    { type: 'session_meta', payload: { id: 'parent' } },
    { type: 'turn_context', payload: { model: 'fixture-model' } },
    count('2026-10-31T10:00:00Z', 10),
  ];
  const childRows = [
    { type: 'session_meta', payload: { id: 'child', thread_source: 'subagent' } },
    { type: 'session_meta', payload: { id: 'parent', thread_source: 'user' } },
    { type: 'turn_context', payload: { model: 'fixture-model' } },
    count('2026-10-31T10:01:00Z', 5),
  ];
  writeFileSync(parentPath, parentRows.map(value => JSON.stringify(value)).join('\n'));
  writeFileSync(childPath, childRows.map(value => JSON.stringify(value)).join('\n'));

  const first = await captureHome(home, join(home, 'snapshot-one'), ['codex']);
  const parentCapture = first.captures.find(capture => capture.sessionId === 'parent');
  const childCapture = first.captures.find(capture => capture.sessionId === 'child');
  expect(parentCapture).toBeDefined();
  expect(childCapture).toBeDefined();
  const parentCandidate = buildCandidate(parentCapture!, {
    deviceId: '00000000-0000-4000-8000-000000000001', source: 'codex', sessionId: 'parent',
    originId: hash(['incept-origin/1', 'codex', 'parent']),
  }, undefined, 'legacy');
  const legacy: ParentCapture = {
    header: {
      ...parentCandidate.header,
      manifest: { ...parentCandidate.header.manifest,
        ranges: [...parentCapture!.proofs.map(proof => proof.range), ...childCapture!.proofs.map(proof => proof.range)] },
    },
    proofs: [...parentCapture!.proofs, ...childCapture!.proofs],
  };

  appendFileSync(parentPath, '\n' + JSON.stringify(count('2026-10-31T10:02:00Z', 20)));
  const next = await captureHome(home, join(home, 'snapshot-two'), ['codex'], [legacy]);
  expect(next.captures.map(capture => capture.sessionId)).toEqual(['parent']);
  expect(next.captures[0].proofs).toHaveLength(2);
  expect(next.isolations?.some(item => item.sessionId === 'parent')).toBe(false);
});

it('retains parent range when subagent file grows, admitting newly appended child usage', async () => {
  home = mkdtempSync(join(tmpdir(), 'codex-split-growth-'));
  const dir = join(home, '.codex', 'sessions', '2026', '10', '31');
  mkdirSync(dir, { recursive: true });
  const parentPath = join(dir, 'parent.jsonl');
  const childPath = join(dir, 'child.jsonl');
  const parentRows = [
    { type: 'session_meta', payload: { id: 'parent' } },
    { type: 'turn_context', payload: { model: 'fixture-model' } },
    count('2026-10-31T10:00:00Z', 10),
  ];
  const childRows = [
    { type: 'session_meta', payload: { id: 'child', thread_source: 'subagent' } },
    { type: 'session_meta', payload: { id: 'parent', thread_source: 'user' } },
    { type: 'turn_context', payload: { model: 'fixture-model' } },
    count('2026-10-31T10:01:00Z', 5),
  ];
  writeFileSync(parentPath, parentRows.map(value => JSON.stringify(value)).join('\n'));
  writeFileSync(childPath, childRows.map(value => JSON.stringify(value)).join('\n'));

  const first = await captureHome(home, join(home, 'snapshot-one'), ['codex']);
  const parentCapture = first.captures.find(capture => capture.sessionId === 'parent');
  const childCapture = first.captures.find(capture => capture.sessionId === 'child');
  const parentCandidate = buildCandidate(parentCapture!, {
    deviceId: '00000000-0000-4000-8000-000000000001', source: 'codex', sessionId: 'parent',
    originId: hash(['incept-origin/1', 'codex', 'parent']),
  }, undefined, 'legacy');
  const legacy: ParentCapture = {
    header: {
      ...parentCandidate.header,
      manifest: { ...parentCandidate.header.manifest,
        ranges: [...parentCapture!.proofs.map(proof => proof.range), ...childCapture!.proofs.map(proof => proof.range)] },
    },
    proofs: [...parentCapture!.proofs, ...childCapture!.proofs],
  };

  // Both parent and child append new records
  appendFileSync(parentPath, '\n' + JSON.stringify(count('2026-10-31T10:02:00Z', 20)));
  appendFileSync(childPath, '\n' + JSON.stringify(count('2026-10-31T10:03:00Z', 15)));

  const next = await captureHome(home, join(home, 'snapshot-growth'), ['codex'], [legacy]);
  const sessionIds = next.captures.map(c => c.sessionId).sort();
  expect(sessionIds).toEqual(['child', 'parent']);
  const parentNext = next.captures.find(c => c.sessionId === 'parent');
  expect(parentNext?.proofs).toHaveLength(2);
  expect(next.isolations?.some(item => item.sessionId === 'parent')).toBe(false);
});
