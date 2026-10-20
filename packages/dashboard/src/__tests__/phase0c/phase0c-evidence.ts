// Phase 0C correctness oracle. Capsules contain SYNTHETIC source bytes only.
// This is deliberately not a production upload format or filesystem attestation.
import { backup, DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, statSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash, nativeEventId } from '../../adapters/local/imports/identity';
import { collectCodexEvents } from '../../adapters/local/collectors/codex';
import { collectCommandCodeEvents } from '../../adapters/local/collectors/commandcode';
import { collectClaudeEvents } from '../../adapters/local/collectors/claude';
import { collectGeminiEvents } from '../../adapters/local/collectors/gemini';
import { collectAntigravityEvents } from '../../adapters/local/collectors/antigravity';
import { collectOpenCodeEvents } from '../../adapters/local/collectors/opencode-usage';
import { collectZCodeEvents } from '../../adapters/local/collectors/zcode';
import { collectDeepSeekHarnessEvents } from '../../adapters/local/collectors/deepseek-harness';
import { collectIndexedAgentEvents } from '../../adapters/local/collectors/aiusage';
import { PHASE0_MODEL, PHASE0_PRICE } from '../fixtures/sync-agent-phase0';
import type { Observation, Scope, PriceBasis } from '../phase0b/phase0b-contract';

