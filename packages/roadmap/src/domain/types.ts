// 双语文本对：必须提供完整中英文对等内容，单侧缺失直接抛错。
export type LocalizedText = {
  en: string;
  zh: string;
};

export type RoadmapLocale = keyof LocalizedText;

// 阶段状态枚举：状态集合保持稳定，显示名称由各看板映射为独立列。
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

// 列定义：关联稳定状态与各板自定义双语显示名称。
export type RoadmapColumn = {
  status: RoadmapStatus;
  label: LocalizedText;
};

export type RoadmapProject = {
  key: string;
  name: LocalizedText;
  roadmapEnabled: boolean;
  atlasEnabled: boolean;
};

export type Roadmap = {
  key: string;
  name: LocalizedText;
  project: RoadmapProject;
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

// 导入条目：仅收录人工清单数据，key 缺省时由写入层根据英文标题自动生成防碰撞标识。
// history: 导入模式由初期覆盖更新改为严格追加（append-only）。
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
