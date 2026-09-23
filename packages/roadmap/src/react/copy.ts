import type { RoadmapEntryPriority, RoadmapEntryType, RoadmapStatus } from '../domain';

// UI 框架文案由宿主 messages 注入（决策条目 3：内容不进 messages，但 chrome 属于 messages）。
// 只允许纯数据：{count} 占位由 fillCount 填充，客户端组件不得接收函数 props。
// 本包所需 CSS 变量清单（宿主 theme.css 提供，light / .dark / 暖色护眼三态）：
//   --roadmap-lane-bg、--roadmap-chip-bg、
//   --roadmap-priority-{high,middle,low}-{fg,bg}，以及 --color-text/-soft/-muted、--color-border、--radius-md、--duration-fast。
export type RoadmapChrome = {
  sampleBanner: string;
  switcherLabel: string;
  boardLabel: string;
  lanePickerLabel: string;
  emptyLane: Record<RoadmapStatus, string>;
  loadMore: string;
  loading: string;
  errorTitle: string;
  errorDescription: string;
  typeLabels: Record<RoadmapEntryType, string>;
  priorityLabels: Record<RoadmapEntryPriority, string>;
  votesLabel: string;
  commentsLabel: string;
};

export function fillCount(template: string, count: number): string {
  return template.replace('{count}', String(count));
}
