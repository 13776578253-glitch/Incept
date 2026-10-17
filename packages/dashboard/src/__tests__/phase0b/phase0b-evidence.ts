// Test-only source evidence adapter: reads synthetic homes, freezes SQLite with backup,
// invokes the REAL collectors on the frozen copy. No production collector modification.
import { backup, DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type { TransferSource, TransferEvent } from '../../domain';
import type { RawUsageEvent } from '../../adapters/local/types';
import { collectCodexEvents } from '../../adapters/local/collectors/codex';
import { collectCommandCodeEvents } from '../../adapters/local/collectors/commandcode';
import { collectClaudeEvents } from '../../adapters/local/collectors/claude';
import { collectGeminiEvents } from '../../adapters/local/collectors/gemini';
import { collectAntigravityEvents } from '../../adapters/local/collectors/antigravity';
import { collectOpenCodeEvents } from '../../adapters/local/collectors/opencode-usage';
import { collectZCodeEvents } from '../../adapters/local/collectors/zcode';
import { collectIndexedAgentEvents } from '../../adapters/local/collectors/aiusage';
import { nativeEventId, hash } from '../../adapters/local/imports/identity';
import { PHASE0_PRICE, PHASE0_MODEL } from '../fixtures/sync-agent-phase0';
import { type Evidence, type Observation, type Scope } from './phase0b-contract';

export type OriginRegistry = { scope: Scope; paths: string[] };
const roots: Record<TransferSource | 'aiusage', string[]> = {
  codex: ['.codex/sessions', '.codex/archived_sessions'], commandcode: ['.commandcode/projects'],
  claudeCode: ['.claude/projects'], geminiCli: ['.gemini/tmp'], antigravity: ['.gemini/antigravity/conversations'],
  opencode: ['.local/share/opencode'], zcode: ['.zcode/cli/db'], aiusage: ['.aiusage'],
};
export function inventory(home: string, reader: TransferSource | 'aiusage'): string[] {
  return roots[reader].flatMap(root => {
    const directory = join(home, root);
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { recursive: true, withFileTypes: true }).filter(row => row.isFile())
      .map(row => relative(home, join(row.parentPath, row.name)).replaceAll('\\', '/'))
      .filter(file => reader === 'aiusage' ? file.endsWith('cache.db') : /\.(jsonl|json|db|sqlite)$/.test(file));
  }).sort();
}
function fileHash(path: string) {
  if (!existsSync(path)) return 'missing';
  try {
  if (/\.(db|sqlite)$/.test(path)) {
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      db.exec('BEGIN');
      const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
      const snapshot = names.map(row => { const table = String(row.name).replaceAll('"', '""'); return [row.name, db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()]; });
      db.exec('COMMIT'); return hash(snapshot);
    } finally { db.close(); }
  }
    return hash(readFileSync(path).toString('base64'));
  } catch { return 'unreadable'; }
}
export async function capture(home: string, frozenHome: string, registry: OriginRegistry,
  options: { reader?: 'aiusage'; duringRead?: () => void } = {}) {
  const reader = options.reader ?? registry.scope.source;
  const beforeInventory = inventory(home, reader), before = registry.paths.map(file => [file, fileHash(join(home, file))]);
  const evidence: Evidence = { status: 'failed', code: 'UNREADABLE', inventoryHash: hash(beforeInventory), snapshotHash: hash(before), coverage: 'snapshot-only',
    beforeHash: hash(before), afterHash: '', originId: registry.scope.originId, consistentRead: false, parseErrors: 0, history: 'known-scope' };
  const result: { evidence: Evidence; observations: Observation[] } = { evidence, observations: [] };
  if (before.some(([, digest]) => digest === 'unreadable')) { evidence.code = 'SOURCE_READ_FAILED'; return result; }
  if (!registry.paths.length || registry.paths.some(file => !existsSync(join(home, file)))) {
    evidence.status = 'unavailable'; evidence.code = 'MISSING_ORIGIN'; return result;
  }
  if (JSON.stringify(beforeInventory) !== JSON.stringify([...registry.paths].sort())) {
    evidence.status = 'partial'; evidence.code = 'INVENTORY_CHANGED'; return result;
  }
  mkdirSync(frozenHome, { recursive: true });
  try {
    for (const file of registry.paths) {
      const input = resolve(home, file), output = resolve(frozenHome, file);
      if (!input.startsWith(resolve(home) + '/') && !input.startsWith(resolve(home) + '\\')) throw new Error('OUT_OF_SCOPE');
      if (!output.startsWith(resolve(frozenHome) + '/') && !output.startsWith(resolve(frozenHome) + '\\')) throw new Error('OUT_OF_SCOPE');
      mkdirSync(dirname(output), { recursive: true });
      if (/\.(db|sqlite)$/.test(file)) {
        const db = new DatabaseSync(input, { readOnly: true });
        try { await backup(db, output); } finally { db.close(); }
      } else copyFileSync(input, output);
    }
    options.duringRead?.();
    const after = registry.paths.map(file => [file, fileHash(join(home, file))]);
    const frozen = registry.paths.map(file => [file, fileHash(join(frozenHome, file))]);
    evidence.afterHash = hash(after);
    evidence.snapshotHash = hash(frozen);
    evidence.consistentRead = evidence.beforeHash === evidence.afterHash
      && evidence.beforeHash === evidence.snapshotHash
      && hash(beforeInventory) === hash(inventory(home, reader));
    if (!evidence.consistentRead) { evidence.status = 'partial'; evidence.code = 'CHANGED_DURING_READ'; return result; }
    // Validate every JSONL row, including a final fragment ignored by some existing collectors.
    for (const file of registry.paths.filter(path => /\.(jsonl|json)$/.test(path))) {
      const text = readFileSync(join(frozenHome, file), 'utf8');
      for (const row of file.endsWith('.jsonl') ? text.split('\n').filter(line => line.trim()) : [text]) {
        try { JSON.parse(row); } catch { evidence.parseErrors++; }
      }
      if (registry.scope.source === 'geminiCli' && file.endsWith('.json') && !evidence.parseErrors) {
        const data = JSON.parse(text) as { messages?: Array<{ tokens?: unknown; timestamp?: string }> };
        if (data.messages?.some(row => row.tokens && (!row.timestamp || !Number.isFinite(Date.parse(row.timestamp))))) {
          evidence.status = 'partial'; evidence.code = 'ESTIMATED_TIMESTAMP'; return result;
        }
      }
    }
    if (evidence.parseErrors) { evidence.status = 'partial'; evidence.code = 'INCOMPLETE_JSON'; return result; }
    const prices = new Map([[PHASE0_MODEL, PHASE0_PRICE], ['phase0-corrected-model', PHASE0_PRICE]]);
    const source = registry.scope.source;
    const collected = reader === 'aiusage' ? collectIndexedAgentEvents(frozenHome, prices)
      : source === 'codex' ? collectCodexEvents(frozenHome, prices, new Set())
      : source === 'commandcode' ? collectCommandCodeEvents(frozenHome, prices)
      : source === 'claudeCode' ? collectClaudeEvents(frozenHome, prices)
      : source === 'geminiCli' ? collectGeminiEvents(frozenHome, prices)
      : source === 'antigravity' ? collectAntigravityEvents(frozenHome, prices)
      : source === 'opencode' ? collectOpenCodeEvents(frozenHome, prices) : collectZCodeEvents(frozenHome, prices);
    if (collected.errors.length || collected.events.some(row => row.historyIncomplete)) {
      evidence.status = 'partial'; evidence.code = 'COLLECTOR_INCOMPLETE'; evidence.history = 'unknown-prefix'; return result;
    }
    // Existing ZCode query excludes running usage: readable DB is still a partial session.
    if (source === 'zcode' && reader !== 'aiusage') {
      const db = new DatabaseSync(join(frozenHome, registry.paths[0]), { readOnly: true });
      try { if (Number(db.prepare("SELECT COUNT(*) AS n FROM model_usage WHERE status='running'").get()!.n)) {
        evidence.status = 'partial'; evidence.code = 'RUNNING_USAGE'; return result;
      } } finally { db.close(); }
    }
    const rows = collected.events.filter(row => row.sourceId === source);
    if (rows.some(row => row.sessionId !== registry.scope.sessionId)) {
      evidence.status = 'partial'; evidence.code = 'SESSION_BINDING_REQUIRED'; return result;
    }
    const ids = rows.map(row => nativeEventId(row));
    if (new Set(ids).size !== ids.length) { evidence.status = 'partial'; evidence.code = 'AMBIGUOUS_SOURCE_ROWS'; return result; }
    // A source path/session name can be renamed. Registry membership must change explicitly.
    result.observations = rows.map(raw => ({ event: transfer(raw), nativeAnchor: nativeAnchor(raw, source, reader, frozenHome, registry.paths) }));
    evidence.status = 'complete'; evidence.code = rows.length ? 'CONSISTENT_KNOWN_SCOPE' : 'EMPTY_KNOWN_SCOPE';
    return result;
  } catch {
    evidence.status = 'failed'; evidence.code = 'SOURCE_READ_FAILED'; return result;
  } finally {
    const target = resolve(frozenHome);
    // frozenHome must be a child of the caller-owned synthetic home.
    if (!target.startsWith(resolve(home) + '/') && !target.startsWith(resolve(home) + '\\')) throw new Error('UNSAFE_PROOF_CLEANUP');
    rmSync(target, { recursive: true, force: true });
  }
}
function transfer(raw: RawUsageEvent): TransferEvent {
  return { eventId: nativeEventId(raw), source: raw.sourceId as TransferSource, sessionId: raw.sessionId,
    timestampMs: raw.timestampMs, modelName: raw.modelName, projectKey: raw.projectKey + ':' + hash(raw.workspacePath ?? raw.projectKey).slice(0, 16), projectName: raw.projectName,
    workspacePath: raw.workspacePath, sessionTitle: raw.sessionTitle, inputTokens: raw.inputTokens, outputTokens: raw.outputTokens,
    cacheReadTokens: raw.cacheReadTokens, cacheCreationTokens: raw.cacheCreationTokens, reasoningTokens: raw.reasoningTokens,
    ...(raw.costSource === 'recorded' && raw.sourceId !== 'codex' ? { recordedCost: raw.nominalCost ?? raw.cost } : {}) };
}
function nativeAnchor(raw: RawUsageEvent, source: TransferSource, reader: TransferSource | 'aiusage', home: string, paths: string[]) {
  if (reader === 'aiusage' || source === 'codex') return undefined;
  if (source === 'commandcode') {
    const hasId = paths.filter(file => file.endsWith('.jsonl')).flatMap(file => readFileSync(join(home, file), 'utf8').split('\n').filter(Boolean))
      .map(row => JSON.parse(row) as { id?: string }).every(row => !!row.id);
    if (!hasId) return undefined;
  }
  return raw.eventId;
}
