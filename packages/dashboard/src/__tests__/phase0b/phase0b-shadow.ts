// PHASE 0B SHADOW PROTOTYPE. Event-sourced, deliberately small and test-only.
// Whole-log replay/materialization is a correctness oracle, NOT the Phase 1 storage design.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ImportReceipt } from '../../domain';
import type { RawUsageEvent, UnitPricing } from '../../adapters/local/types';
import { hash, nativeEventId } from '../../adapters/local/imports/identity';
import { identityIndex } from '../../adapters/local/imports/matching';
import { ImportStore, type StoredBatch } from '../../adapters/local/imports/store';
import { loadImportedEvents } from '../../adapters/local/imports/layer';
import { applyCommandCodeQuota } from '../../adapters/local/pricing-schedule';
import { classifyAdoption, logicalIdentity, priceVersion, pricedObservation, scopeId, verifyGeneration,
  type AdoptionProof, type Scope, type SessionGeneration } from './phase0b-contract';

type Reference = { batchId: string; position: number };
type Operation = { kind: 'legacy'; batch: StoredBatch; order: number }
  | { kind: 'legacy-receipt'; receipt: ImportReceipt }
  | { kind: 'legacy-rollback'; batchId: string }
  | { kind: 'register'; scope: Scope }
  | { kind: 'fixture-certificate'; id: string }
  | { kind: 'adopt'; refs: Reference[]; candidate: SessionGeneration; proof: AdoptionProof; audit: { actor: string; reason: string } }
  | { kind: 'adoption-review'; batchId: string; positions: number[]; scope: Scope; code: 'review-required' | 'conflict'; proof: AdoptionProof }
  | { kind: 'generation'; batchId: string; value: SessionGeneration; error?: string; reprice?: boolean;
      audit: { actor: string; reason: string; previousGeneration: string | null } }
  | { kind: 'revision-rollback'; generationId: string }
  | { kind: 'revoke'; deviceId: string }
  | { kind: 'switch' };
export type ShadowReceipt = { batchId: string; status: 'committed' | 'quarantined'; code?: string; dataRevision: number; generationId: string };
type State = {
  legacy: Map<string, { batch: StoredBatch; order: number }>;
  bindings: Map<string, Scope>;
  certificates: Set<string>;
  adopted: Map<string, { scope: string; proof: AdoptionProof; legacyEventId: string; entityIds: string[]; rule: string }>;
  versions: Array<{ value: SessionGeneration; sequence: number }>;
  rolled: Set<string>; revoked: Set<string>;
  receipts: Map<string, ShadowReceipt>;
  reviews: Array<Extract<Operation, { kind: 'adoption-review' }>>;
  switched: boolean;
};
const referenceKey = (ref: Reference) => JSON.stringify([ref.batchId, ref.position]);
function empty(): State { return { legacy: new Map(), bindings: new Map(), certificates: new Set(), adopted: new Map(), versions: [], rolled: new Set(), revoked: new Set(), receipts: new Map(), reviews: [], switched: false }; }
const certificate = (value: SessionGeneration) => hash([value.scope, value.evidence, value.observations]);
function selected(state: State) {
  const active = new Map<string, SessionGeneration>();
  for (const row of state.versions) if (!state.rolled.has(row.value.generationId)) active.set(scopeId(row.value.scope), row.value);
  return active;
}
function reduce(state: State, operation: Operation, seq: number) {
  switch (operation.kind) {
    case 'legacy': state.legacy.set(operation.batch.receipt.id, { batch: operation.batch, order: operation.order }); break;
    case 'legacy-receipt': {
      const item = state.legacy.get(operation.receipt.id); if (!item) throw new Error('UNKNOWN_LEGACY_BATCH');
      item.batch.receipt = operation.receipt; break;
    }
    case 'legacy-rollback': {
      const row = state.legacy.get(operation.batchId); if (!row) throw new Error('UNKNOWN_LEGACY_BATCH');
      row.batch.receipt.status = 'rolled_back'; break;
    }
    case 'register':
      for (const binding of state.bindings.values()) if (binding.originId === operation.scope.originId && binding.deviceId !== operation.scope.deviceId) throw new Error('ORIGIN_ALREADY_OWNED');
      state.bindings.set(scopeId(operation.scope), operation.scope); break;
    case 'fixture-certificate': state.certificates.add(operation.id); break;
    case 'adopt':
      for (const ref of operation.refs) {
        const previous = state.adopted.get(referenceKey(ref)), target = scopeId(operation.candidate.scope);
        if (previous && previous.scope !== target) throw new Error('ADOPTION_OWNERSHIP_CONFLICT');
        const legacyEvent = state.legacy.get(ref.batchId)!.batch.bundle.events[ref.position];
        const content = (event: typeof legacyEvent) => hash({ ...event, eventId: undefined });
        const corresponding = operation.candidate.observations.filter(row => content(row.event) === content(legacyEvent));
        const mapped = corresponding.length ? corresponding : operation.candidate.observations;
        state.adopted.set(referenceKey(ref), { scope: target, proof: operation.proof, legacyEventId: legacyEvent.eventId,
          entityIds: [...new Set(mapped.map(row => logicalIdentity(operation.candidate.scope, row.nativeAnchor)))],
          rule: operation.proof.kind === 'owner-reviewed' ? 'explicit-owner-mapping' : corresponding[0]?.nativeAnchor ? 'unique-content-to-native' : 'session-aggregate' });
      }
      break;
    case 'adoption-review': state.reviews.push(operation); break;
    case 'generation':
      if (!operation.error && !state.versions.some(row => row.value.generationId === operation.value.generationId)) state.versions.push({ value: operation.value, sequence: seq });
      state.receipts.set(JSON.stringify([operation.value.scope.deviceId, operation.batchId]), { batchId: operation.batchId,
        status: operation.error ? 'quarantined' : 'committed', code: operation.error, dataRevision: seq, generationId: operation.value.generationId });
      break;
    case 'revision-rollback':
      if (!state.versions.some(row => row.value.generationId === operation.generationId)) throw new Error('UNKNOWN_REVISION');
      state.rolled.add(operation.generationId); break;
    case 'revoke': state.revoked.add(operation.deviceId); break;
    case 'switch': state.switched = true; break;
  }
}

