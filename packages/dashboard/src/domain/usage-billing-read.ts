import type { UsageRange } from './window';

export type BillingReadWindow = {
  range: UsageRange;
  members: number;
  tokens: number;
  estimatedByCurrency: Record<string, string>;
  recordedUnknownCurrency: number;
  unpricedTokens: number;
};

export type BillingReadResponse = BillingReadWindow & {
  run: string;
  revision: number;
  catalog: string;
  asOf: string;
};
