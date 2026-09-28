import type {
  LocalizedText,
  Roadmap,
  RoadmapColumn,
  RoadmapEntry,
  RoadmapEntryImportItem,
  RoadmapEntryLink,
  RoadmapEntryPriority,
  RoadmapEntryType,
  RoadmapStatus,
  RoadmapProject,
} from '../domain';

// 写端口契约：定义项目、看板、列与条目的写操作接口。
// 链接随条目事务性整体重写；条目模型不含点赞与评论计数。
export type RoadmapEntryDraft = {
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

// 更新补丁：detail 显式传入 null 表示清空，undefined 表示保持原值。
// Partial 基类必须 Omit 掉 detail，防止类型交集挤掉 null 联合。
export type RoadmapEntryPatch = Partial<Omit<RoadmapEntryDraft, 'key' | 'detail'>> & {
  detail?: LocalizedText | null;
};

export type RoadmapWriter = {
  createProject: (input: { key: string; name: LocalizedText; position?: number; roadmapEnabled?: boolean; atlasEnabled?: boolean }) => Promise<RoadmapProject>;
  updateProject: (input: { key: string; patch: { name?: LocalizedText; position?: number; roadmapEnabled?: boolean; atlasEnabled?: boolean } }) => Promise<RoadmapProject>;
  deleteProject: (input: { key: string }) => Promise<{ key: string }>;
  createRoadmap: (input: {
    key: string;
    name: LocalizedText;
    projectKey: string;
    position?: number;
  }) => Promise<Roadmap>;
  updateRoadmap: (input: {
    key: string;
    patch: { name?: LocalizedText; position?: number; projectKey?: string };
  }) => Promise<Roadmap>;
  deleteRoadmap: (input: { key: string }) => Promise<{ key: string }>;
  upsertColumn: (input: {
    roadmapKey: string;
    status: RoadmapStatus;
    label: LocalizedText;
    position?: number;
  }) => Promise<RoadmapColumn>;
  deleteColumn: (input: {
    roadmapKey: string;
    status: RoadmapStatus;
  }) => Promise<{ roadmapKey: string; status: RoadmapStatus }>;
  createEntry: (
    input: RoadmapEntryDraft & { roadmapKey: string },
  ) => Promise<RoadmapEntry>;
  updateEntry: (input: { key: string; patch: RoadmapEntryPatch }) => Promise<RoadmapEntry>;
  deleteEntry: (input: { key: string }) => Promise<{ key: string }>;
  // 导入：纯追加（append-only），遇已存在 key 事务回滚报错。
  // history: 由早期覆盖更新改为严格追加，杜绝静默覆盖现有看板数据。
  importEntries: (input: { entries: RoadmapEntryImportItem[] }) => Promise<RoadmapEntry[]>;
};