export class Phase0bShadow {
  readonly db: DatabaseSync;
  onStage?: (stage: string) => void;
  private readonly compat: string;
  constructor(readonly directory: string) {
    if (!directory.includes('sync-agent-phase0b')) throw new Error('SHADOW_REQUIRES_ISOLATED_DIRECTORY');
    mkdirSync(directory, { recursive: true }); this.compat = join(directory, 'phase0b-compat.db');
    this.db = new DatabaseSync(join(directory, 'phase0b-shadow.db'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;
      CREATE TABLE IF NOT EXISTS phase0b_log(seq INTEGER PRIMARY KEY AUTOINCREMENT,op_id TEXT UNIQUE NOT NULL,payload_hash TEXT NOT NULL,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS phase0b_projection(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS phase0b_versions(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS phase0b_memberships(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS phase0b_receipts(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS phase0b_adoptions(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS phase0b_conflicts(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS phase0b_meta(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,switched INTEGER NOT NULL);
      INSERT INTO phase0b_meta VALUES(1,0,0) ON CONFLICT(id) DO NOTHING;`);
  }
  close() { this.db.close(); }
  private state(): State {
    const state = empty();
    for (const row of this.db.prepare('SELECT seq,payload FROM phase0b_log ORDER BY seq').all()) reduce(state, JSON.parse(String(row.payload)) as Operation, Number(row.seq));
    return state;
  }
  get revision() { return Number(this.db.prepare('SELECT revision FROM phase0b_meta WHERE id=1').get()!.revision); }
  private append(opId: string, operation: Operation, failAt?: string) {
    const digest = hash(operation);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const prior = this.db.prepare('SELECT payload_hash FROM phase0b_log WHERE op_id=?').get(opId);
      if (prior) {
        if (prior.payload_hash !== digest) throw new Error('OP_ID_REUSED_WITH_DIFFERENT_PAYLOAD');
        this.db.exec('COMMIT'); return;
      }
      const info = this.db.prepare('INSERT INTO phase0b_log(op_id,payload_hash,payload) VALUES(?,?,?)').run(opId, digest, JSON.stringify(operation));
      const revision = Number(info.lastInsertRowid);
      this.onStage?.('after-log');
      if (failAt === 'after-log') throw new Error('INJECTED_FAILURE');
      this.materialize(this.state(), revision, failAt);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private materialize(state: State, revision: number, failAt?: string) {
    this.db.exec('DELETE FROM phase0b_versions; DELETE FROM phase0b_memberships; DELETE FROM phase0b_adoptions; DELETE FROM phase0b_receipts; DELETE FROM phase0b_projection; DELETE FROM phase0b_conflicts;');
    for (const { value } of state.versions) this.db.prepare('INSERT INTO phase0b_versions VALUES(?,?)').run(value.generationId, JSON.stringify(value));
    this.onStage?.('after-version');
    if (failAt === 'after-version') throw new Error('INJECTED_FAILURE');
    for (const [batchId, { batch }] of state.legacy) for (const [position, event] of batch.bundle.events.entries()) {
      const ref = referenceKey({ batchId, position });
      this.db.prepare('INSERT INTO phase0b_memberships VALUES(?,?)').run(ref, JSON.stringify({ batchId, position, eventId: event.eventId,
        active: batch.receipt.status === 'active', adopted: state.adopted.get(ref)?.scope, entityIds: state.adopted.get(ref)?.entityIds }));
    }
    for (const { value } of state.versions) for (const [position, row] of value.observations.entries()) {
      const id = JSON.stringify([value.generationId, position]);
      this.db.prepare('INSERT INTO phase0b_memberships VALUES(?,?)').run(id, JSON.stringify({ generationId: value.generationId,
        entity: logicalIdentity(value.scope, row.nativeAnchor), position, eligible: !state.rolled.has(value.generationId),
        current: selected(state).get(scopeId(value.scope))?.generationId === value.generationId }));
    }
    for (const [ref, adoption] of state.adopted) this.db.prepare('INSERT INTO phase0b_adoptions VALUES(?,?)').run(ref, JSON.stringify(adoption));
    for (const review of state.reviews) this.db.prepare('INSERT INTO phase0b_conflicts VALUES(?,?)').run(hash(review), JSON.stringify(review));
    for (const [i, row] of this.visible(state).entries()) this.db.prepare('INSERT INTO phase0b_projection VALUES(?,?)').run(String(i), JSON.stringify(row));
    this.onStage?.('after-projection');
    if (failAt === 'after-projection' || failAt === 'before-receipt') throw new Error('INJECTED_FAILURE');
    for (const [id, receipt] of state.receipts) this.db.prepare('INSERT INTO phase0b_receipts VALUES(?,?)').run(id, JSON.stringify(receipt));
    this.db.prepare('UPDATE phase0b_meta SET revision=?,switched=? WHERE id=1').run(revision, Number(state.switched));
  }
  register(scope: Scope) { this.append('register:' + scopeId(scope), { kind: 'register', scope }); }
  certifyFixture(value: SessionGeneration, expectedInputs: number[]) {
    // Only the controlled fixture writer knows the complete expected set. This is explicitly
    // NOT a certificate that existing real collectors can currently supply.
    verifyGeneration(value);
    if (hash(value.observations.map(row => row.event.inputTokens)) !== hash(expectedInputs)) throw new Error('FIXTURE_ORACLE_MISMATCH');
    const id = certificate(value); this.append('fixture-certificate:' + id, { kind: 'fixture-certificate', id });
  }
  migrate(sourcePath: string, stopAfter?: number) {
    const source = new DatabaseSync(sourcePath, { readOnly: true });
    try {
      const rows = source.prepare('SELECT rowid AS legacy_order,receipt,payload FROM batches ORDER BY rowid').all();
      for (const [index, row] of rows.entries()) {
        if (stopAfter !== undefined && index >= stopAfter) throw new Error('MIGRATION_INTERRUPTED');
        const receipt = JSON.parse(String(row.receipt)) as ImportReceipt;
        const payload = JSON.parse(String(row.payload)) as Omit<StoredBatch, 'receipt'>;
        const existing = this.db.prepare('SELECT payload FROM phase0b_log WHERE op_id=?').get('legacy:' + receipt.id);
        if (!existing) this.append('legacy:' + receipt.id, { kind: 'legacy', batch: { ...payload, receipt }, order: Number(row.legacy_order) });
        else {
          const original = (JSON.parse(String(existing.payload)) as Extract<Operation, { kind: 'legacy' }>).batch;
          const immutable = (value: StoredBatch) => hash({ ...value, receipt: { ...value.receipt, status: undefined, rolledBackAt: undefined } });
          if (immutable(original) !== immutable({ ...payload, receipt })) throw new Error('LEGACY_IMMUTABLE_PAYLOAD_CHANGED');
          if (receipt.status === 'rolled_back') this.append('legacy-receipt:' + receipt.id + ':' + hash(receipt), { kind: 'legacy-receipt', receipt });
        }
      }
    } finally { source.close(); }
  }
  adopt(batchId: string, positions: number[], candidate: SessionGeneration, proof: AdoptionProof, actor: 'owner' | 'device' = 'owner') {
    if (actor !== 'owner') throw new Error('OWNER_ADOPTION_REQUIRED');
    const state = this.state(), legacy = state.legacy.get(batchId)?.batch;
    verifyGeneration(candidate);
    if (state.bindings.get(scopeId(candidate.scope))?.originId !== candidate.scope.originId) throw new Error('ORIGIN_BINDING_REQUIRED');
    if (!legacy || positions.some(position => !Number.isSafeInteger(position) || !legacy.bundle.events[position])) throw new Error('UNKNOWN_LEGACY_REFERENCE');
    const events = positions.map(position => legacy.bundle.events[position]);
    const result = classifyAdoption(events, candidate, legacy.bundle.device.id, legacy.bundle.checksum, proof);
    if (result !== 'auto-adopt') {
      const review = { kind: 'adoption-review' as const, batchId, positions, scope: candidate.scope, code: result, proof };
      this.append('review:' + hash(review), review); return result;
    }
    const mappingsEqual = events.every(event => (legacy.mappings[event.projectKey] ?? null) === (candidate.mappings[event.projectKey] ?? null));
    if (!mappingsEqual && proof.kind !== 'owner-reviewed') {
      const review = { kind: 'adoption-review' as const, batchId, positions, scope: candidate.scope, code: 'review-required' as const, proof };
      this.append('review:' + hash(review), review); return 'review-required';
    }
    const refs = positions.map(position => ({ batchId, position }));
    this.append('adopt:' + hash([refs, scopeId(candidate.scope)]), { kind: 'adopt', refs, candidate, proof,
      audit: { actor: 'fixture-owner', reason: proof.kind } });
    return result;
  }
  ingest(batchId: string, value: SessionGeneration, authenticatedDevice: string, options: { failAt?: string } = {}): ShadowReceipt {
    return this.accept(batchId, value, authenticatedDevice, options);
  }
  repriceForOwner(batchId: string, value: SessionGeneration, actor: 'owner' | 'device'): ShadowReceipt {
    if (actor !== 'owner') throw new Error('OWNER_REPRICE_REQUIRED');
    return this.accept(batchId, value, value.scope.deviceId, { repriceAsOwner: true });
  }
  private accept(batchId: string, value: SessionGeneration, authenticatedDevice: string, options: { failAt?: string; repriceAsOwner?: boolean }): ShadowReceipt {
    if (value.scope.deviceId !== authenticatedDevice) throw new Error('DEVICE_ID_MISMATCH');
    const state = this.state(), receiptKey = JSON.stringify([authenticatedDevice, batchId]);
    if (state.revoked.has(authenticatedDevice)) throw new Error('DEVICE_REVOKED');
    const prior = state.receipts.get(receiptKey);
    if (prior) {
      const logged = this.db.prepare('SELECT payload FROM phase0b_log WHERE op_id=?').get('upload:' + receiptKey)!;
      const previous = JSON.parse(String(logged.payload)) as Extract<Operation, { kind: 'generation' }>;
      if (hash(previous.value) !== hash(value) || !!previous.reprice !== !!options.repriceAsOwner) throw new Error('BATCH_ID_REUSED_WITH_DIFFERENT_PAYLOAD');
      return prior;
    }
    let error: string | undefined;
    try { verifyGeneration(value); } catch (caught) { error = (caught as Error).message; }
    if (state.rolled.has(value.generationId)) error ??= 'ROLLED_BACK_GENERATION';
    const scope = scopeId(value.scope), current = selected(state).get(scope);
    if (!state.bindings.has(scope)) error ??= 'ORIGIN_BINDING_REQUIRED';
    if (state.bindings.get(scope)?.originId !== value.scope.originId) error ??= 'BINDING_ORIGIN_MISMATCH';
    if (value.evidence.coverage !== 'fixture-certified' || !state.certificates.has(certificate(value))) error ??= 'HISTORY_CERTIFICATE_REQUIRED';
    if (current?.generationId !== value.generationId && (current?.generationId ?? null) !== value.parent) error ??= 'STALE_PARENT';
    if (current && priceVersion(current.basis) !== priceVersion(value.basis) && !options.repriceAsOwner) error ??= 'EXPLICIT_REPRICE_REQUIRED';
    for (const [id, { batch }] of state.legacy) if (batch.receipt.status === 'active') {
      for (const [position, event] of batch.bundle.events.entries()) {
        const overlaps = event.source === value.scope.source && event.sessionId === value.scope.sessionId
          || value.observations.some(row => row.event.eventId === event.eventId);
        if (overlaps && !state.adopted.has(referenceKey({ batchId: id, position }))) error ??= 'LEGACY_ADOPTION_REQUIRED';
      }
    }
    if (current && current.generationId !== value.generationId) {
      const next = new Set(value.observations.flatMap(row => row.nativeAnchor ? [row.nativeAnchor] : []));
      const removed = current.observations.flatMap(row => row.nativeAnchor && !next.has(row.nativeAnchor) ? [row.nativeAnchor] : []).sort();
      if (hash(removed) !== hash([...value.removedAnchors].sort())) error ??= 'REMOVAL_SCOPE_MISMATCH';
      if ((removed.length || current.observations.some(row => !row.nativeAnchor)) && value.operation !== 'replace-complete-session') error ??= 'EXPLICIT_SESSION_REPLACEMENT_REQUIRED';
    }
    if (value.observations.length > 500) error ??= 'PROOF_BATCH_TOO_LARGE';
    this.append('upload:' + receiptKey, { kind: 'generation', batchId, value, error, reprice: options.repriceAsOwner,
      audit: { actor: options.repriceAsOwner ? 'fixture-owner' : authenticatedDevice,
        reason: options.repriceAsOwner ? 'explicit-history-reprice' : 'session-observation', previousGeneration: current?.generationId ?? null } }, options.failAt);
    return this.state().receipts.get(receiptKey)!;
  }
  rollbackLegacy(batchId: string) { this.append('rollback-legacy:' + batchId, { kind: 'legacy-rollback', batchId }); }
  rollbackRevision(generationId: string) { this.append('rollback-revision:' + generationId, { kind: 'revision-rollback', generationId }); }
  revoke(deviceId: string) { this.append('revoke:' + deviceId, { kind: 'revoke', deviceId }); }
  switchProjection() { this.append('switch', { kind: 'switch' }); }
  rebuild(failAt?: string) {
    this.db.exec('BEGIN IMMEDIATE');
    try { this.materialize(this.state(), Number(this.db.prepare('SELECT COALESCE(MAX(seq),0) AS revision FROM phase0b_log').get()!.revision), failAt); this.db.exec('COMMIT'); }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  view(native: RawUsageEvent[] = [], pricing = new Map<string, UnitPricing>(), aliases: Record<string, string> = {}) {
    return this.visible(this.state(), native, pricing, aliases);
  }
  // One unified read model: filter adopted memberships BEFORE calling the old compatibility oracle.
  // Reusing the real v1 loader here proves parity including its native priority and pricing behavior.
  private visible(state: State, native: RawUsageEvent[] = [], pricing = new Map<string, UnitPricing>(), aliases: Record<string, string> = {}): RawUsageEvent[] {
    const active = selected(state), compat = new ImportStore(this.compat);
    try {
      const reset = new DatabaseSync(this.compat); try { reset.exec('DELETE FROM batches; DELETE FROM previews;'); } finally { reset.close(); }
      for (const { batch } of [...state.legacy.values()].sort((a, b) => a.order - b.order)) {
        if (batch.receipt.status !== 'active') continue;
        const events = batch.bundle.events.filter((_, position) => {
          const adopted = state.adopted.get(referenceKey({ batchId: batch.receipt.id, position }));
          return !adopted || !active.has(adopted.scope);
        });
        if (events.length) compat.saveBatch({ ...batch, bundle: { ...batch.bundle, events } }, hash(batch.mappings));
      }
    } finally { compat.close(); }
    const legacy = loadImportedEvents(native, pricing, aliases, this.compat);
    const nativeIndex = identityIndex(native.map(raw => ({ event: { ...raw, source: raw.sourceId, eventId: nativeEventId(raw) } })), name => name);
    const v2: RawUsageEvent[] = [];
    for (const value of active.values()) for (const row of value.observations) {
      const found = nativeIndex.find(row.event);
      if (found.matches.length && !found.ambiguous) continue;
      const projected = pricedObservation(value.scope, row, value.basis, value.mappings);
      const ancestor = [...state.legacy.values()].sort((a, b) => a.order - b.order).find(({ batch }) =>
        batch.bundle.events.some((_, position) => state.adopted.get(referenceKey({ batchId: batch.receipt.id, position }))?.scope === scopeId(value.scope)));
      if (ancestor) projected.importBatchId = ancestor.batch.receipt.id;
      const mapped = value.mappings[row.event.projectKey], target = native.find(event => mapped && event.projectKey === mapped);
      if (target) { projected.projectName = target.projectName; projected.workspacePath = target.workspacePath; }
      v2.push(projected);
    }
    return [...native.filter(row => !legacy.replacedIndexed.has(row)).map(applyCommandCodeQuota), ...legacy.events.map(applyCommandCodeQuota), ...v2];
  }
  dump() {
    const tables = ['phase0b_log', 'phase0b_projection', 'phase0b_versions', 'phase0b_memberships', 'phase0b_receipts', 'phase0b_adoptions', 'phase0b_conflicts', 'phase0b_meta'];
    return tables.map(table => [table, this.db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]);
  }
}
