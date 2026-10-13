import { randomUUID } from 'node:crypto';
import type { ImportMappings, ImportPreview, ImportReceipt } from '../../../domain';
import { collectImportContext, type ImportContext } from './context';
import { ImportStore, importStorePath } from './store';
import { ImportError, validateBundle } from './validation';
import { hash } from './identity';
import { planImport } from './planner';

type Options = { storePath?: string; context?: ImportContext; home?: string };
export function previewImport(input: unknown, mappings: ImportMappings = {}, options: Options = {}): ImportPreview {
  const bundle = validateBundle(input);
  const context = options.context ?? collectImportContext(options.home);
  const store = new ImportStore(options.storePath ?? importStorePath(options.home));
  try {
    const plan = planImport(bundle, mappings, context, store.batches(true));
    const summary: ImportPreview = { ...plan.summary, previewId: randomUUID(), expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
    store.savePreview({ bundle, mappings: plan.mappings, reviewHash: plan.reviewHash, summary });
    return summary;
  } finally { store.close(); }
}
export function commitImport(previewId: string, options: Options = {}): ImportReceipt {
  const context = options.context ?? collectImportContext(options.home);
  const store = new ImportStore(options.storePath ?? importStorePath(options.home));
  try { return store.transaction(() => {
    const preview = store.preview(previewId);
    if (!preview || Date.parse(preview.summary.expiresAt) < Date.now()) throw new ImportError('PREVIEW_EXPIRED', 'Preview expired; validate the file again', 409);
    const active = store.batches(true);
    const existing = active.find(batch => batch.bundle.checksum === preview.bundle.checksum && hash(batch.mappings) === hash(preview.mappings));
    if (existing) return existing.receipt;
    const plan = planImport(preview.bundle, preview.mappings, context, active);
    if (plan.summary.conflicts) throw new ImportError('IMPORT_CONFLICT', 'Conflicting usage records; no data was imported', 409);
    if (plan.reviewHash !== preview.reviewHash) throw new ImportError('PREVIEW_CHANGED', 'Matching data changed; validate again before importing', 409);
    const receipt: ImportReceipt = { id: randomUUID(), deviceId: preview.bundle.device.id, deviceLabel: preview.bundle.device.label,
      exportId: preview.bundle.exportId, checksum: preview.bundle.checksum, importedAt: new Date().toISOString(), status: 'active',
      received: plan.summary.received, added: plan.summary.added, duplicateLocal: plan.summary.duplicateLocal,
      duplicateImported: plan.summary.duplicateImported, addedTokens: plan.summary.addedTokens };
    store.saveBatch({ receipt, bundle: preview.bundle, mappings: preview.mappings }, hash(preview.mappings));
    return receipt;
  }); } finally { store.close(); }
}
export function importHistory(path = importStorePath()): ImportReceipt[] {
  const store = new ImportStore(path);
  try { return store.batches().map(batch => batch.receipt); } finally { store.close(); }
}
export function rollbackImport(id: string, path = importStorePath()): ImportReceipt {
  const store = new ImportStore(path);
  try { return store.transaction(() => {
    const receipt = store.batches().find(batch => batch.receipt.id === id)?.receipt;
    if (!receipt) throw new ImportError('BATCH_NOT_FOUND', 'Import batch not found', 404);
    if (receipt.status === 'active') { receipt.status = 'rolled_back'; receipt.rolledBackAt = new Date().toISOString(); store.setReceipt(receipt); }
    return receipt;
  }); } finally { store.close(); }
}
