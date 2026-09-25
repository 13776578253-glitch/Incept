import type {
  LocalizedText,
  Roadmap,
  RoadmapColumn,
  RoadmapEntry,
  RoadmapEntryLink,
  RoadmapEntryPriority,
  RoadmapEntryType,
  RoadmapStatus,
} from '../domain';

// 写端口：RoadmapRepository 的对偶面（Phase 3 规格，主控已评审）。
// links 随 entry 事务性整体重写；计数不做（T4 硬化：无投票/评论），域模型无计数字段。
export type RoadmapEntryDraft = {
  key: string;
  status: RoadmapStatus;
  type: RoadmapEntryType;
  priority: RoadmapEntryPriority;
  title: LocalizedText;
  summary: LocalizedText;
  detail?: LocalizedText;
  order?: number;
  links?: RoadmapEntryLink[];
};

// Patch 的 detail 显式放行 null（M1）：null = 清空，未传（undefined）= 不动（M2 哨兵）。
// Partial 基必须 Omit 掉 detail——同名属性在交集里取类型交集，会把 null 挤掉导致无法编译。
export type RoadmapEntryPatch = Partial<Omit<RoadmapEntryDraft, 'key' | 'detail'>> & {
  detail?: LocalizedText | null;
};

export type RoadmapWriter = {
  createRoadmap: (input: {
    key: string;
    name: LocalizedText;
    position?: number;
  }) => Promise<Roadmap>;
  updateRoadmap: (input: {
    key: string;
    patch: { name?: LocalizedText; position?: number };
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
};
