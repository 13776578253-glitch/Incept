// 双语文本对：完整双语对等（roadmap-integration-surface 决策条目 2），缺半边由校验拒绝。
export type LocalizedText = {
  en: string;
  zh: string;
};

export type RoadmapLocale = keyof LocalizedText;

// 稳定状态枚举（Gate T1 裁定）：枚举稳定，显示名由每张 roadmap 映射为自己的列。
export const ROADMAP_STATUSES = [
  'reviewing',
  'unstarted',
  'active',
  'completed',
  'canceled',
] as const;

export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];

export const ROADMAP_ENTRY_TYPES = ['feature', 'improvement', 'maintenance'] as const;

export type RoadmapEntryType = (typeof ROADMAP_ENTRY_TYPES)[number];

export const ROADMAP_ENTRY_PRIORITIES = ['high', 'middle', 'low', 'none'] as const;

export type RoadmapEntryPriority = (typeof ROADMAP_ENTRY_PRIORITIES)[number];

// 列 = 稳定状态 + 每板显示名：列结构与词汇可按 roadmap 不同（T1）。
export type RoadmapColumn = {
  status: RoadmapStatus;
  label: LocalizedText;
};

export type Roadmap = {
  key: string;
  name: LocalizedText;
  columns: RoadmapColumn[];
};

export type RoadmapEntryLink = {
  label: LocalizedText;
  href: string;
};

export type RoadmapEntry = {
  key: string;
  roadmap: string;
  order: number;
  status: RoadmapStatus;
  type: RoadmapEntryType;
  priority: RoadmapEntryPriority;
  title: LocalizedText;
  summary: LocalizedText;
  detail?: LocalizedText;
  links?: RoadmapEntryLink[];
  createdAt?: string;
  updatedAt?: string;
};

// 导入清单（U5，仅条目 upsert 裁定）：人工维护的 JSON，key 缺省时由写口按标题生成。
export type RoadmapEntryImportItem = {
  roadmapKey: string;
  key?: string;
  status: RoadmapStatus;
  type: RoadmapEntryType;
  priority: RoadmapEntryPriority;
  title: LocalizedText;
  summary: LocalizedText;
  detail?: LocalizedText;
  order?: number;
  links?: RoadmapEntryLink[];
};

export type RoadmapImportManifest = {
  entries: RoadmapEntryImportItem[];
};
