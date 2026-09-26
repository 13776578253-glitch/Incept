import type { RoadmapEntryType, RoadmapStatus } from '../domain';

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
      <rect x="1.75" y="2.5" width="12.5" height="3.2" rx="1" fill="currentColor" fillOpacity="0.16" />
      <path
        d="M2.75 5.7v6.3a1.25 1.25 0 0 0 1.25 1.25h8a1.25 1.25 0 0 0 1.25-1.25V5.7"
        fill="currentColor"
        fillOpacity="0.08"
      />
      <path d="M6.25 8.75h3.5" />
    </svg>
  );
}

export function IconFastForward() {
  return (
    <svg {...base}>
      <path d="M2.5 4.2v7.6l5.2-3.8z" fill="currentColor" stroke="none" />
      <path d="M8.2 4.2v7.6l5.3-3.8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconLightning() {
  return (
    <svg {...base}>
      <path d="M8.8 1.5 3.4 8.8h3.7l-.6 5.7 6.1-7.3H8.9z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconCheckCircle() {
  return (
    <svg {...base}>
      <circle cx="8" cy="8" r="6.5" fill="currentColor" stroke="none" />
      <path
        d="m5.3 8.1 1.85 1.85L10.8 6.2"
        stroke="#ffffff"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconXCircle() {
  return (
    <svg {...base}>
      <circle cx="8" cy="8" r="6" fill="currentColor" fillOpacity="0.14" />
      <path d="m6 6 4 4M10 6l-4 4" />
    </svg>
  );
}

export function IconLink() {
  return (
    <svg {...base} width={13} height={13}>
      <path d="M6 3h7v7" />
      <path d="M13 3 6.5 9.5" />
      <path d="M11 9.5V13H3V5h3.5" />
    </svg>
  );
}

export function IconBulb() {
  return (
    <svg {...base} width={13} height={13}>
      <path
        d="M8 1.75a4.25 4.25 0 0 0-2.6 7.6c.45.36.75.88.82 1.45h3.56c.07-.57.37-1.09.82-1.45A4.25 4.25 0 0 0 8 1.75Z"
        fill="currentColor"
        fillOpacity="0.24"
      />
      <path d="M6.5 12.6h3M7 14.2h2" />
    </svg>
  );
}

export function IconSparkle() {
  return (
    <svg {...base} width={13} height={13}>
      <path
        d="M8 1.8 9.45 6.1 13.8 7.5 9.45 8.9 8 13.2 6.55 8.9 2.2 7.5 6.55 6.1Z"
        fill="currentColor"
        fillOpacity="0.22"
      />
    </svg>
  );
}

export function IconWrench() {
  return (
    <svg {...base} width={13} height={13}>
      <path
        d="M10.4 2.3a3.2 3.2 0 0 0-3.05 4.15L3.1 10.7a1.35 1.35 0 0 0 1.9 1.9l4.25-4.25a3.2 3.2 0 0 0 4.15-3.05l-1.85 1.85-1.7-.4-.4-1.7 1.85-1.85Z"
        fill="currentColor"
        fillOpacity="0.16"
      />
    </svg>
  );
}

export function IconImport() {
  return (
    <svg {...base} width={14} height={14}>
      <path d="M8 2.25v7.25" />
      <path d="m5.25 6.75 2.75 2.75 2.75-2.75" />
      <path d="M2.75 10.5v2a1.25 1.25 0 0 0 1.25 1.25h8a1.25 1.25 0 0 0 1.25-1.25v-2" />
    </svg>
  );
}

export function IconProjectTag() {
  return (
    <svg {...base} width={14} height={14}>
      <path
        d="M2.25 4.25A1.5 1.5 0 0 1 3.75 2.75h3.1c.4 0 .78.16 1.06.44l5.1 5.1a1.5 1.5 0 0 1 0 2.12l-3.6 3.6a1.5 1.5 0 0 1-2.12 0l-5.1-5.1a1.5 1.5 0 0 1-.44-1.06v-3.6Z"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <circle cx="5.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconChevronDown() {
  return (
    <svg {...base} width={13} height={13}>
      <path d="m4 6 4 4 4-4" />
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

export const statusColors: Record<RoadmapStatus, string> = {
  reviewing: 'var(--roadmap-status-reviewing, #475569)',
  unstarted: 'var(--roadmap-status-unstarted, #7c3aed)',
  active: 'var(--roadmap-status-active, #2563eb)',
  completed: 'var(--roadmap-status-completed, #10b981)',
  canceled: 'var(--roadmap-status-canceled, #e11d48)',
};

export const typeIcons: Record<RoadmapEntryType, () => React.JSX.Element> = {
  feature: IconBulb,
  improvement: IconSparkle,
  maintenance: IconWrench,
};

