import type { RoadmapEntryPriority, RoadmapEntryType } from '../domain';

import { typeIcons } from './icons';

const priorityStyles: Record<
  RoadmapEntryPriority,
  { dot: string; fg: string; bg: string; border: string }
> = {
  high: {
    dot: 'var(--roadmap-priority-high-dot, #ef4444)',
    fg: 'var(--roadmap-priority-high-fg, #b91c1c)',
    bg: 'var(--roadmap-priority-high-bg, rgba(239, 68, 68, 0.08))',
    border: 'var(--roadmap-priority-high-border, rgba(239, 68, 68, 0.2))',
  },
  middle: {
    dot: 'var(--roadmap-priority-middle-dot, #6366f1)',
    fg: 'var(--roadmap-priority-middle-fg, #4338ca)',
    bg: 'var(--roadmap-priority-middle-bg, rgba(99, 102, 241, 0.08))',
    border: 'var(--roadmap-priority-middle-border, rgba(99, 102, 241, 0.2))',
  },
  low: {
    dot: 'var(--roadmap-priority-low-dot, #3b82f6)',
    fg: 'var(--roadmap-priority-low-fg, #1d4ed8)',
    bg: 'var(--roadmap-priority-low-bg, rgba(59, 130, 246, 0.08))',
    border: 'var(--roadmap-priority-low-border, rgba(59, 130, 246, 0.18))',
  },
  none: {
    dot: 'var(--color-text-soft)',
    fg: 'var(--color-text-muted)',
    bg: 'var(--roadmap-chip-bg)',
    border: 'var(--roadmap-chip-border, rgba(15, 23, 42, 0.08))',
  },
};

const typeStyles: Record<
  RoadmapEntryType,
  { icon: string; fg: string; bg: string; border: string }
> = {
  feature: {
    icon: 'var(--roadmap-type-feature-icon, #f59e0b)',
    fg: 'var(--roadmap-type-feature-fg, var(--color-text))',
    bg: 'var(--roadmap-type-feature-bg, rgba(245, 158, 11, 0.08))',
    border: 'var(--roadmap-type-feature-border, rgba(245, 158, 11, 0.22))',
  },
  improvement: {
    icon: 'var(--roadmap-type-improvement-icon, #0ea5e9)',
    fg: 'var(--roadmap-type-improvement-fg, var(--color-text))',
    bg: 'var(--roadmap-type-improvement-bg, rgba(14, 165, 233, 0.08))',
    border: 'var(--roadmap-type-improvement-border, rgba(14, 165, 233, 0.2))',
  },
  maintenance: {
    icon: 'var(--roadmap-type-maintenance-icon, #6366f1)',
    fg: 'var(--roadmap-type-maintenance-fg, var(--color-text))',
    bg: 'var(--roadmap-type-maintenance-bg, rgba(99, 102, 241, 0.07))',
    border: 'var(--roadmap-type-maintenance-border, rgba(99, 102, 241, 0.18))',
  },
};

type RoadmapChipProps =
  | { kind: 'type'; entryType?: RoadmapEntryType; label: string }
  | { kind: 'priority'; priority: RoadmapEntryPriority; label: string };

// pill 恒带文字标签：永不只用颜色编码（界面样式规格）。
export function RoadmapChip(props: RoadmapChipProps) {
  if (props.kind === 'type') {
    const entryType = props.entryType ?? 'feature';
    const style = typeStyles[entryType];
    const TypeIcon = typeIcons[entryType];

    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.74rem] font-medium leading-5 whitespace-nowrap"
        style={{
          color: style.fg,
          background: style.bg,
          borderColor: style.border,
        }}
      >
        <span aria-hidden="true" className="inline-flex shrink-0" style={{ color: style.icon }}>
          <TypeIcon />
        </span>
        {props.label}
      </span>
    );
  }

  const style = priorityStyles[props.priority];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.74rem] font-medium leading-5 whitespace-nowrap"
      style={{
        color: style.fg,
        background: style.bg,
        borderColor: style.border,
      }}
    >
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: style.dot }}
      />
      {props.label}
    </span>
  );
}

