// Finite since-enrollment rules. Counts, timestamps and row positions are NOT entity IDs.
import { basename } from 'node:path';
import { hash } from '../../adapters/local/imports/identity';
import { embeddedSession, prefix, type FileEvidence, type Manifest } from './phase0c-evidence';

function deny(code: string): never { throw new Error(code); }
const json = (file: FileEvidence) => Buffer.from(file.bytes, 'base64').toString('utf8');
function envelope(row: Record<string, unknown>, source: Manifest['scope']['source']): unknown {
  const copy = structuredClone(row) as Record<string, unknown> & { message?: Record<string, unknown>; payload?: { info?: Record<string, unknown> } };
  if (source === 'codex' && copy.payload?.info) {
    copy.payload.info = Object.fromEntries(Object.entries(copy.payload.info).map(([key, value]) =>
      [key, key === 'total_token_usage' || key === 'last_token_usage' ? 'COUNTERS' : value]));
  } else if (source === 'commandcode') { delete copy.usage; }
  else if (source === 'claudeCode') { if (copy.message) delete copy.message.usage; delete copy.costUSD; }
  else if (source === 'geminiCli') { delete copy.tokens; }
  else if (source === 'deepseekHarness' && copy.data && typeof copy.data === 'object') { delete (copy.data as Record<string, unknown>).usage; }
  return copy;
}
function codexSequence(next: Manifest) {
  const points = next.files.filter(file => file.locator.endsWith('.jsonl')).flatMap(file => json(file).split('\n').filter(Boolean).map(row => JSON.parse(row)))
    .filter(row => row.type === 'event_msg' && row.payload?.type === 'token_count');
  // Archive copies have already been bridged. Identical copies collapse here only
  // for ordering validation; collectors still process the verified replay scope.
  const unique = [...new Map(points.map(row => [hash(row), row])).values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  let prior: Record<string, number> = {}, timestamp = -Infinity;
  for (const point of unique) {
    const at = Date.parse(point.timestamp), total = point.payload.info?.total_token_usage;
    if (!Number.isFinite(at) || at <= timestamp || !total || !Object.keys(total).length) deny('CODEX_TIMELINE_AMBIGUOUS');
    for (const [key, raw] of Object.entries(total)) {
      const count = Number(raw);
      if (!Number.isFinite(count) || count < 0 || count < (prior[key] ?? 0)) deny('CODEX_COUNTER_EPOCH_UNVERIFIED');
    }
    if ((total.cached_input_tokens ?? 0) > (total.input_tokens ?? 0) || (total.reasoning_output_tokens ?? 0) > (total.output_tokens ?? 0)) deny('CODEX_COUNTER_INVALID');
    prior = total; timestamp = at;
  }
  if (!unique.length) deny('CODEX_TIMELINE_AMBIGUOUS');
}
function jsonContinuity(old: FileEvidence, next: FileEvidence, manifest: Manifest) {
  const source = manifest.scope.source;
  if (old.locator.endsWith('.jsonl')) {
    if (prefix(old, next)) return;
    if (source === 'codex' && (!embeddedSession(old, source, manifest.scope.sessionId) || !embeddedSession(next, source, manifest.scope.sessionId))) deny('CODEX_SESSION_ANCHOR_REQUIRED');
    const before = json(old).split('\n').filter(Boolean).map(row => JSON.parse(row)), after = json(next).split('\n').filter(Boolean).map(row => JSON.parse(row));
    if (before.length > after.length) deny('PREFIX_LOST');
    // A revision may change only the source-specific counter fields, retaining
    // the entire surrounding anchor/order/time/model/session evidence.
    if (!before.every((row, i) => hash(envelope(row, source)) === hash(envelope(after[i], source)))) deny('REVISION_ENVELOPE_CHANGED');
    if (source !== 'codex' && manifest.observations.some(row => !row.nativeAnchor)) deny('WEAK_REVISION_REVIEW_REQUIRED');
    return;
  }
  if (source !== 'geminiCli') deny('JSON_REWRITE_UNVERIFIED');
  const before = JSON.parse(json(old)), after = JSON.parse(json(next));
  if (before.sessionId !== manifest.scope.sessionId || after.sessionId !== before.sessionId) deny('SESSION_ANCHOR_CHANGED');
  if (hash({ ...before, messages: null }) !== hash({ ...after, messages: null })) deny('REVISION_ENVELOPE_CHANGED');
  if (before.messages.length > after.messages.length) deny('PREFIX_LOST');
  for (let i = 0; i < before.messages.length; i++) {
    const a = before.messages[i], b = after.messages[i];
    if (hash(a) === hash(b)) continue;
    if (!a.id || !b.id) deny('WEAK_REVISION_REVIEW_REQUIRED');
    if (hash(envelope(a, source)) !== hash(envelope(b, source))) deny('REVISION_ENVELOPE_CHANGED');
  }
}
function dbContinuity(old: FileEvidence, next: FileEvidence, manifest: Manifest) {
  if (!old.tables || !next.tables) deny('DB_SCHEMA_UNVERIFIED');
  if (hash(old.tables.map(table => [table.name, table.schema])) !== hash(next.tables.map(table => [table.name, table.schema]))) deny('DB_SCHEMA_UNVERIFIED');
  for (const table of old.tables) {
    const range = (rows: Record<string, unknown>[]) => manifest.reader !== 'aiusage' && ['opencode', 'zcode'].includes(manifest.scope.source)
      ? rows.filter(row => table.name === 'session' ? row.id === manifest.scope.sessionId
        : row.session_id !== undefined ? row.session_id === manifest.scope.sessionId : true) : rows;
    const before = range(table.rows), afterRows = range(next.tables.find(row => row.name === table.name)!.rows);
    const keyed = before.length > 0 && before.every(row => row.id !== undefined && row.id !== null)
      && new Set(before.map(row => hash(row.id))).size === before.length;
    if (!keyed) {
      if (before.length > afterRows.length) deny('DB_RECORD_DISAPPEARED');
      if (!before.every((row, i) => hash(row) === hash(afterRows[i]))) deny('WEAK_DB_REVISION_REVIEW_REQUIRED');
      continue;
    }
    const keys = new Map(afterRows.map(row => [hash(row.id), row]));
    if (keys.size !== afterRows.length) deny('DB_KEY_AMBIGUOUS');
    for (const row of before) {
      const after = keys.get(hash(row.id)); if (!after) deny('DB_RECORD_DISAPPEARED');
      if (hash(row) === hash(after)) continue;
      if (manifest.reader === 'aiusage' || !['opencode', 'zcode'].includes(manifest.scope.source)) deny('NATIVE_REVISION_UNVERIFIED');
      // Only usage/cost revisions under the same logical PK/session/time/model.
      const mask = (value: Record<string, unknown>) => {
        const copy = { ...value };
        if (table.name === 'message' || table.name === 'session_message') {
          const data = JSON.parse(String(copy.data)); delete data.tokens; delete data.cost; copy.data = data;
        } else if (table.name === 'model_usage') {
          for (const key of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'reasoning_tokens', 'cost']) delete copy[key];
        }
        return copy;
      };
      if (hash(mask(row)) !== hash(mask(after))) deny('REVISION_ENVELOPE_CHANGED');
    }
  }
}
export function qualify(parent: Manifest | undefined, next: Manifest): 'baseline-observed' | 'since-enrollment' | 'unchanged' {
  if (!parent) {
    if (next.parent) deny('PARENT_MISMATCH');
    if (next.bridges.length) deny('ROTATION_UNVERIFIED');
    if (next.scope.source === 'codex' && next.reader !== 'aiusage') codexSequence(next);
    return 'baseline-observed';
  }
  if (next.parent?.id !== parent.manifestHash || next.parent.hash !== parent.manifestHash) deny('PARENT_MISMATCH');
  if (hash(next.scope) !== hash(parent.scope) || next.reader !== parent.reader) deny('SCOPE_BINDING_MISMATCH');
  if (hash(next.basis) !== hash(parent.basis) || hash(next.mappings) !== hash(parent.mappings)) deny('EXPLICIT_REPRICE_OR_MAPPING_REQUIRED');
  const targets = new Set<string>();
  for (const bridge of next.bridges) {
    const old = parent.files.find(file => file.locator === bridge.from), target = next.files.find(file => file.locator === bridge.to);
    if (!old || !target || bridge.parentHash !== parent.manifestHash || bridge.oldRoot !== old.root) deny('ROTATION_UNVERIFIED');
    if (bridge.kind === 'same-file') {
      if (old.identity !== target.identity || basename(old.locator) !== basename(target.locator)) deny('ROTATION_UNVERIFIED');
      if (old.root !== target.root && !prefix(old, target)) deny('ROTATION_UNVERIFIED');
    } else if (old.tables || target.tables || !prefix(old, target)
      || !embeddedSession(old, next.scope.source, next.scope.sessionId) || !embeddedSession(target, next.scope.source, next.scope.sessionId)) deny('ROTATION_UNVERIFIED');
    targets.add(target.locator);
  }
  for (const old of parent.files) {
    const same = next.files.find(file => file.locator === old.locator);
    const bridge = next.bridges.find(item => item.from === old.locator);
    const later = same ?? next.files.find(file => file.locator === bridge?.to);
    if (!later) deny('ROTATION_UNVERIFIED');
    if (!bridge && old.identity !== later.identity) deny(old.tables ? 'DB_REPLACED_UNVERIFIED' : 'FILE_REPLACED_UNVERIFIED');
    if (old.root === later.root) continue;
    if (old.tables) dbContinuity(old, later, next); else jsonContinuity(old, later, next);
  }
  for (const added of next.files.filter(file => !parent.files.some(old => old.locator === file.locator) && !targets.has(file.locator))) {
    // A new shard is admissible only with its own embedded session anchor;
    // disappearing old shards still require the separate bridge above.
    if (!embeddedSession(added, next.scope.source, next.scope.sessionId)) deny('NEW_SHARD_UNVERIFIED');
  }
  const oldAnchors = parent.observations.filter(row => row.nativeAnchor);
  for (const old of oldAnchors) {
    const row = next.observations.find(row => row.nativeAnchor === old.nativeAnchor);
    if (!row) deny('NATIVE_ANCHOR_DISAPPEARED');
    if (row.event.timestampMs !== old.event.timestampMs) deny('NATIVE_TIME_CHANGED');
  }
  // Content hashes here prove retention inside this pair of snapshots. They do
  // not become weak records' cross-generation entity identities.
  if (next.scope.source !== 'codex' || next.reader === 'aiusage') {
    const retained = new Map<string, number>();
    for (const row of next.observations) retained.set(hash(row), (retained.get(hash(row)) ?? 0) + 1);
    for (const row of parent.observations.filter(row => !row.nativeAnchor)) {
      const key = hash(row), count = retained.get(key) ?? 0;
      if (!count) deny('WEAK_OBSERVATION_DISAPPEARED'); retained.set(key, count - 1);
    }
  }
  if (next.scope.source === 'codex' && next.reader !== 'aiusage') codexSequence(next);
  return hash(parent.files.map(file => [file.locator, file.root])) === hash(next.files.map(file => [file.locator, file.root]))
    && parent.sequenceRoot === next.sequenceRoot ? 'unchanged' : 'since-enrollment';
}
