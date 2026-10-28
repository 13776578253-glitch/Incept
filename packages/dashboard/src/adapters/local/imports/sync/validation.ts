import type { SyncManifest, SyncRecord } from '../../../../domain/sync';
import { qualifyRanges, qualifyRecords, requireSync, usageKeyRoot } from './contract';

export type EvidenceValidation = { tokenTotal: number; changed: boolean };

export type EvidenceInput = {
  manifest: SyncManifest;
  records: Iterable<SyncRecord>;
  current: Iterable<SyncRecord>;
  parent: SyncManifest | undefined;
  fenced: boolean;
  otherScopeTokenTotal: number;
  beforeVisible?: () => void;
};

// Read-only evidence validation. The caller owns the transaction and performs
// every ledger write only after this returns successfully.
export function validateEvidence(input: EvidenceInput): EvidenceValidation {
  const { manifest, parent } = input;
  const records = [...input.records], current = [...input.current];
  const stable = manifest.ranges.filter(range => range.commitment);
  if (stable.length) {
    requireSync(manifest.ranges.length === 1, 'UNSUPPORTED_EVIDENCE');
    const usage = usageKeyRoot(records);
    requireSync(stable[0].commitment!.keyRoot === usage.keyRoot && stable[0].commitment!.count === usage.count, 'COMMITMENT_MISMATCH');
  }
  const parentStable = parent?.ranges.filter(range => range.commitment) ?? [];
  if (parentStable.length) {
    requireSync(parent!.ranges.length === 1, 'UNSUPPORTED_EVIDENCE');
    const usage = usageKeyRoot(current);
    requireSync(parentStable[0].commitment!.keyRoot === usage.keyRoot && parentStable[0].commitment!.count === usage.count, 'COMMITMENT_MISMATCH');
  }
  let tokenTotal: number;
  if (manifest.intent === 'rebase') {
    requireSync(parent && manifest.epoch === parent.epoch + 1, 'INVALID_EPOCH');
    qualifyRanges(undefined, { ...manifest, parent: null });
    tokenTotal = qualifyRecords([], records, manifest);
  } else {
    requireSync(!input.fenced, 'ROLLED_BACK_LINEAGE');
    requireSync(!parent || manifest.epoch === parent.epoch, 'INVALID_EPOCH');
    qualifyRanges(parent, manifest);
    if (parent && manifest.intent === 'observe') {
      requireSync(parent.basisHash === manifest.basisHash && parent.mappingsHash === manifest.mappingsHash, 'EXPLICIT_OWNER_REQUIRED');
    }
    tokenTotal = qualifyRecords(current, records, manifest);
  }
  requireSync(Number.isSafeInteger(input.otherScopeTokenTotal + tokenTotal), 'TOKEN_TOTAL_OVERFLOW');
  input.beforeVisible?.();
  const changed = !parent || manifest.sequenceHash !== parent.sequenceHash || manifest.basisHash !== parent.basisHash
    || manifest.mappingsHash !== parent.mappingsHash || manifest.epoch !== parent.epoch || manifest.reader !== parent.reader;
  return { tokenTotal, changed };
}
