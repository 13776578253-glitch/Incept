'use client';

import { useState } from 'react';

import type { RoadmapEntry, RoadmapLocale, RoadmapStatus } from '../domain';

import type { RoadmapChrome } from './copy';
import { statusColors, statusIcons } from './icons';
import { RoadmapCard } from './roadmap-card';

// 参考实测每列 limit 10 + Load more；列内按人定 order（调用方已排序）。
const LANE_PAGE = 10;

type RoadmapLaneProps = {
  status: RoadmapStatus;
  label: string;
  entries: RoadmapEntry[];
  locale: RoadmapLocale;
  chrome: RoadmapChrome;
  mobileVisible: boolean;
  onSelectEntry?: (entry: RoadmapEntry) => void;
};

export function RoadmapLane({
  status,
  label,
  entries,
  locale,
  chrome,
  mobileVisible,
  onSelectEntry,
}: RoadmapLaneProps) {
  const [visible, setVisible] = useState(LANE_PAGE);
  const shown = entries.slice(0, visible);
  const StatusIcon = statusIcons[status];
  const iconColor = statusColors[status];

  return (
    <section
      aria-label={label}
      className={`${mobileVisible ? 'flex' : 'hidden'} min-w-0 flex-col gap-3 rounded-xl border border-[var(--roadmap-lane-border,transparent)] bg-[var(--roadmap-lane-bg)] p-3 md:flex md:max-h-full md:min-h-0 md:self-start md:snap-start md:overflow-hidden`}
    >
      <header className="flex shrink-0 items-center gap-2 px-1 py-0.5">
        <span aria-hidden="true" className="inline-flex shrink-0" style={{ color: iconColor }}>
          <StatusIcon />
        </span>
        <h2 className="text-[0.92rem] font-semibold tracking-[-0.01em] text-[var(--color-text)]">
          {label}
        </h2>
        <span className="text-[0.82rem] font-medium text-[var(--color-text-soft)] tabular-nums">
          {entries.length}
        </span>
      </header>
      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--roadmap-divider,var(--color-border))] bg-[var(--roadmap-card-bg,var(--color-bg))]/40 px-3.5 py-4 text-[0.8rem] leading-6 text-[var(--color-text-soft)]">
          {chrome.emptyLane[status]}
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5 pt-0.5 pb-2 md:min-h-0 md:flex-1 md:overflow-y-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {shown.map((entry) => (
            <li key={entry.key} className="list-none">
              <RoadmapCard
                entry={entry}
                locale={locale}
                chrome={chrome}
                onSelect={onSelectEntry}
              />
            </li>
          ))}
        </ul>
      )}
      {visible < entries.length && (
        <button
          type="button"
          onClick={() => setVisible((current) => current + LANE_PAGE)}
          className="shrink-0 rounded-lg border border-[var(--roadmap-border,var(--color-border))] bg-[var(--roadmap-card-bg,var(--color-bg))] px-3.5 py-1.5 text-[0.8rem] font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--roadmap-card-hover-bg,var(--roadmap-lane-bg))] hover:text-[var(--color-text)]"
        >
          {chrome.loadMore}
        </button>
      )}
    </section>
  );
}

