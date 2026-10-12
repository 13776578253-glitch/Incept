export type GitHubActivityScope = 'account' | 'repository' | '1002bot';
export type GitHubActivityPeriod = 'all' | number;

export type ActivityDay = {
  date: string;
  count: number;
};

export type ActivityRange = {
  from: string;
  to: string;
  kind: 'rolling' | 'calendar';
  year: number;
};

export type GitHubActivityData = {
  scope: GitHubActivityScope;
  period: GitHubActivityPeriod;
  range: ActivityRange;
  totalCount: number;
  days: ActivityDay[];
};

export type GitHubActivityResult =
  | { status: 'available'; data: GitHubActivityData }
  | { status: 'unavailable' };

export type WritingActivityDay = ActivityDay & {
  articleCount: number;
  writingUnits: number;
};

export type WritingActivityData = {
  range: ActivityRange;
  days: WritingActivityDay[];
  articleCount: number;
  writingUnits: number;
};