export type Tables = Array<{ name: string; schema: string; rows: Record<string, unknown>[] }>;
export type FileEvidence = { locator: string; identity: string; byteLength: number; root: string; bytes: string; tables?: Tables };
export type Bridge = { parentHash: string; from: string; to: string; oldRoot: string; kind: 'same-file' | 'embedded-session-copy' };
export type Manifest = {
  schema: 'phase0c/1'; collector: 'aef64f4'; scope: Scope; reader: Scope['source'] | 'aiusage';
  parent: { id: string; hash: string } | null; files: FileEvidence[]; bridges: Bridge[];
  status: string; readBefore: string; readAfter: string; snapshotRoot: string;
  recordCount: number; sequenceRoot: string; anchors: string[]; observations: Observation[];
  basis: PriceBasis; mappings: Record<string, string | null>; manifestHash: string;
};
export type UnsignedManifest = Omit<Manifest, 'manifestHash'>;
export const seal = (manifest: UnsignedManifest): Manifest => ({ ...manifest, manifestHash: hash(manifest) });
export const contentRoot = (files: FileEvidence[]) => hash(files.map(file => [file.locator, file.identity, file.root]));
const dbFile = (path: string) => /\.(db|sqlite)$/.test(path);
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const roots: Record<Manifest['reader'], string[]> = {
  codex: ['.codex/sessions', '.codex/archived_sessions'], commandcode: ['.commandcode/projects'], claudeCode: ['.claude/projects'],
  geminiCli: ['.gemini/tmp'], antigravity: ['antigravity', 'antigravity-cli', 'antigravity-ide'].map(name => '.gemini/' + name + '/conversations'),
  deepseekHarness: ['.dsh/sessions'], opencode: ['.local/share/opencode'], zcode: ['.zcode/cli/db'], aiusage: ['.aiusage'],
};
export function inventory(home: string, reader: Manifest['reader']): string[] {
  return roots[reader].flatMap(root => existsSync(join(home, root)) ? readdirSync(join(home, root), { recursive: true, withFileTypes: true })
    .filter(row => row.isFile()).map(row => relative(home, join(row.parentPath, row.name)).replaceAll('\\', '/'))
    .filter(file => reader === 'aiusage' ? file.endsWith('cache.db') : /\.(jsonl|json|db|sqlite|jsonl\.zst)$/.test(file)) : []).sort();
}
export function tables(path: string): Tables {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec('BEGIN');
    return db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
      .map(row => ({ name: String(row.name), schema: String(row.sql),
        rows: db.prepare(`SELECT * FROM ${quote(String(row.name))} ORDER BY rowid`).all().map(row =>
          Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Uint8Array ? { blob: Buffer.from(value).toString('base64') } : value]))) }));
  } finally { db.close(); }
}
function inspect(home: string, reader: Manifest['reader']): FileEvidence[] {
  return inventory(home, reader).map(locator => {
    const path = join(home, locator), stat = statSync(path), bytes = readFileSync(path).toString('base64');
    const logical = dbFile(path) ? tables(path) : undefined;
    return { locator, identity: hash([String(stat.dev), String(stat.ino), stat.birthtimeMs]), byteLength: stat.size,
      root: logical ? hash(logical) : hash(bytes), bytes, ...(logical ? { tables: logical } : {}) };
  });
}
function safePath(home: string, locator: string) {
  const path = resolve(home, locator);
  if (!path.startsWith(resolve(home) + '/') && !path.startsWith(resolve(home) + '\\')) throw new Error('OUT_OF_SCOPE');
  return path;
}
export function embeddedSession(file: FileEvidence, source: Scope['source'], session: string): boolean {
  try {
    const text = Buffer.from(file.bytes, 'base64').toString('utf8');
    if (source === 'codex') return text.split('\n').filter(Boolean).some(line => {
      const row = JSON.parse(line); return row.type === 'session_meta' && row.payload?.id === session;
    });
    if (source === 'deepseekHarness') return text.split('\n').filter(Boolean).some(line => {
      const row = JSON.parse(line); return row.type === 'session' && row.id === session;
    });
    if (source === 'claudeCode') return text.split('\n').filter(Boolean).every(line => JSON.parse(line).sessionId === session);
    return source === 'geminiCli' && JSON.parse(text).sessionId === session;
  } catch { return false; }
}
export function prefix(old: FileEvidence, next: FileEvidence) {
  const a = Buffer.from(old.bytes, 'base64'), b = Buffer.from(next.bytes, 'base64');
  return a.length <= b.length && a.equals(b.subarray(0, a.length));
}
// A supplied bridge only chooses a replay representation. Qualification separately
// checks the bridge against the SERVER'S persisted parent and the full capsule.
function replayFiles(manifest: Pick<Manifest, 'files' | 'bridges'>) {
  const omitted = new Set<string>();
  for (const bridge of manifest.bridges) {
    const old = manifest.files.find(file => file.locator === bridge.from), next = manifest.files.find(file => file.locator === bridge.to);
    if (old && next && prefix(old, next)) omitted.add(old.locator);
  }
  return manifest.files.filter(file => !omitted.has(file.locator));
}
export async function replay(home: string, manifest: Pick<Manifest, 'files' | 'bridges' | 'scope' | 'reader' | 'parent'>) {
  mkdirSync(home, { recursive: true });
  for (const file of manifest.files) {
    const path = safePath(home, file.locator); mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, Buffer.from(file.bytes, 'base64'));
    if (dbFile(path)) {
      if (hash(tables(path)) !== file.root || hash(file.tables) !== file.root) throw new Error('DB_ROOT_MISMATCH');
    } else if (hash(readFileSync(path).toString('base64')) !== file.root) throw new Error('BYTE_ROOT_MISMATCH');
  }
  if (hash(inventory(home, manifest.reader)) !== hash(manifest.files.map(file => file.locator).sort())) throw new Error('READER_RANGE_MISMATCH');
  const retained = new Set(replayFiles(manifest).map(file => file.locator));
  for (const file of manifest.files) if (!retained.has(file.locator)) rmSync(safePath(home, file.locator));
  const files = replayFiles(manifest), source = manifest.scope.source;
  if (files.some(file => file.locator.endsWith('.zst'))) throw new Error('COMPRESSED_ARCHIVE_UNSUPPORTED');
  for (const file of files.filter(file => /\.(json|jsonl)$/.test(file.locator))) {
    const text = Buffer.from(file.bytes, 'base64').toString('utf8');
    const rows = file.locator.endsWith('.jsonl') ? text.split('\n').filter(row => row.trim()) : [text];
    for (const line of rows) {
      let row; try { row = JSON.parse(line); } catch { throw new Error('INCOMPLETE_JSON'); }
      if (source === 'geminiCli' && row.messages?.some((message: { tokens?: unknown; timestamp?: string }) =>
        message.tokens && (!message.timestamp || !Number.isFinite(Date.parse(message.timestamp))))) throw new Error('ESTIMATED_TIMESTAMP');
    }
  }
  const prices = new Map([[PHASE0_MODEL, PHASE0_PRICE], ['phase0-corrected-model', PHASE0_PRICE], ['deepseek-v4-pro', PHASE0_PRICE]]);
  const collected = manifest.reader === 'aiusage' ? collectIndexedAgentEvents(home, prices)
    : source === 'codex' ? collectCodexEvents(home, prices, new Set()) : source === 'commandcode' ? collectCommandCodeEvents(home, prices)
    : source === 'claudeCode' ? collectClaudeEvents(home, prices) : source === 'geminiCli' ? collectGeminiEvents(home, prices)
    : source === 'antigravity' ? collectAntigravityEvents(home, prices) : source === 'deepseekHarness' ? collectDeepSeekHarnessEvents(home, prices)
    : source === 'opencode' ? collectOpenCodeEvents(home, prices) : collectZCodeEvents(home, prices);
  if (collected.errors.length || collected.events.some(row => row.historyIncomplete)) throw new Error('COLLECTOR_INCOMPLETE');
  if (source === 'zcode' && manifest.reader !== 'aiusage' && files.some(file => file.tables?.some(table => table.name === 'model_usage'
    && table.rows.some(row => row.session_id === manifest.scope.sessionId && row.status === 'running')))) throw new Error('RUNNING_USAGE');
  const raw = collected.events.filter(row => row.sourceId === source && row.sessionId === manifest.scope.sessionId);
  if (!raw.length && !manifest.parent) throw new Error('EMPTY_BASELINE_SCOPE_UNVERIFIED');
  const ids = raw.map(nativeEventId); if (new Set(ids).size !== ids.length) throw new Error('AMBIGUOUS_SOURCE_ROWS');
  const commandHasIds = files.filter(file => file.locator.endsWith('.jsonl')).every(file => Buffer.from(file.bytes, 'base64').toString('utf8')
    .split('\n').filter(Boolean).every(line => !!JSON.parse(line).id));
  const observations: Observation[] = raw.map(row => ({ event: { eventId: nativeEventId(row), source, sessionId: row.sessionId,
    timestampMs: row.timestampMs, modelName: row.modelName, projectKey: row.projectKey + ':' + hash(row.workspacePath ?? row.projectKey).slice(0, 16),
    projectName: row.projectName, workspacePath: row.workspacePath, sessionTitle: row.sessionTitle, inputTokens: row.inputTokens, outputTokens: row.outputTokens,
    cacheReadTokens: row.cacheReadTokens, cacheCreationTokens: row.cacheCreationTokens, reasoningTokens: row.reasoningTokens,
    ...(row.costSource === 'recorded' && source !== 'codex' ? { recordedCost: row.nominalCost ?? row.cost } : {}) },
    nativeAnchor: manifest.reader === 'aiusage' || source === 'codex' || (source === 'commandcode' && !commandHasIds) ? undefined : row.eventId }));
  return { evidence: { status: 'complete', code: 'CONSISTENT_SNAPSHOT' }, observations };
}
export async function scan(home: string, scope: Scope, basis: PriceBasis,
  parent: Manifest['parent'] = null, options: { reader?: 'aiusage'; bridges?: Bridge[]; duringRead?: () => void } = {}): Promise<Manifest> {
  const reader = options.reader ?? scope.source, work = join(home, 'phase0c-capture-' + randomUUID());
  const result: UnsignedManifest = { schema: 'phase0c/1', collector: 'aef64f4', scope, reader, parent, files: [], bridges: options.bridges ?? [],
    status: 'SOURCE_READ_FAILED', readBefore: '', readAfter: '', snapshotRoot: '', recordCount: 0, sequenceRoot: hash([]), anchors: [],
    observations: [], basis, mappings: {} };
  mkdirSync(work, { recursive: true });
  try {
    const before = inspect(home, reader); result.readBefore = contentRoot(before);
    if (!before.length) { result.status = 'MISSING_ORIGIN'; return seal(result); }
    for (const file of before) {
      const input = join(home, file.locator), output = safePath(work, file.locator); mkdirSync(dirname(output), { recursive: true });
      if (dbFile(input)) { const db = new DatabaseSync(input, { readOnly: true }); try { await backup(db, output); } finally { db.close(); } }
      else writeFileSync(output, Buffer.from(file.bytes, 'base64'));
      const bytes = readFileSync(output).toString('base64'), logical = dbFile(output) ? tables(output) : undefined;
      result.files.push({ ...file, bytes, ...(logical ? { tables: logical, root: hash(logical) } : {}) });
    }
    options.duringRead?.();
    const after = inspect(home, reader); result.readAfter = contentRoot(after); result.snapshotRoot = contentRoot(result.files);
    if (result.readBefore !== result.readAfter || result.snapshotRoot !== result.readBefore) { result.status = 'CHANGED_DURING_READ'; return seal(result); }
    // Replay the exact captured capsule, rather than collect a third live view.
    const observed = await replay(join(work, 'replayed'), result);
    result.status = observed.evidence.status === 'complete' ? 'complete' : observed.evidence.code;
    result.observations = observed.observations; result.recordCount = result.observations.length;
    result.sequenceRoot = hash(result.observations); result.anchors = result.observations.flatMap(row => row.nativeAnchor ? [row.nativeAnchor] : []);
    return seal(result);
  } catch (error) { result.status = (error as Error).message; return seal(result); }
  finally { rmSync(work, { recursive: true, force: true }); }
}
