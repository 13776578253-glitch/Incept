import type { UsageRange } from './window';
import type { TransferSource } from './imports';

export type BillingCostBreakdown = {
  estimatedCostUsd: string;
  estimatedTokens: number;
  unpricedTokens: number;
  excludedTokens: number;
};

export type BillingDailyCost = BillingCostBreakdown & { day: string };
export type BillingChannelCost = BillingCostBreakdown & { channel: TransferSource };
export type BillingModelCost = BillingCostBreakdown & { model: string; channels: BillingChannelCost[] };
export type BillingUnpricedGroup = { channel: TransferSource; model: string; reason: string; observations: number };

export type BillingReadBreakdown = {
  days: BillingDailyCost[];
  models: BillingModelCost[];
  unpriced: BillingUnpricedGroup[];
};

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
  breakdown?: BillingReadBreakdown;
};
