import type { SyncManifest, SyncRange } from '../domain/sync';
import type { UsageCoverage, UsageCoverageRange } from '../domain/usage-coverage';

function rangeEvidence(range: SyncRange): UsageCoverageRange | undefined {
  if (range.commitment) {
    const { keyRoot, schemaHash, count } = range.commitment;
    return { kind: 'keys', domain: range.locatorHash, keyRoot, schemaHash, count };
  }
  if (range.kind === 'jsonl') {
    return { kind: 'log', segment: range.locatorHash, start: 0, end: range.byteLength, root: range.root };
  }
}

/** Extract only the range evidence that the old manifest can substantiate. */
export function coverageFromV2(manifest: SyncManifest): UsageCoverage {
  const scope = {
    source: manifest.scope.source, origin: manifest.scope.originId, sessionId: manifest.scope.sessionId,
    reader: manifest.reader, readerVersion: manifest.collectorVersion, snapshot: manifest.manifestHash,
  };
  const { status } = manifest.read;
  if (status === 'failed' || status === 'unavailable') return { ...scope, status, reason: 'V2_READ_' + status.toUpperCase() };
  // A partial v2 manifest does not tell us which individual ranges completed.
  if (status === 'partial') return { ...scope, status, ranges: [], reasons: ['V2_PARTIAL_WITHOUT_RANGE_STATUS'] };
  const ranges = manifest.ranges.map(rangeEvidence).filter(range => range !== undefined);
  const [first, ...rest] = ranges;
  if (!first || ranges.length !== manifest.ranges.length) {
    return { ...scope, status: 'partial', ranges, reasons: ['V2_RANGE_EVIDENCE_MISSING'] };
  }
  // The wire manifest omits Codex's recovery boundary and Harness suffix
  // diagnostics. It also does not establish how much history an index covers.
  if (manifest.reader === 'codex' || manifest.reader === 'deepseekHarness' || manifest.reader === 'aiusage') {
    return { ...scope, status: 'partial', ranges, reasons: ['V2_USAGE_COVERAGE_UNPROVEN'] };
  }
  return { ...scope, status: 'complete', ranges: [first, ...rest] };
}
