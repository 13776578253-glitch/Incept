import 'server-only';
import { basename, join } from 'node:path';
import { openSqliteReadOnly } from '../sqlite';
import type { UnitPricing } from '../types';
import { walkFiles } from '../files';
import { emptyCollection, fileUpdatedAt, markCovered, usageEvent } from './common';
import { readConversation } from './antigravity/events';
import { lookupPricing } from '../pricing';
import { hash } from '../imports/identity';

export function collectAntigravityEvents(home: string, pricing: Map<string, UnitPricing>) {
  const result = emptyCollection(), seen = new Set<string>();
  const conversations: Array<{ file: string; data: ReturnType<typeof readConversation> }> = [];
  const files = ['antigravity', 'antigravity-cli', 'antigravity-ide'].flatMap(folder =>
    walkFiles(join(home, '.gemini', folder, 'conversations'), path => path.endsWith('.db')))
    .sort((a, b) => fileUpdatedAt(b) - fileUpdatedAt(a));
  for (const file of files) {
    result.latestMtimeMs = Math.max(result.latestMtimeMs, fileUpdatedAt(file));
    const db = openSqliteReadOnly(file);
    if (!db) { result.errors.push('Unreadable Antigravity conversation database'); continue; }
    try {
      const conversation = readConversation(db), sessionId = basename(file, '.db');
      if (conversation.errors) { result.errors.push('Unsupported or damaged Antigravity metadata'); continue; }
      if (!conversation.events.every(event => Number.isFinite(event.timestampMs) && event.timestampMs! > 0)) {
        result.errors.push('Antigravity usage is missing timestamps'); continue;
      }
      markCovered(result, 'antigravity', file, [sessionId]);
      conversations.push({ file, data: conversation });
    } catch { result.errors.push('Unable to query Antigravity conversation database'); }
    finally { db.close(); }
  }
  // Only reuse a rate when native records explicitly associate both names with
  // the same model ID. Similar spelling alone is insufficient (tiered/versioned models).
  const namesById = new Map<number, Set<string>>();
  for (const { data } of conversations) for (const event of data.events) {
    const id = event.usage.modelId;
    if (id === undefined || !event.modelName || /^(unknown|model-id:|model_placeholder_)/.test(event.modelName)) continue;
    const names = namesById.get(id) ?? new Set(); names.add(event.modelName); namesById.set(id, names);
  }
  for (const names of namesById.values()) {
    const candidates = [...names].flatMap(name => { const price = lookupPricing(pricing, name); return price ? [price] : []; });
    const signature = (price: UnitPricing) => JSON.stringify([price.inputPerMillion, price.outputPerMillion, price.cacheReadPerMillion, price.cacheWritePerMillion]);
    if (candidates.length && candidates.every(price => signature(price) === signature(candidates[0]))) {
      for (const name of names) if (!lookupPricing(pricing, name)) pricing.set(name.toLowerCase(), candidates[0]);
    }
  }
  for (const { file, data: conversation } of conversations) {
    const sessionId = basename(file, '.db');
    for (const event of conversation.events) {
      const keys = event.usage.identities.length ? event.usage.identities : [event.key];
      if (keys.some(key => seen.has(sessionId + ':' + key))) continue;
      for (const key of keys) seen.add(sessionId + ':' + key);
      const raw = usageEvent({ ...event.usage, sourceId: 'antigravity', sourceLabel: 'Antigravity',
        sourceFile: file, sessionId, modelName: event.modelName!, timestampMs: event.timestampMs!, cwd: conversation.cwd }, pricing);
      const request = ['response:', 'provider:', 'message:'].map(prefix => keys.find(key => key.startsWith(prefix))).find(Boolean);
      if (request) raw.eventId = hash(['antigravity', sessionId, request]);
      result.events.push(raw);
    }
  }
  return result;
}

export function loadAntigravityWorkspaces(home: string): Map<string, string> {
  const map = new Map<string, string>();
  const files = ['antigravity', 'antigravity-cli', 'antigravity-ide'].flatMap(folder =>
    walkFiles(join(home, '.gemini', folder, 'conversations'), path => path.endsWith('.db')));
  for(const file of files) {
    const convId = basename(file, '.db');
    const db = openSqliteReadOnly(file);
    if(!db) continue;
    try {
      const row = db.prepare('SELECT data FROM trajectory_metadata_blob LIMIT 1').get();
      if(row?.data) {
        const text = Buffer.from(row.data as Uint8Array).toString('utf8');
        const match = text.match(/file:\/\/\/([A-Za-z](?::|%3A)\/[^\x00-\x1f\s#"'*?<>|]+)/i);
        if(match?.[1]) {
          map.set(convId, decodeURIComponent(match[1]));
        }
      }
    } catch {
      // ignore
    } finally {
      db.close();
    }
  }

  return map;
}
