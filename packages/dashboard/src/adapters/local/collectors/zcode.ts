import 'server-only';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { UnitPricing } from '../types';
import { openSqliteReadOnly } from '../sqlite';
import { emptyCollection, fileUpdatedAt, markCovered, usageEvent } from './common';

export function collectZCodeEvents(home: string, pricing: Map<string, UnitPricing>) {
  const result = emptyCollection(), file = join(home, '.zcode', 'cli', 'db', 'db.sqlite');
  if (!existsSync(file)) return result;
  result.latestMtimeMs = fileUpdatedAt(file);
  const db = openSqliteReadOnly(file);
  if (!db) { result.errors.push('Unreadable ZCode database'); return result; }
  try {
    const rows = db.prepare(`SELECT u.*, s.title AS session_title, s.directory AS session_directory FROM model_usage u
      LEFT JOIN session s ON s.id = u.session_id WHERE u.status != 'running' ORDER BY u.started_at`).all();
    for (const row of rows) result.events.push(usageEvent({ sourceId: 'zcode', sourceLabel: 'ZCode', sourceFile: file,
      sessionId: String(row.session_id), sessionTitle: String(row.session_title ?? '') || undefined, cwd: String(row.session_directory ?? ''),
      modelName: String(row.model_id), timestampMs: Number(row.completed_at ?? row.started_at),
      inputTokens: Number(row.input_tokens ?? 0), outputTokens: Number(row.output_tokens ?? 0), reasoningTokens: Number(row.reasoning_tokens ?? 0),
      cacheReadTokens: Number(row.cache_read_input_tokens ?? 0), cacheCreationTokens: Number(row.cache_creation_input_tokens ?? 0) }, pricing));
    markCovered(result, 'zcode', file, db.prepare('SELECT id FROM session').all().map(row => String(row.id)));
  } catch { result.events = []; result.errors.push('Unsupported ZCode usage schema'); }
  finally { db.close(); }
  return result;
}
