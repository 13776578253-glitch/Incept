import 'server-only';
import type { SourceDescriptionKey } from '../../domain/index';

export type UnitPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
};

export type SessionIntegrity = {
  source: 'codex';
  sessionId: string;
  reason: 'OPENING_PREFIX_MISSING' | 'OPENING_USAGE_UNCERTAIN' | 'INVALID_TIMESTAMP' | 'MALFORMED_RECORD' | 'INVALID_COUNTER' | 'INDEPENDENT_USAGE_MISSING';
  firstAffectedAtMs?: number;
  lastAffectedAtMs?: number;
  unattributedTokens: number;
  affectedRecords: number;
  sourceFiles: string[];
  /** Reliable original timestamp of a cumulative counter anchor, never a file mtime. */
  recoveryAfterTimestampMs?: number;
};

export type RawUsageEvent = {
  nominalCost?: number;
  isPeak?: boolean;
  peakMultiplier?: number;
  eventId?: string;
  costSource?: 'recorded' | 'calculated';
  deviceId?: string;
  deviceLabel?: string;
  importBatchId?: string;
  timestampPrecision?: 'event' | 'day';
  sourceId: SourceDescriptionKey;
  sourceLabel: string;
  sessionId: string;
  sessionTitle?: string;
  sourceFile?: string;
  sourceFiles?: string[];
  historyIncomplete?: boolean;
  /** Adjacent valid cumulative counters bound this usage to a reliable interval. */
  usageInterval?: { kind: 'cumulative-delta'; afterTimestampMs: number };
  projectKey: string;
  projectName: string;
  workspacePath?: string;
  modelName: string;
  timestampMs: number;
  dateKey: string;
  monthKey: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
  cost: number;
  missingPricing: boolean;
};

export type SqliteDatabaseSync = {
  prepare: (sql: string) => {
    all: (...params: unknown[]) => Array<Record<string, unknown>>;
    get: (...params: unknown[]) => Record<string, unknown> | undefined;
  };
  close: () => void;
};
