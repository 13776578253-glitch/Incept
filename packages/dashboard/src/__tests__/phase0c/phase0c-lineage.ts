// Isolated, whole-state SQLite oracle. No runtime exports or production schema.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, rmSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash } from '../../adapters/local/imports/identity';
import { ImportStore, type StoredBatch } from '../../adapters/local/imports/store';
import { loadImportedEvents } from '../../adapters/local/imports/layer';
import { applyCommandCodeQuota } from '../../adapters/local/pricing-schedule';
import { classifyAdoption, generation, pricedObservation, scopeId, type AdoptionProof, type Scope } from '../phase0b/phase0b-contract';
import { contentRoot, replay, type Manifest } from './phase0c-evidence';
import { qualify } from './phase0c-rules';

export type Receipt = { batchId: string; payloadHash: string; manifestHash: string; status: 'committed' | 'review-required'; code: string;
  revision: number; receiptHash: string };
type Grant = { manifestHash: string; batchId: string; positions: number[]; proof: AdoptionProof; actor: 'owner'; rule: string };
type State = { revision: number; bindings: Record<string, Scope>; versions: Manifest[]; receipts: Record<string, Receipt>;
  legacy: StoredBatch[]; grants: Grant[]; adopted: Record<string, string>; rolled: string[]; quarantined: Record<string, Manifest>; audit: unknown[] };
