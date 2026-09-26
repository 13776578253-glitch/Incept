'use client';

import { useState } from 'react';

import type { RoadmapEntry, RoadmapLocale, RoadmapStatus } from '../domain';
import type { RoadmapBoard as RoadmapBoardData } from '../ports';

import type { RoadmapChrome } from './copy';
import { statusColors, statusIcons } from './icons';
import { RoadmapDetailModal } from './roadmap-detail-modal';
import { RoadmapLane } from './roadmap-lane';

type RoadmapBoardProps = {
  board: RoadmapBoardData;
  locale: RoadmapLocale;
  chrome: RoadmapChrome;
  canEdit: boolean;
  onChanged?: () => void;
};

// Module C：Undo 目标 = 板列序上一档；状态不在板列时按 completed→active→unstarted→reviewing 回退一级。
function undoTargetFor(
  columns: readonly { status: RoadmapStatus }[],
  entry: RoadmapEntry,
): RoadmapStatus | undefined {
  const index = columns.findIndex((column) => column.status === entry.status);

  if (index >= 0) {
    return index > 0 ? columns[index - 1].status : undefined;
  }

  const fallback: readonly RoadmapStatus[] = ['completed', 'active', 'unstarted', 'reviewing'];
  const fallbackIndex = fallback.indexOf(entry.status);

  return fallbackIndex > 0 ? fallback[fallbackIndex - 1] : undefined;
}

// Compare + Monitor：稳定扫描通道为主。桌面 = 多列横向通道；<768px = 分段控件切换单列（改变结构，不是压缩）。
export function RoadmapBoard({
  board,
  locale,
  chrome,
  canEdit,
  onChanged,
}: RoadmapBoardProps) {
  const columns = board.roadmap.columns;
  const [selected, setSelected] = useState<RoadmapStatus | undefined>(columns[0]?.status);
  const [entries, setEntries] = useState<readonly RoadmapEntry[]>(board.entries);
  const [activeEntry, setActiveEntry] = useState<RoadmapEntry | null>(null);

  function handleEntrySaved(saved: RoadmapEntry) {
    setEntries((prev) =>
      prev.some((item) => item.key === saved.key)
        ? prev.map((item) => (item.key === saved.key ? saved : item))
        : [...prev, saved],
    );
    setActiveEntry(saved);
    onChanged?.();
  }

  function handleEntryDeleted(key: string) {
    setEntries((prev) => prev.filter((item) => item.key !== key));
    setActiveEntry(null);
    onChanged?.();
  }

  const countByStatus = new Map<RoadmapStatus, number>();
  for (const entry of entries) {
    countByStatus.set(entry.status, (countByStatus.get(entry.status) ?? 0) + 1);
  }

  const columnLabels: Partial<Record<RoadmapStatus, string>> = {};
  for (const column of columns) {
    columnLabels[column.status] = column.label.en || column.label[locale];
  }

  return (
    <section aria-label={chrome.boardLabel} className="flex flex-col gap-3 md:min-h-0 md:flex-1">
      <div
        role="group"
        aria-label={chrome.lanePickerLabel}
        className="flex gap-2 overflow-x-auto pb-1 md:hidden"
      >
        {columns.map((column) => {
          const StatusIcon = statusIcons[column.status];
          const displayLabel = column.label.en || column.label[locale];

          return (
            <button
              key={column.status}
              type="button"
              aria-pressed={selected === column.status}
              onClick={() => setSelected(column.status)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.8rem] font-medium transition-colors ${
                selected === column.status
                  ? 'border-[var(--roadmap-border-hover,var(--color-text-soft))] bg-[var(--roadmap-chip-bg)] text-[var(--color-text)] shadow-xs'
                  : 'border-[var(--roadmap-border,var(--color-border))] text-[var(--color-text-muted)]'
              }`}
            >
              <span
                aria-hidden="true"
                className="inline-flex shrink-0"
                style={{ color: statusColors[column.status] }}
              >
                <StatusIcon />
              </span>
              {displayLabel}
              <span className="tabular-nums text-[var(--color-text-soft)]">
                {countByStatus.get(column.status) ?? 0}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-3.5 md:grid md:min-h-0 md:flex-1 md:grid-rows-[minmax(0,1fr)] md:auto-cols-[minmax(288px,1fr)] md:grid-flow-col md:items-start md:gap-4 md:snap-x md:overflow-x-auto">
        {columns.map((column) => {
          const displayLabel = column.label.en || column.label[locale];

          return (
            <RoadmapLane
              key={column.status}
              status={column.status}
              label={displayLabel}
              entries={entries.filter((entry) => entry.status === column.status)}
              locale={locale}
              chrome={chrome}
              mobileVisible={selected === column.status}
              onSelectEntry={(entry) => setActiveEntry(entry)}
            />
          );
        })}
      </div>
      {activeEntry && (
        <RoadmapDetailModal
          entry={activeEntry}
          allEntries={entries}
          columnLabels={columnLabels}
          locale={locale}
          chrome={chrome}
          canEdit={canEdit}
          undoStatus={undoTargetFor(columns, activeEntry)}
          onClose={() => setActiveEntry(null)}
          onSelectEntry={(entry) => setActiveEntry(entry)}
          onEntrySaved={handleEntrySaved}
          onEntryDeleted={handleEntryDeleted}
        />
      )}
    </section>
  );
}

