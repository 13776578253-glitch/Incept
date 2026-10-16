import 'server-only';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { RawUsageEvent, UnitPricing } from '../types';
import { walkFiles } from '../files';
import { emptyCollection, fileUpdatedAt, markCovered, usageEvent } from './common';
import { hash } from '../imports/identity';

export function collectClaudeEvents(home: string, pricing: Map<string, UnitPricing>) {
  const result = emptyCollection(), requests = new Map<string, RawUsageEvent>();
  for (const file of walkFiles(join(home, '.claude', 'projects'), path => path.endsWith('.jsonl'))) {
    result.latestMtimeMs = Math.max(result.latestMtimeMs, fileUpdatedAt(file));
    let failed = false;
    const sessions = new Set<string>(), fileEvents = new Map<string, RawUsageEvent>();
    try {
      for (const [index, line] of readFileSync(file, 'utf8').split('\n').entries()) {
        if (!line.trim()) continue;
        try {
          const row = JSON.parse(line);
          if (row.type !== 'assistant' || !row.message?.usage) continue;
          const msg = row.message, tokens = msg.usage, sessionId = row.sessionId || basename(file, '.jsonl');
          const timestampMs = Date.parse(row.timestamp);
          if (!msg.model || !Number.isFinite(timestampMs)) { failed = true; continue; }
          sessions.add(sessionId);
          const event = usageEvent({ sourceId: 'claudeCode', sourceLabel: 'Claude Code', sourceFile: file,
            sessionId, modelName: msg.model, timestampMs, cwd: row.cwd, recordedCost: row.costUSD,
            inputTokens: Number(tokens.input_tokens ?? 0), outputTokens: Number(tokens.output_tokens ?? 0),
            cacheReadTokens: Number(tokens.cache_read_input_tokens ?? 0), cacheCreationTokens: Number(tokens.cache_creation_input_tokens ?? 0) }, pricing);
          const key = sessionId + ':' + (msg.id ? [row.requestId ?? '', msg.id].join(':') : basename(file) + ':' + index);
          if (msg.id) event.eventId = hash(['claudeCode', sessionId, row.requestId ?? '', msg.id]);
          const previous = fileEvents.get(key);
          if (!previous || event.inputTokens + event.outputTokens + event.cacheReadTokens + event.cacheCreationTokens
            >= previous.inputTokens + previous.outputTokens + previous.cacheReadTokens + previous.cacheCreationTokens) fileEvents.set(key, event);
        } catch { failed = true; }
      }
      if (failed) { result.errors.push('Unreadable Claude Code session record'); continue; }
      markCovered(result, 'claudeCode', file, sessions.size ? sessions : [basename(file, '.jsonl')]);
      for (const [key, event] of fileEvents) {
        const existing = requests.get(key);
        if (!existing || event.inputTokens + event.outputTokens + event.cacheReadTokens + event.cacheCreationTokens
          >= existing.inputTokens + existing.outputTokens + existing.cacheReadTokens + existing.cacheCreationTokens) requests.set(key, event);
      }
    } catch { result.errors.push('Unreadable Claude Code session file'); }
  }
  result.events = [...requests.values()];
  return result;
}
