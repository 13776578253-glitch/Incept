import type { SyncManifest, SyncRange } from '../domain/sync';
import type { CoverageReview, UsageCoverage, UsageCoverageRange } from '../domain/usage-coverage';
import { hash } from '../adapters/local/imports/identity';

function rangeEvidence(range: SyncRange): UsageCoverageRange | undefined {
  if (range.commitment) {
    const { keyRoot, schemaHash, count } = range.commitment;
    return { kind: 'keys', domain: range.locatorHash, keyRoot, schemaHash, count };
  }
  if (range.kind === 'jsonl') {
    return { kind: 'log', segment: range.locatorHash, start: 0, end: range.byteLength, root: range.root };
  }
  if (range.kind === 'json') {
    return { kind: 'document', locator: range.locatorHash, root: range.root, envelopeRoot: range.envelopeRoot };
  }
}

/** Extract only the range evidence that the old manifest can substantiate. */
export function coverageFromV2(manifest: SyncManifest, acceptedReviews: readonly CoverageReview[] = []): UsageCoverage {
  const scope = {
    source: manifest.scope.source, origin: manifest.scope.originId, sessionId: manifest.scope.sessionId,
    reader: manifest.reader, readerVersion: manifest.collectorVersion, snapshot: manifest.manifestHash,
    ...(acceptedReviews.length ? { acceptedReviews } : {}),
  };
  const { status } = manifest.read;
  if (status === 'failed' || status === 'unavailable') return { ...scope, status, reason: 'V2_READ_' + status.toUpperCase() };
  // A partial v2 manifest does not tell us which individual ranges completed.
  if (status === 'partial') return { ...scope, status, ranges: [], reasons: ['V2_PARTIAL_WITHOUT_RANGE_STATUS'] };
  const { beforeRoot, afterRoot, snapshotRoot, inventoryHash } = manifest.read;
  if (beforeRoot !== afterRoot || beforeRoot !== snapshotRoot
    || snapshotRoot !== hash(manifest.ranges.map(range => [range.locatorHash, range.root]))
    || inventoryHash !== hash(manifest.ranges.map(range => range.locatorHash).sort())) {
    return { ...scope, status: 'partial', ranges: [], reasons: ['V2_SNAPSHOT_PROOF_MISMATCH'] };
  }
  const ranges = manifest.ranges.map(rangeEvidence).filter(range => range !== undefined);
  const [first, ...rest] = ranges;
  const reasons: string[] = [];
  if (!first || ranges.length !== manifest.ranges.length) reasons.push('V2_RANGE_EVIDENCE_MISSING');
  if (acceptedReviews.length) reasons.push('V2_ACCEPTED_REVIEW_IN_VISIBLE_LINEAGE');
  if (manifest.scope.source === 'antigravity'
    && (ranges.length !== 1 || first?.kind !== 'keys' || first.count !== manifest.recordCount)) {
    reasons.push('V2_USAGE_KEY_COUNT_UNPROVEN');
  }
  // The wire manifest omits Codex's recovery boundary and Harness suffix
  // diagnostics. It also does not establish how much history an index covers.
  if (manifest.reader === 'codex' || manifest.reader === 'deepseekHarness' || manifest.reader === 'aiusage') {
    reasons.push('V2_USAGE_COVERAGE_UNPROVEN');
  }
  const [reason, ...remaining] = reasons;
  if (reason || !first) return { ...scope, status: 'partial', ranges, reasons: [reason ?? 'V2_RANGE_EVIDENCE_MISSING', ...remaining] };
  return { ...scope, status: 'complete', ranges: [first, ...rest] };
}
