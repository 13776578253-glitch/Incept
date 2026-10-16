import 'server-only';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { UnitPricing } from '../types';
import { openSqliteReadOnly } from '../sqlite';
import { emptyCollection, fileUpdatedAt, markCovered, usageEvent } from './common';
import { hash } from '../imports/identity';

export function collectOpenCodeEvents(home: string, pricing: Map<string, UnitPricing>) {
  const result = emptyCollection();
  const file = join(home, '.local', 'share', 'opencode', 'opencode.db');
  if (!existsSync(file)) return result;
  result.latestMtimeMs = fileUpdatedAt(file);
  const db = openSqliteReadOnly(file);
  if (!db) { result.errors.push('Unreadable OpenCode database'); return result; }
  try {
    const sessions = db.prepare('SELECT id, title, directory FROM session').all();
    const meta = new Map(sessions.map(row => [String(row.id), row]));
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('message', 'session_message')").all();
    if (!tables.length) throw new Error('Missing message table');
    const seen = new Set<string>(), failedSessions = new Set<string>();
    for (const table of tables) {
      for (const row of db.prepare(`SELECT id, session_id, time_created, data FROM ${table.name}`).all()) {
        const sessionId = String(row.session_id);
        try {
          const value = JSON.parse(String(row.data)), data = value.info ?? value;
          if (data.role !== 'assistant' || !data.tokens) continue;
          const tokens = data.tokens, modelName = data.modelID ?? data.model?.modelID;
          if (!modelName) { failedSessions.add(sessionId); continue; }
          const key = sessionId + ':' + (data.id ?? row.id);
          if (seen.has(key)) continue;
          seen.add(key);
          const session = meta.get(sessionId);
          const event = usageEvent({ sourceId: 'opencode', sourceLabel: 'OpenCode', sourceFile: file, sessionId,
            sessionTitle: String(session?.title ?? '') || undefined, cwd: String(session?.directory ?? ''),
            modelName, timestampMs: Number(data.time?.created ?? row.time_created), recordedCost: data.cost,
            inputTokens: Number(tokens.input ?? 0), outputTokens: Number(tokens.output ?? 0), reasoningTokens: Number(tokens.reasoning ?? 0),
            cacheReadTokens: Number(tokens.cache?.read ?? 0), cacheCreationTokens: Number(tokens.cache?.write ?? 0) }, pricing);
          event.eventId = hash(['opencode', sessionId, data.id ?? row.id]);
          result.events.push(event);
        } catch { failedSessions.add(sessionId); }
      }
    }
    for (const session of sessions) if (!failedSessions.has(String(session.id))) markCovered(result, 'opencode', file, [String(session.id)]);
    if (failedSessions.size) { result.parsedFiles.clear(); result.events = result.events.filter(event => !failedSessions.has(event.sessionId)); result.errors.push('Unsupported OpenCode message data'); }
  } catch { result.events = []; result.coveredSessions.clear(); result.parsedFiles.clear(); result.errors.push('Unable to query OpenCode usage'); }
  finally { db.close(); }
  return result;
}
