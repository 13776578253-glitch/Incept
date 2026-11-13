import type { TransferSource } from './imports';

export type UsageCoverageRange =
  | { kind: 'log'; segment: string; start: number; end: number; root: string }
  | { kind: 'keys'; domain: string; keyRoot: string; schemaHash: string; count: number }
  | { kind: 'days'; from: string; to: string; timeZone: string };

export type UsageCoverage = Readonly<{
  source: TransferSource;
  origin: string;
  sessionId: string;
  reader: TransferSource | 'aiusage' | 'ccusage';
  readerVersion: string;
  snapshot: string;
}> & (
  | { status: 'complete'; ranges: readonly [UsageCoverageRange, ...UsageCoverageRange[]] }
  | { status: 'partial'; ranges: readonly UsageCoverageRange[]; reasons: readonly [string, ...string[]] }
  | { status: 'unavailable' | 'failed'; reason: string }
);
