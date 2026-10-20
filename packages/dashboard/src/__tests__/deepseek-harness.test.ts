import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { collectDeepSeekHarnessEvents } from '../adapters/local/collectors/deepseek-harness';
import { decodeHarnessZstd } from '../adapters/local/collectors/harness-zstd';

const homes: string[] = [];
const home = () => { const value = mkdtempSync(join(tmpdir(), 'incept-harness-')); homes.push(value); return value; };
const encode = (rows: unknown[]) => Buffer.from(rows.map(row => typeof row === 'string' ? row : JSON.stringify(row)).join('\n') + '\n');
const header = (id = 'session-a', parentSession?: string) => ({ type: 'session', id, version: 4, cwd: 'D:/project', parentSession });
const usage = (id = 'm1', time = Date.parse('2026-10-20T23:59:00+08:00'), input = 10, responseId?: string) => ({
  type: 'assistant/message', time, data: {
    message: { id, source: { model: 'workbuddy/deepseek-v4.1-flash', replayState: { response: { responseId } } } },
    usage: { inputTokens: input, outputTokens: 3, cacheReadTokens: 7, cacheWriteTokens: 2, totalTokens: input + 12 },
  },
});
const write = (base: string, session: string, rows: unknown[], compressed = false) => {
  const directory = join(base, '.dsh', 'sessions', session); mkdirSync(directory, { recursive: true });
  const file = join(directory, compressed ? 'session.v4.jsonl.zstd' : 'session.jsonl');
  writeFileSync(file, compressed ? zstdCompressSync(encode(rows)) : encode(rows)); return file;
};
afterEach(() => { for (const directory of homes.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe('DeepSeek Harness collector', () => {
  it('reads all concatenated frames, event dates, compaction usage and preserves unknown pricing', () => {
    const base = home(), directory = join(base, '.dsh', 'sessions', 'session-a'); mkdirSync(directory, { recursive: true });
    const frames = [[header(), usage()], [{ type: 'compaction/summary', time: Date.parse('2026-10-21T00:01:00+08:00'),
      data: { compactionId: 'c1', model: 'new-model', maxTokens: 999999, shadowedTokenCount: 999999,
        usage: { inputTokens: 20, outputTokens: 4, cacheReadTokens: 5, cacheWriteTokens: 1, totalTokens: 30 } } }]];
    const bytes = Buffer.concat(frames.map(rows => zstdCompressSync(encode(rows))));
    writeFileSync(join(directory, 'session.v4.jsonl.zstd'), bytes);
    expect(decodeHarnessZstd(bytes).consumedBytes).toBe(bytes.length);
    const result = collectDeepSeekHarnessEvents(base, new Map());
    expect(result.events.map(event => [event.dateKey, event.inputTokens, event.outputTokens, event.cacheReadTokens, event.cacheCreationTokens]))
      .toEqual([['2026-10-20', 10, 3, 7, 2], ['2026-10-21', 20, 4, 5, 1]]);
    expect(result.events.every(event => event.missingPricing && event.reasoningTokens === 0)).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it('deduplicates legacy/v4 and linked response aliases, retaining stable native event identities', () => {
    const base = home();
    write(base, 'a', [header(), usage()]);
    const before = collectDeepSeekHarnessEvents(base, new Map()).events[0].eventId;
    write(base, 'b', [header(), usage('m1', undefined, 10, 'r1'), { type: 'session/end-seed' }], true);
    const result = collectDeepSeekHarnessEvents(base, new Map());
    expect(result.events).toHaveLength(1);
    expect(result.events[0].eventId).toBe(before);
    expect(result.events[0].sourceFiles).toHaveLength(2);
    expect(result.events[0].sourceFile).toContain('a');
  });

  it('isolates conflicting identities and malformed rows while healthy sessions continue', () => {
    const base = home();
    write(base, 'bad', [header(), usage('conflict'), '{broken']);
    write(base, 'copy', [header(), usage('conflict', undefined, 11)]);
    write(base, 'healthy', [header('healthy'), usage('good')]);
    const result = collectDeepSeekHarnessEvents(base, new Map());
    expect(result.events).toHaveLength(1);
    expect(result.events[0].sessionId).toBe('healthy');
    expect(result.diagnostics.map(item => item.reason)).toContain('MALFORMED_JSON');
    expect(result.diagnostics.map(item => item.reason)).toContain('USAGE_IDENTITY_CONFLICT');
    expect(result.errors).toEqual([]);
  });

  it('keeps valid prefix frames on interrupted writes and rejects guessed or inconsistent usage', () => {
    const base = home(), file = write(base, 'a', [header(), usage()], true);
    const broken = Buffer.concat([zstdCompressSync(encode([header(), usage()])), Buffer.from([0x28, 0xb5, 0x2f])]);
    writeFileSync(file, broken);
    const wrong = usage('wrong'); wrong.data.usage.totalTokens++;
    write(base, 'bad', [header('bad'), wrong, { ...usage('undated'), time: undefined },
      { type: 'assistant/attempt', time: Date.now(), data: { usage: { inputTokens: 500 } } }]);
    const result = collectDeepSeekHarnessEvents(base, new Map());
    expect(result.events).toHaveLength(1);
    expect(result.diagnostics.map(item => item.reason)).toEqual(expect.arrayContaining([
      'UNREADABLE_COMPRESSED_SUFFIX', 'USAGE_TOTAL_MISMATCH', 'USAGE_TIMESTAMP_MISSING', 'UNSUPPORTED_USAGE_EVENT_TYPE',
    ]));
  });

  it('isolates orphan fork replay without excluding independent new messages', () => {
    const base = home();
    write(base, 'fork', [header('fork', 'missing-original'), usage('replayed'), { type: 'session/end-seed' }, usage('new')]);
    const result = collectDeepSeekHarnessEvents(base, new Map());
    expect(result.events).toHaveLength(1);
    expect(result.diagnostics.map(item => item.reason)).toEqual(['REPLAY_ORIGIN_MISSING']);
    write(base, 'original', [header('original'), usage('replayed')]);
    const restored = collectDeepSeekHarnessEvents(base, new Map());
    expect(restored.events).toHaveLength(2);
    expect(restored.events.find(event => event.sessionId === 'original')).toBeDefined();
    expect(restored.diagnostics).toEqual([]);
  });
});
