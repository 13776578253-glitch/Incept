import type {DatabaseSync} from 'node:sqlite';
import {hash} from '../../../packages/dashboard/src/adapters/local/imports/identity';
import type {SyncScope,SyncReceipt,SyncHeader} from '../../../packages/dashboard/src/domain/sync';

export const V4_BASELINE = {
  scopes: 359,
  receipts: 359,
  tokenTotal: 4_480_530_511,
  databaseFile: '/data/sync/v4.db',
  imageId: 'sha256:cc705ce22cea38b1a8c01cea28fe1e1dd2ca6cbae500516f00eaee6c497d6685',
};
export type LineageSnapshot = {
  version: 1;
  service: {deviceId: string; endpoint: string; databaseFile: string; imageId: string};
  dataRevision: number;
  tokenTotal: number;
  scopes: Array<{scope: SyncScope; manifestHash: string; generationId: string; tokenTotal: number}>;
  receipts: SyncReceipt[];
};
type Identity = {deviceId: string; endpoint: string};
export type VerificationRequest = (path: string, method?: string, body?: unknown) => Promise<unknown>;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const validScope = (value: unknown): value is SyncScope => object(value) &&
  ['deviceId','source','sessionId','originId'].every(key => typeof value[key] === 'string' && value[key] !== '');

