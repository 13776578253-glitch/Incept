import 'server-only';
import type { SourceDescriptionKey } from '../../domain/index';

export type UnitPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
};

export type RawUsageEvent = {
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
