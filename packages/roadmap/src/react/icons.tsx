import type { RoadmapStatus } from '../domain';

const base = {
  width: 15,
  height: 15,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function IconArchive() {
  return (
    <svg {...base}>
      <rect x="2" y="3" width="12" height="3" rx="1" />
      <path d="M3 6v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6" />
      <path d="M6.5 9h3" />
    </svg>
  );
}

export function IconFastForward() {
  return (
    <svg {...base}>
      <path d="M3 4.5v7l5-3.5z" fill="currentColor" stroke="none" />
      <path d="M8 4.5v7l5-3.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconLightning() {
  return (
    <svg {...base}>
      <path d="M9 1.5 3.5 9H7l-.5 5.5L12.5 7H9z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconCheckCircle() {
  return (
    <svg {...base}>
      <circle cx="8" cy="8" r="6" />
      <path d="m5.5 8 1.8 1.8L10.8 6" />
    </svg>
  );
}

export function IconXCircle() {
  return (
    <svg {...base}>
      <circle cx="8" cy="8" r="6" />
      <path d="m6 6 4 4M10 6l-4 4" />
    </svg>
  );
}

export function IconComment() {
  return (
    <svg {...base}>
      <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
    </svg>
  );
}

export function IconUpvote() {
  return (
    <svg {...base}>
      <path d="m4 9.5 4-4 4 4" />
    </svg>
  );
}

export function IconLink() {
  return (
    <svg {...base}>
      <path d="M6 3h7v7" />
      <path d="M13 3 6.5 9.5" />
      <path d="M11 9.5V13H3V5h3.5" />
    </svg>
  );
}

// 列头图标按稳定状态枚举取（中性色，不给列上色——界面样式规格）。
export const statusIcons: Record<RoadmapStatus, () => React.JSX.Element> = {
  reviewing: IconArchive,
  unstarted: IconFastForward,
  active: IconLightning,
  completed: IconCheckCircle,
  canceled: IconXCircle,
};