// A snapshot must be exported read-only from the selected service's mounted DB.
// It supplies the remote inventory/totals the existing device API cannot enumerate.
export async function verifyLineage(db: DatabaseSync, raw: unknown, identity: Identity, request?: VerificationRequest) {
  const errors: string[] = [], mismatches: Array<{scope: string; code: string}> = [];
  let checked = 0, ok = 0;
  const result = () => ({passed: errors.length === 0 && mismatches.length === 0, onlineVerified: !!request && errors.length === 0 && mismatches.length === 0,
    mode: request ? 'online' : 'snapshot-only', checked, ok, errors, mismatches, expected: V4_BASELINE});
  if (!object(raw) || raw.version !== 1 || !object(raw.service) || !Array.isArray(raw.scopes) || !Array.isArray(raw.receipts) || !integer(raw.dataRevision)) {
    errors.push('INVALID_REMOTE_SNAPSHOT'); return result();
  }
  const snapshot = raw as unknown as LineageSnapshot;
  if (snapshot.service.deviceId !== identity.deviceId || snapshot.service.endpoint !== identity.endpoint ||
    snapshot.service.databaseFile !== V4_BASELINE.databaseFile || snapshot.service.imageId !== V4_BASELINE.imageId) errors.push('SERVICE_IDENTITY_MISMATCH');
  if (snapshot.scopes.length !== V4_BASELINE.scopes) errors.push('REMOTE_SCOPE_COUNT_MISMATCH');
  if (snapshot.receipts.length !== V4_BASELINE.receipts) errors.push('REMOTE_RECEIPT_COUNT_MISMATCH');
  if (snapshot.tokenTotal !== V4_BASELINE.tokenTotal) errors.push('REMOTE_TOKEN_TOTAL_MISMATCH');
  const scopes = new Map<string, LineageSnapshot['scopes'][number]>(), receipts = new Map<string, SyncReceipt>();
  let tokens = 0;
  for (const row of snapshot.scopes) {
    if (!object(row) || !validScope(row.scope) || !digest(row.manifestHash) || !digest(row.generationId) || !integer(row.tokenTotal)) {
      errors.push('INVALID_REMOTE_SCOPE'); continue;
    }
    const key = hash([row.scope.source, row.scope.sessionId]);
    if (scopes.has(key)) errors.push('DUPLICATE_REMOTE_SCOPE');
    if (row.scope.deviceId !== identity.deviceId) errors.push('REMOTE_DEVICE_MISMATCH');
    scopes.set(key, row); tokens += row.tokenTotal;
  }
  if (!integer(tokens) || tokens !== V4_BASELINE.tokenTotal || tokens !== snapshot.tokenTotal) errors.push('SCOPE_TOKEN_TOTAL_MISMATCH');
  for (const receipt of snapshot.receipts) {
    if (!object(receipt) || typeof receipt.batchId !== 'string' || !receipt.batchId || receipt.status !== 'committed' ||
      !digest(receipt.manifestHash) || !digest(receipt.generationId) || !digest(receipt.payloadHash) || !integer(receipt.dataRevision) || receipt.dataRevision > snapshot.dataRevision) {
      errors.push('INVALID_REMOTE_RECEIPT'); continue;
    }
    if (receipts.has(receipt.batchId)) errors.push('DUPLICATE_REMOTE_RECEIPT');
    receipts.set(receipt.batchId, receipt);
  }
  const rows = db.prepare('SELECT scope,parent_json,receipt_json FROM lineage ORDER BY scope').all();
  if (rows.length !== V4_BASELINE.scopes) errors.push('LOCAL_SCOPE_COUNT_MISMATCH');
  if (Number(db.prepare('SELECT COUNT(*) n FROM receipts').get()!.n) !== V4_BASELINE.receipts) errors.push('LOCAL_RECEIPT_COUNT_MISMATCH');
  if (Number(db.prepare('SELECT COUNT(*) n FROM heads').get()!.n)) errors.push('LOCAL_UNCONFIRMED_HEADS');
  if (Number(db.prepare('SELECT COUNT(*) n FROM outbox').get()!.n)) errors.push('LOCAL_OUTBOX_NOT_EMPTY');
  // Fail before making requests to an unverified service or on incomplete inventory.
  if (errors.length) return result();
  if (request) {
    try {
      const agent = await request('/agent');
      const allowed = object(agent) && Array.isArray(agent.allowedSources) ? agent.allowedSources : [];
      if (!object(agent) || agent.deviceId !== identity.deviceId ||
        [...scopes.values()].some(row => !allowed.includes(row.scope.source))) errors.push('REMOTE_AGENT_IDENTITY_MISMATCH');
    } catch { errors.push('REMOTE_IDENTITY_REQUEST_FAILED'); }
    if (errors.length) return result();
  }
  const seen = new Set<string>(), usedReceipts = new Set<string>();
  for (const row of rows) {
    const key = String(row.scope); checked++;
    try {
      const parent = JSON.parse(String(row.parent_json)) as {header: SyncHeader};
      const header = parent.header, manifest = header.manifest, localReceipt = JSON.parse(String(row.receipt_json));
      const remote = scopes.get(key), receipt = receipts.get(header.batchId);
      const stored = db.prepare('SELECT json FROM receipts WHERE batch=?').get(header.batchId);
      if (key !== hash([manifest.scope.source, manifest.scope.sessionId]) || seen.has(key) ||
        !remote || hash(remote.scope) !== hash(manifest.scope) || remote.manifestHash !== manifest.manifestHash || remote.generationId !== manifest.generationId ||
        !receipt || receipt.payloadHash !== hash(header) || receipt.manifestHash !== manifest.manifestHash || receipt.generationId !== manifest.generationId ||
        hash(localReceipt) !== hash(receipt) || !stored || hash(JSON.parse(String(stored.json))) !== hash(receipt) || usedReceipts.has(header.batchId)) {
        mismatches.push({scope: key, code: 'LINEAGE_RECEIPT_MISMATCH'}); continue;
      }
      seen.add(key); usedReceipts.add(header.batchId);
      if (request) {
        try {
          const resolved = await request('/scopes/resolve', 'POST', {source: manifest.scope.source, sessionId: manifest.scope.sessionId});
          const confirmed = await request('/batches/' + header.batchId);
          if (!object(confirmed) || confirmed.dataRevision !== snapshot.dataRevision) {
            mismatches.push({scope: key, code: 'REMOTE_REVISION_CHANGED'}); continue;
          }
          if (!object(resolved) || hash(resolved.scope) !== hash(manifest.scope) || resolved.headManifest !== manifest.manifestHash ||
            hash(confirmed.receipt) !== hash(receipt)) {
            mismatches.push({scope: key, code: 'REMOTE_LINEAGE_RECEIPT_MISMATCH'}); continue;
          }
        } catch { mismatches.push({scope: key, code: 'REMOTE_REQUEST_FAILED'}); continue; }
      }
      ok++;
    } catch { mismatches.push({scope: key, code: 'INVALID_LOCAL_LINEAGE'}); }
  }
  if (seen.size !== scopes.size || usedReceipts.size !== receipts.size) errors.push('INVENTORY_NOT_RECONCILED');
  return result();
}