const empty = (): State => ({ revision: 0, bindings: {}, versions: [], receipts: {}, legacy: [], grants: [], adopted: {}, rolled: [], quarantined: {}, audit: [] });
const ref = (batch: string, position: number) => JSON.stringify([batch, position]);
const batchKey = (device: string, id: string) => JSON.stringify([device, id]);
const latest = (state: State, scope: Scope) => state.versions.filter(row => scopeId(row.scope) === scopeId(scope)).at(-1);
function proofDirectory(path: string) {
  const target = resolve(path);
  if (!target.includes('sync-agent-phase0c')) throw new Error('ISOLATED_PROOF_PATH_REQUIRED');
  mkdirSync(target, { recursive: true }); return target;
}
function candidate(manifest: Manifest) {
  return generation({ scope: manifest.scope, parent: manifest.parent?.id ?? null, observations: manifest.observations,
    evidence: { status: 'complete', code: manifest.status, inventoryHash: hash(manifest.files.map(file => file.locator)),
      snapshotHash: manifest.snapshotRoot, originId: manifest.scope.originId, consistentRead: true, parseErrors: 0,
      history: 'known-scope', coverage: 'snapshot-only', beforeHash: manifest.readBefore, afterHash: manifest.readAfter },
    basis: manifest.basis, mappings: manifest.mappings, operation: 'observe', removedAnchors: [] });
}
export class LineageServer {
  readonly db: DatabaseSync;
  readonly directory: string;
  constructor(directory: string) {
    this.directory = proofDirectory(directory); this.db = new DatabaseSync(join(this.directory, 'lineage.db'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=1000; CREATE TABLE IF NOT EXISTS phase0c_state(id INTEGER PRIMARY KEY, payload TEXT NOT NULL)');
    this.db.prepare('INSERT OR IGNORE INTO phase0c_state VALUES(1,?)').run(JSON.stringify(empty()));
  }
  close() { this.db.close(); }
  state(): State { return JSON.parse(String(this.db.prepare('SELECT payload FROM phase0c_state WHERE id=1').get()!.payload)); }
  private transaction<T>(action: (state: State) => T, fail?: boolean, onStage?: () => void): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const state = this.state(), result = action(state);
      this.db.prepare('UPDATE phase0c_state SET payload=? WHERE id=1').run(JSON.stringify(state));
      onStage?.(); if (fail) throw new Error('INJECTED_COMMIT_FAILURE');
      this.db.exec('COMMIT'); return result;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  register(scope: Scope) {
    this.transaction(state => {
      for (const binding of Object.values(state.bindings)) if (binding.originId === scope.originId && hash(binding) !== hash(scope)) throw new Error('ORIGIN_ALREADY_OWNED');
      const prior = state.bindings[scopeId(scope)]; if (prior && hash(prior) !== hash(scope)) throw new Error('SCOPE_ALREADY_BOUND');
      if (!prior) state.audit.push({ kind: 'origin-registration', scope, bindingVersion: 1, actor: 'fixture-owner' });
      state.bindings[scopeId(scope)] = scope;
    });
  }
  attachLegacy(path: string) {
    // Test-owned v1 DB only; source payloads/receipts remain immutable except explicit rollback.
    const store = new ImportStore(path); let batches: StoredBatch[];
    try { batches = store.batches().reverse(); } finally { store.close(); }
    this.transaction(state => {
      for (const batch of batches) {
        const old = state.legacy.find(row => row.receipt.id === batch.receipt.id);
        if (old && hash([old.bundle, old.mappings]) !== hash([batch.bundle, batch.mappings])) throw new Error('LEGACY_PAYLOAD_CHANGED');
        if (!old) state.legacy.push(batch); else old.receipt = batch.receipt;
      }
    });
  }
  private async validate(manifest: Manifest) {
    const { manifestHash, ...body } = manifest;
    if (hash(body) !== manifestHash) throw new Error('MANIFEST_HASH_MISMATCH');
    if (manifest.schema !== 'phase0c/1' || manifest.collector !== 'aef64f4') throw new Error('SCHEMA_VERSION_UNSUPPORTED');
    if (manifest.status !== 'complete') throw new Error(manifest.status);
    if (manifest.readBefore !== manifest.readAfter || manifest.readBefore !== manifest.snapshotRoot
      || contentRoot(manifest.files) !== manifest.snapshotRoot) throw new Error('READ_ROOT_MISMATCH');
    if (new Set(manifest.files.map(file => file.locator)).size !== manifest.files.length) throw new Error('DUPLICATE_LOCATOR');
    const work = join(this.directory, 'verification-' + randomUUID());
    try {
      const actual = await replay(work, manifest);
      if (actual.evidence.status !== 'complete') throw new Error(actual.evidence.code);
      if (hash(actual.observations) !== hash(manifest.observations) || hash(actual.observations) !== manifest.sequenceRoot
        || actual.observations.length !== manifest.recordCount || hash(actual.observations.flatMap(row => row.nativeAnchor ? [row.nativeAnchor] : [])) !== hash(manifest.anchors)) throw new Error('COLLECTOR_EVIDENCE_MISMATCH');
    } finally { rmSync(work, { recursive: true, force: true }); }
  }
  async reviewLegacy(manifest: Manifest, batchId: string, proof: AdoptionProof, actor: string) {
    if (actor !== 'owner') throw new Error('OWNER_REQUIRED');
    await this.validate(manifest);
    return this.transaction(state => {
      if (hash(state.bindings[scopeId(manifest.scope)]) !== hash(manifest.scope)) throw new Error('SCOPE_BINDING_MISMATCH');
      const batch = state.legacy.find(row => row.receipt.id === batchId); if (!batch) throw new Error('UNKNOWN_LEGACY_BATCH');
      const positions = batch.bundle.events.flatMap((row, i) => row.source === manifest.scope.source && row.sessionId === manifest.scope.sessionId ? [i] : []);
      if (!positions.length) throw new Error('NO_LEGACY_SCOPE');
      const result = classifyAdoption(positions.map(i => batch.bundle.events[i]), candidate(manifest), batch.bundle.device.id, batch.bundle.checksum, proof);
      if (result !== 'auto-adopt') throw new Error('ADOPTION_' + result.toUpperCase());
      if (proof.kind !== 'owner-reviewed' && positions.some(position => {
        const key = batch.bundle.events[position].projectKey;
        return (batch.mappings[key] || null) !== (manifest.mappings[key] || null);
      })) throw new Error('MAPPING_REVIEW_REQUIRED');
      if (proof.kind !== 'owner-reviewed' && (Object.keys(manifest.basis.aliases).length || positions.some(position => {
        const model = batch.bundle.events[position].modelName;
        return hash(batch.bundle.prices[model]) !== hash(manifest.basis.rates[model]);
      }))) throw new Error('PRICING_REVIEW_REQUIRED');
      state.grants.push({ manifestHash: manifest.manifestHash, batchId, positions, proof, actor: 'owner', rule: proof.kind });
      state.audit.push({ kind: 'adoption-grant', actor, batchId, checksum: batch.bundle.checksum, manifestHash: manifest.manifestHash, positions, proof });
      return result;
    });
  }
  async submit(batchId: string, manifest: Manifest, authenticatedDevice: string, options: { failCommit?: boolean; onStage?: () => void } = {}): Promise<Receipt> {
    if (authenticatedDevice !== manifest.scope.deviceId) throw new Error('DEVICE_MISMATCH');
    const payloadHash = hash(manifest), key = batchKey(authenticatedDevice, batchId), existing = this.state().receipts[key];
    if (existing) { if (existing.payloadHash !== payloadHash) throw new Error('BATCH_PAYLOAD_MISMATCH'); return existing; }
    let validationError: string | undefined;
    try { await this.validate(manifest); } catch (error) { validationError = (error as Error).message; }
    return this.transaction(state => {
      const priorReceipt = state.receipts[key];
      if (priorReceipt) { if (priorReceipt.payloadHash !== payloadHash) throw new Error('BATCH_PAYLOAD_MISMATCH'); return priorReceipt; }
      let code = validationError ?? '', accepted = false;
      try {
        if (code === 'MANIFEST_HASH_MISMATCH') throw new Error(code);
        if (hash(state.bindings[scopeId(manifest.scope)]) !== hash(manifest.scope)) throw new Error('SCOPE_BINDING_MISMATCH');
        const parent = latest(state, manifest.scope);
        if (parent && parent.reader !== manifest.reader) throw new Error('SCOPE_BINDING_MISMATCH');
        if (parent && manifest.files.length && parent.files.some(old => !manifest.files.some(file => file.locator === old.locator)
          && !manifest.bridges.some(bridge => bridge.from === old.locator))) throw new Error('ROTATION_UNVERIFIED');
        if (parent && manifest.files.some(file => !parent.files.some(old => old.locator === file.locator)
          && parent.files.some(old => old.root === file.root) && !manifest.bridges.some(bridge => bridge.to === file.locator))) throw new Error('ROTATION_UNVERIFIED');
        if (code) throw new Error(code);
        code = qualify(parent, manifest);
        if (parent && state.rolled.includes(parent.manifestHash)) throw new Error('ROLLED_BACK_LINEAGE_REVIEW_REQUIRED');
        const overlaps = state.legacy.flatMap(batch => batch.bundle.device.id === manifest.scope.deviceId ? batch.bundle.events.flatMap((event, position) =>
          event.source === manifest.scope.source && event.sessionId === manifest.scope.sessionId ? [{ batch, position }] : []) : []);
        for (const { batch, position } of overlaps) {
          const reference = ref(batch.receipt.id, position);
          if (state.adopted[reference] === scopeId(manifest.scope)) continue;
          const grant = state.grants.find(item => item.manifestHash === manifest.manifestHash && item.batchId === batch.receipt.id && item.positions.includes(position));
          if (!grant) throw new Error('V1_ADOPTION_REVIEW_REQUIRED');
        }
        for (const { batch, position } of overlaps) state.adopted[ref(batch.receipt.id, position)] = scopeId(manifest.scope);
        state.versions.push(manifest); state.revision++; accepted = true;
      } catch (error) { code = (error as Error).message; }
      const body = { batchId, payloadHash, manifestHash: manifest.manifestHash, status: accepted ? 'committed' as const : 'review-required' as const, code, revision: state.revision };
      const receipt = { ...body, receiptHash: hash(body) }; state.receipts[key] = receipt;
      if (!accepted) state.quarantined[key] = manifest;
      state.audit.push({ kind: 'submission', ...receipt, parent: manifest.parent, actor: authenticatedDevice });
      return receipt;
    }, options.failCommit, options.onStage);
  }
  receipt(device: string, batchId: string) { return this.state().receipts[batchKey(device, batchId)]; }
  rollbackRevision(id: string, actor: string) {
    if (actor !== 'owner') throw new Error('OWNER_REQUIRED');
    this.transaction(state => { if (!state.versions.some(row => row.manifestHash === id)) throw new Error('UNKNOWN_GENERATION');
      state.rolled.push(id); state.revision++; state.audit.push({ kind: 'revision-rollback', id, actor }); });
  }
  view() {
    const state = this.state(), selected = new Map<string, Manifest>();
    for (const manifest of state.versions) if (!state.rolled.includes(manifest.manifestHash)) selected.set(scopeId(manifest.scope), manifest);
    // Preserve the REAL v1 compatibility reader, including oldest-batch precedence.
    const compat = join(this.directory, 'compat-' + randomUUID() + '.db'), store = new ImportStore(compat);
    try {
      for (const batch of state.legacy.filter(row => row.receipt.status === 'active')) {
        const events = batch.bundle.events.filter((_, position) => !selected.has(state.adopted[ref(batch.receipt.id, position)]));
        store.saveBatch({ ...batch, bundle: { ...batch.bundle, events } }, hash(batch.mappings));
      }
    } finally { store.close(); }
    try {
      const legacy = loadImportedEvents([], new Map(), {}, compat).events.map(applyCommandCodeQuota);
      const current = [...selected.values()].flatMap(manifest => manifest.observations.map(row => {
        const event = pricedObservation(manifest.scope, row, manifest.basis, manifest.mappings);
        const ancestor = state.legacy.find(batch => batch.bundle.events.some((_, i) => state.adopted[ref(batch.receipt.id, i)] === scopeId(manifest.scope)));
        // Keep the original imported-event provenance in the statistical oracle.
        return { ...event, ...(ancestor ? { importBatchId: ancestor.receipt.id } : {}) };
      }));
      return [...legacy, ...current];
    } finally { for (const suffix of ['', '-wal', '-shm']) rmSync(compat + suffix, { force: true }); }
  }
}

type ClientState = { scope: Scope; acknowledged: Manifest['parent']; pending?: { batchId: string; manifest: Manifest }; receipt?: Receipt;
  conflicts?: Array<{ batchId: string; manifest: Manifest; receipt: Receipt }> };
export class LineageClient {
  readonly path: string;
  constructor(directory: string, scope: Scope) {
    this.path = join(proofDirectory(directory), 'client-' + scopeId(scope) + '.json');
    if (!existsSync(this.path)) this.save({ scope, acknowledged: null });
    if (hash(this.state().scope) !== hash(scope)) throw new Error('CLIENT_SCOPE_MISMATCH');
  }
  state(): ClientState { return JSON.parse(readFileSync(this.path, 'utf8')); }
  private save(state: ClientState) {
    const temporary = this.path + '.next'; writeFileSync(temporary, JSON.stringify(state));
    const descriptor = openSync(temporary, 'r+'); try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
    renameSync(temporary, this.path);
  }
  prepare(batchId: string, manifest: Manifest) {
    const state = this.state();
    if (state.pending && hash(state.pending) !== hash({ batchId, manifest })) throw new Error('UNACKNOWLEDGED_BATCH_PENDING');
    if (hash(manifest.parent) !== hash(state.acknowledged) || hash(manifest.scope) !== hash(state.scope)) throw new Error('CLIENT_PARENT_MISMATCH');
    state.pending = { batchId, manifest }; this.save(state);
  }
  acknowledge(receipt: Receipt, server: LineageServer) {
    const state = this.state(), pending = state.pending;
    if (!pending || receipt.status !== 'committed' || receipt.batchId !== pending.batchId || receipt.payloadHash !== hash(pending.manifest)
      || receipt.manifestHash !== pending.manifest.manifestHash || hash(server.receipt(state.scope.deviceId, pending.batchId)) !== hash(receipt)) throw new Error('COMMIT_RECEIPT_REQUIRED');
    state.acknowledged = { id: receipt.manifestHash, hash: receipt.manifestHash }; state.receipt = receipt; delete state.pending; this.save(state);
  }
  retainConflict(receipt: Receipt, server: LineageServer) {
    const state = this.state(), pending = state.pending;
    if (!pending || receipt.status !== 'review-required' || receipt.batchId !== pending.batchId || receipt.payloadHash !== hash(pending.manifest)
      || hash(server.receipt(state.scope.deviceId, pending.batchId)) !== hash(receipt)) throw new Error('DURABLE_REVIEW_RECEIPT_REQUIRED');
    state.conflicts = [...(state.conflicts ?? []), { ...pending, receipt }]; delete state.pending; this.save(state);
  }
}
