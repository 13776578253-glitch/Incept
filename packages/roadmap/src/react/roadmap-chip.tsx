import type { RoadmapEntryPriority } from '../domain';

const priorityFg: Record<RoadmapEntryPriority, string> = {
  high: 'var(--roadmap-priority-high-fg)',
  middle: 'var(--roadmap-priority-middle-fg)',
  low: 'var(--roadmap-priority-low-fg)',
  none: 'var(--color-text-soft)',
};

const priorityBg: Record<RoadmapEntryPriority, string> = {
  high: 'var(--roadmap-priority-high-bg)',
  middle: 'var(--roadmap-priority-middle-bg)',
  low: 'var(--roadmap-priority-low-bg)',
  none: 'var(--roadmap-chip-bg)',
};

type RoadmapChipProps =
  | { kind: 'type'; label: string }
  | { kind: 'priority'; priority: RoadmapEntryPriority; label: string };

// pill 恒带文字标签：永不只用颜色编码（界面样式规格）。
export function RoadmapChip(props: RoadmapChipProps) {
  const fg = props.kind === 'priority' ? priorityFg[props.priority] : 'var(--color-text-muted)';
  const bg = props.kind === 'priority' ? priorityBg[props.priority] : 'var(--roadmap-chip-bg)';

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.76rem] font-medium"
      style={{ color: fg, background: bg }}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {props.label}
    </span>
  );
}
