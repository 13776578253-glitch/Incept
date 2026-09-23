'use client';

import { useState } from 'react';

import type { RoadmapLocale, RoadmapStatus } from '../domain';
import type { RoadmapBoard as RoadmapBoardData } from '../ports';

import type { RoadmapChrome } from './copy';
import { RoadmapLane } from './roadmap-lane';

type RoadmapBoardProps = {
  board: RoadmapBoardData;
  locale: RoadmapLocale;
  chrome: RoadmapChrome;
};

// Compare + Monitor：稳定扫描通道为主。桌面 = 多列横向通道；<768px = 分段控件切换单列（改变结构，不是压缩）。
export function RoadmapBoard({ board, locale, chrome }: RoadmapBoardProps) {
  const columns = board.roadmap.columns;
  const [selected, setSelected] = useState<RoadmapStatus | undefined>(columns[0]?.status);

  const countByStatus = new Map<RoadmapStatus, number>();
  for (const entry of board.entries) {
    countByStatus.set(entry.status, (countByStatus.get(entry.status) ?? 0) + 1);
  }

  return (
    <section aria-label={chrome.boardLabel} className="flex flex-col gap-4">
      <div
        role="group"
        aria-label={chrome.lanePickerLabel}
        className="flex gap-2 overflow-x-auto md:hidden"
      >
        {columns.map((column) => (
          <button
            key={column.status}
            type="button"
            aria-pressed={selected === column.status}
            onClick={() => setSelected(column.status)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-[0.82rem] transition-colors ${
              selected === column.status
                ? 'border-[var(--color-text-soft)] bg-[var(--roadmap-chip-bg)] text-[var(--color-text)]'
                : 'border-[var(--color-border)] text-[var(--color-text-muted)]'
            }`}
          >
            {column.label[locale]}
            <span className="tabular-nums text-[var(--color-text-soft)]">
              {countByStatus.get(column.status) ?? 0}
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-4 md:grid md:auto-cols-[minmax(280px,1fr)] md:grid-flow-col md:snap-x md:overflow-x-auto">
        {columns.map((column) => (
          <RoadmapLane
            key={column.status}
            status={column.status}
            label={column.label[locale]}
            entries={board.entries.filter((entry) => entry.status === column.status)}
            locale={locale}
            chrome={chrome}
            mobileVisible={selected === column.status}
          />
        ))}
      </div>
    </section>
  );
}
