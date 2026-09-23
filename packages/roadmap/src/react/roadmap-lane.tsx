'use client';

import { useState } from 'react';

import type { RoadmapEntry, RoadmapLocale, RoadmapStatus } from '../domain';

import type { RoadmapChrome } from './copy';
import { statusIcons } from './icons';
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
};

export function RoadmapLane({
  status,
  label,
  entries,
  locale,
  chrome,
  mobileVisible,
}: RoadmapLaneProps) {
  const [visible, setVisible] = useState(LANE_PAGE);
  const shown = entries.slice(0, visible);
  const StatusIcon = statusIcons[status];

  return (
    <section
      aria-label={label}
      className={`${mobileVisible ? 'flex' : 'hidden'} min-w-0 flex-col gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--roadmap-lane-bg)] p-4 md:flex md:snap-start`}
    >
      <header className="flex items-center gap-2 px-1">
        <span aria-hidden="true" className="text-[var(--color-text-soft)]">
          <StatusIcon />
        </span>
        <h2 className="text-[0.95rem] font-medium text-[var(--color-text)]">{label}</h2>
        <span className="ml-auto rounded-full bg-[var(--roadmap-chip-bg)] px-2 py-0.5 text-[0.76rem] text-[var(--color-text-muted)] tabular-nums">
          {entries.length}
        </span>
      </header>
      {entries.length === 0 ? (
        <p className="px-1 text-[0.85rem] leading-6 text-[var(--color-text-soft)]">
          {chrome.emptyLane[status]}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {shown.map((entry) => (
            <li key={entry.key} className="list-none">
              <RoadmapCard entry={entry} locale={locale} chrome={chrome} />
            </li>
          ))}
        </ul>
      )}
      {visible < entries.length && (
        <button
          type="button"
          onClick={() => setVisible((current) => current + LANE_PAGE)}
          className="rounded-full border border-[var(--color-border)] px-4 py-2 text-[0.82rem] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-text-soft)] hover:text-[var(--color-text)]"
        >
          {chrome.loadMore}
        </button>
      )}
    </section>
  );
}
