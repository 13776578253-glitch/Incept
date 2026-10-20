import 'server-only';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { RawUsageEvent, UnitPricing } from '../types';
import { hash } from '../imports/identity';
import { emptyCollection, fileUpdatedAt, markCovered, usageEvent } from './common';
import { decodeHarnessZstd } from './harness-zstd';

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {};
const text = (value: unknown) => typeof value === 'string' && value.length ? value : undefined;
export type HarnessDiagnostic = {
  sessionId?: string; sourceFile: string; reason: string; affectedRecords: number; timestampMs?: number;
};
type Candidate = { event: RawUsageEvent; aliases: string[]; seeded: boolean; parentSession?: string };

/** Harness counters describe one completed usage, with uncached input separate from cache input. */
export function collectDeepSeekHarnessEvents(home: string, pricing: Map<string, UnitPricing>) {
  const result = { ...emptyCollection(), diagnostics: [] as HarnessDiagnostic[] };
  const root = join(home, '.dsh', 'sessions'), candidates: Candidate[] = [];
  if (!existsSync(root)) return result;
  const diagnose = (sourceFile: string, sessionId: string | undefined, reason: string, timestampMs?: number) => {
    result.diagnostics.push({ sourceFile, sessionId, reason, affectedRecords: 1, ...(timestampMs ? { timestampMs } : {}) });
  };
  const files: string[] = [];
  const walk = (directory: string) => {
    try {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = join(directory, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (entry.isFile() && /^session(?:\.v4)?\.jsonl(?:\.zstd)?$/.test(entry.name)) files.push(file);
      }
    } catch { diagnose(directory, undefined, 'UNREADABLE_DIRECTORY'); }
  };
  walk(root);
  for (const file of files.sort()) {
    result.latestMtimeMs = Math.max(result.latestMtimeMs, fileUpdatedAt(file));
    let decoded: { text: string; error?: string };
    try {
      const bytes = readFileSync(file);
      decoded = file.endsWith('.zstd') ? decodeHarnessZstd(bytes) : { text: bytes.toString('utf8') };
    } catch { diagnose(file, undefined, 'UNREADABLE_FILE'); continue; }
    const rows: ObjectValue[] = [];
    let invalidLines = 0;
    for (const line of decoded.text.split('\n')) {
      if (!line.trim()) continue;
      try { rows.push(object(JSON.parse(line))); } catch { invalidLines++; }
    }
    const header = rows.find(row => row.type === 'session'), sessionId = text(header?.id);
    if (decoded.error) diagnose(file, sessionId, decoded.error);
    if (invalidLines) result.diagnostics.push({ sourceFile: file, sessionId, reason: 'MALFORMED_JSON', affectedRecords: invalidLines });
    if (!sessionId) { diagnose(file, undefined, 'SESSION_IDENTITY_MISSING'); continue; }
    markCovered(result, 'deepseekHarness', file, [sessionId]);
    const seedBoundary = rows.findIndex(row => row.type === 'session/end-seed');
    let headerModel: string | undefined;
    for (const [index, row] of rows.entries()) {
      const data = object(row.data);
      if (row.type === 'request/header') {
        const configured = object(object(data.header).config).model;
        headerModel = text(configured) ?? text(object(configured).model) ?? headerModel;
      }
      if (data.usage === undefined) continue;
      if (!['assistant/message', 'session/title-llm-request', 'compaction/summary'].includes(String(row.type))) {
        diagnose(file, sessionId, 'UNSUPPORTED_USAGE_EVENT_TYPE'); continue;
      }
      const timestampMs = typeof row.time === 'number' ? row.time : NaN;
      if (!Number.isSafeInteger(timestampMs) || timestampMs <= 0) { diagnose(file, sessionId, 'USAGE_TIMESTAMP_MISSING'); continue; }
      const usage = object(data.usage), message = object(data.message), source = object(message.source);
      const response = object(object(source.replayState).response);
      const responseId = text(response.responseId) ?? text(response.id) ?? text(data.responseId);
      const messageId = text(message.id) ?? text(data.id) ?? (row.type === 'compaction/summary' ? text(data.compactionId) : undefined);
      const aliases = [responseId ? 'response:' + responseId : undefined,
        messageId ? (row.type === 'compaction/summary' ? 'compaction:' : 'message:') + messageId : undefined].filter((id): id is string => !!id);
      if (!aliases.length) { diagnose(file, sessionId, 'USAGE_IDENTITY_MISSING', timestampMs); continue; }
      const counts = [usage.inputTokens, usage.outputTokens, usage.cacheReadTokens ?? 0, usage.cacheWriteTokens ?? 0];
      if (!counts.every(count => typeof count === 'number' && Number.isSafeInteger(count) && count >= 0)) {
        diagnose(file, sessionId, 'USAGE_COUNTER_INVALID', timestampMs); continue;
      }
      const [inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens] = counts as number[];
      const total = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
      if (!Number.isSafeInteger(total) || (usage.totalTokens !== undefined && usage.totalTokens !== total)) {
        diagnose(file, sessionId, 'USAGE_TOTAL_MISMATCH', timestampMs); continue;
      }
      if (!total) continue;
      const modelName = text(source.model) ?? text(object(source.model).model) ?? text(data.model) ?? headerModel ?? 'unknown';
      const event = usageEvent({ sourceId: 'deepseekHarness', sourceLabel: 'DeepSeek Harness', sourceFile: file,
        sessionId, cwd: text(header?.cwd), timestampMs, modelName, inputTokens, outputTokens,
        cacheReadTokens, cacheCreationTokens, reasoningTokens: 0 }, pricing);
      candidates.push({ event, aliases, seeded: seedBoundary >= 0 && index < seedBoundary, parentSession: text(header?.parentSession) });
    }
  }
  // Connect explicit message and response identities, including legacy/v4 and seeded copies.
  const parents = candidates.map((_, index) => index), aliasOwners = new Map<string, number>();
  const find = (index: number): number => parents[index] === index ? index : (parents[index] = find(parents[index]));
  for (const [index, candidate] of candidates.entries()) for (const alias of candidate.aliases) {
    const owner = aliasOwners.get(alias);
    if (owner === undefined) aliasOwners.set(alias, index);
    else parents[find(index)] = find(owner);
  }
  const groups = new Map<number, Candidate[]>();
  for (const [index, candidate] of candidates.entries()) {
    const key = find(index), group = groups.get(key) ?? [];
    group.push(candidate); groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.every(candidate => candidate.seeded && candidate.parentSession)) {
      for (const { event } of group) diagnose(event.sourceFile!, event.sessionId, 'REPLAY_ORIGIN_MISSING', event.timestampMs);
      continue;
    }
    const aliases = [...new Set(group.flatMap(candidate => candidate.aliases))].sort();
    // Message UUID remains stable when response metadata arrives later.
    const identity = aliases.find(id => id.startsWith('message:')) ?? aliases.find(id => id.startsWith('compaction:')) ?? aliases[0];
    const signatures = new Set(group.map(({ event }) => hash([event.modelName, event.inputTokens, event.outputTokens,
      event.cacheReadTokens, event.cacheCreationTokens])));
    if (signatures.size !== 1) {
      for (const { event } of group) diagnose(event.sourceFile!, event.sessionId, 'USAGE_IDENTITY_CONFLICT', event.timestampMs);
      continue;
    }
    group.sort((a, b) => Number(a.seeded) - Number(b.seeded) || a.event.timestampMs - b.event.timestampMs);
    const event = group[0].event;
    event.eventId = hash(['deepseekHarness/usage/1', identity]);
    event.sourceFiles = [...new Set(group.map(candidate => candidate.event.sourceFile!))].sort();
    result.events.push(event);
  }
  result.events.sort((a, b) => a.timestampMs - b.timestampMs || a.eventId!.localeCompare(b.eventId!));
  return result;
}
