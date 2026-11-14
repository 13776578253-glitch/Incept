import type { UsageRange } from './window';

export type BillingReadWindow = {
  range: UsageRange;
  members: number;
  tokens: number;
  estimatedCostUsd: string;
  estimatedTokens: number;
  excludedTokens: number;
  recordedUnknownCurrency: number;
  unpricedTokens: number;
};

export type BillingReadResponse = BillingReadWindow & {
  run: string;
  revision: number;
  catalog: string;
  asOf: string;
  conflicted?: number;
  unpricedGroups?: number;
  liveRevision?: number;
};
