import type {
  RoadmapEntryPriority,
  RoadmapEntryType,
  RoadmapStatus,
} from '../../domain';

// 管理面板 chrome：全部为 UI 框架文案，由宿主 messages 注入（内容不进 messages 的边界不变）。
export type RoadmapAdminChrome = {
  heading: string;
  boardsLabel: string;
  projectsLabel: string;
  columnsLabel: string;
  entriesLabel: string;
  emptySelection: string;
  emptyProjectSelection: string;
  projectKey: string;
  projectNameEn: string;
  projectNameZh: string;
  projectDeleteBlocked: string;
  fieldKey: string;
  nameEn: string;
  nameZh: string;
  titleEn: string;
  titleZh: string;
  summaryEn: string;
  summaryZh: string;
  labelEn: string;
  labelZh: string;
  fieldStatus: string;
  fieldType: string;
  fieldPriority: string;
  fieldOrder: string;
  fieldHref: string;
  addLink: string;
  removeLink: string;
  create: string;
  update: string;
  deleteLabel: string;
  confirmDelete: string;
  failed: string;
  statusLabels: Record<RoadmapStatus, string>;
  typeLabels: Record<RoadmapEntryType, string>;
  priorityLabels: Record<RoadmapEntryPriority, string>;
};
