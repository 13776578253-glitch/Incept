export type TokenBreakdown = {
  missingPricing?: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  cost: number;
};

export type CcusageModelBreakdown = {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  reasoningTokens?: number;
  totalTokens?: number;
  cost: number;
  missingPricing?: boolean;
};

export type DailyUsagePoint = TokenBreakdown & {
  date: string;
  modelsUsed: string[];
  modelBreakdowns: CcusageModelBreakdown[];
};

export type MonthlyUsagePoint = TokenBreakdown & {
  month: string;
  modelsUsed: string[];
  modelBreakdowns: CcusageModelBreakdown[];
};

export type ModelProviderFamily =
  | 'gemini'
  | 'claude'
  | 'openai'
  | 'deepseek'
  | 'xiaomi'
  | 'zhipu'
  | 'xai'
  | 'other';

export type ModelUsageSummary = TokenBreakdown & {
  modelName: string;
  displayName: string;
  provider: ModelProviderFamily;
  source: string;
  sourcesUsed?: string[];
  shareOfTokens: number;
  shareOfCost: number;
  cacheHitRate: number;
  missingPricing: boolean;
  slotStatus?: 'measured' | 'configured';
  sessionCount: number;
  activeDays: number;
  unitPricing?: {
    inputPerMillion: number;
    outputPerMillion: number;
    cacheReadPerMillion?: number;
    cacheWritePerMillion?: number;
  };
};

export type SourceDescriptionKey =
  | 'commandcode'
  | 'codex'
  | 'antigravity'
  | 'claudeCode'
  | 'opencode'
  | 'zcode'
  | 'geminiCli';

export type SourceUsageSummary = TokenBreakdown & {
  collectionMode?: 'native' | 'ccusage' | 'indexed' | 'imported' | 'mixed';
  sourceId: string;
  label: string;
  descriptionKey: SourceDescriptionKey;
  shareOfTokens: number;
  shareOfCost: number;
  sessionCount: number;
  modelsUsed: string[];
  status: 'active' | 'pending';
};

export type UnpricedModelSummary = {
  modelName: string;
  source: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  sessionCount: number;
};

export type CostCoverageSummary = {
  totalCost: number;
  avgDailyCost: number;
  peakDay: {
    date: string;
    cost: number;
    tokens: number;
  };
  blendedCostPerMillion: number;
  estimatedCacheSavings: number;
  pricedTokens: number;
  unpricedTokens: number;
  tokenCoverageRate: number;
  pricedModelCount: number;
  totalModelCount: number;
  modelCoverageRate: number;
  unpricedModels: UnpricedModelSummary[];
};

export type ProjectUsageSummary = TokenBreakdown & {
  projectKey: string;
  projectName: string;
  workspacePath?: string;
  sessionCount: number;
  shareOfTokens: number;
  shareOfCost: number;
  lastActivity: string;
  modelsUsed: string[];
};

export type SessionUsageItem = TokenBreakdown & {
  deviceLabel?: string;
  importBatchId?: string;
  timestampPrecision?: 'event' | 'day';
  historyIncomplete?: boolean;
  sessionKey?: string;
  sessionId: string;
  projectKey: string;
  projectName: string;
  workspacePath?: string;
  title?: string;
  source: string;
  firstActivity: string;
  lastActivity: string;
  durationMinutes: number;
  modelsUsed: string[];
  modelBreakdowns: CcusageModelBreakdown[];
};

export type TokenDashboardData = {
  collectionIssues?: string[];
  updatedAt: string;
  checkedAt?: string;
  range?: import('./window').UsageRange;
  dateRange: {
    from: string;
    to: string;
    activeDays: number;
    calendarDays?: number;
  };
  totals: TokenBreakdown & {
    cacheHitRate: number;
    outputToInputRatio: number;
    sessionCount: number;
    projectCount: number;
  };
  daily: DailyUsagePoint[];
  monthly: MonthlyUsagePoint[];
  models: ModelUsageSummary[];
  sources: SourceUsageSummary[];
  costs: CostCoverageSummary;
  projects: ProjectUsageSummary[];
  sessions: SessionUsageItem[];
};
