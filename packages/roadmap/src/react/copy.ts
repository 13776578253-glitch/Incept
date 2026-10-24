import type { RoadmapEntryPriority, RoadmapEntryType, RoadmapStatus } from '../domain';

// 界面文案契约：组件文案由宿主国际化词典注入，保持表现层纯数据无函数 props。
// history: 扩充导入反馈卡片（Toast）中英文标题与描述字段。
// 本包所需 CSS 变量清单（宿主 theme.css 提供，light / .dark / 暖色护眼三态）：
//   --roadmap-lane-bg、--roadmap-chip-bg、
//   --roadmap-priority-{high,middle,low}-{fg,bg}，以及 --color-text/-soft/-muted、--color-border、--radius-md、--duration-fast。
export type RoadmapChrome = {
  switcherLabel: string;
  boardLabel: string;
  lanePickerLabel: string;
  emptyLane: Record<RoadmapStatus, string>;
  loadMore: string;
  errorTitle: string;
  errorDescription: string;
  typeLabels: Record<RoadmapEntryType, string>;
  priorityLabels: Record<RoadmapEntryPriority, string>;
  confirmDelete: string;
  saveFailed: string;
  importSucceeded: string;
  importFailed: string;
  lastUpdated: string;
  createdLabel: string;
  pendingDetail: string;
  importLabel?: string;
  projectSelectLabel?: string;
  // 空列里的「+ 新建第一条」按钮可读名称；缺省时组件回退到英文 New entry。
  createEntryLabel?: string;
  importSuccessEyebrow?: string;
  importSuccessTitle?: string;
  importSuccessDescription?: string;
  importErrorEyebrow?: string;
  importErrorTitle?: string;
};

