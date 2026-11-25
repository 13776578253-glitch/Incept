'use client';

import { useState } from 'react';
import type { DailyUsagePoint } from '../../domain';
import {
  computeCalendarQuantileThresholds,
  getCalendarIntensityLevel,
} from '../analytics/derive-analytics';
import { formatCompactTokens } from '../formatters';
import { adjacentMonth, calendarMonth } from '../sections/overview/calendar-month';
import { IconChevronLeft, IconChevronRight } from '../sections/workbench/workbench-icons';

type CompactCalendarPickerProps = {
  points: ReadonlyArray<DailyUsagePoint>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  locale: 'zh' | 'en';
  prevMonthLabel: string;
  nextMonthLabel: string;
  lessLabel: string;
  moreLabel: string;
};

const WEEKDAYS_ZH = ['一', '二', '三', '四', '五', '六', '日'];
const WEEKDAYS_EN = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const LEVEL_INTENSITIES = [0, 16, 32, 52, 72] as const;

export function CompactCalendarPicker({
  points,
  selectedDate,
  onSelectDate,
  locale,
  prevMonthLabel,
  nextMonthLabel,
  lessLabel,
  moreLabel,
}: CompactCalendarPickerProps) {
  const byDate = new Map(points.map((p) => [p.date, p]));
  const availableMonths = Array.from(new Set(points.map((p) => p.date.slice(0, 7)))).sort();
  const minMonth = availableMonths[0] ?? '2026-01';
  const maxMonth = availableMonths[availableMonths.length - 1] ?? '2026-01';
  const [monthOffset, setMonthOffset] = useState<{ base: string; current: string }>({
    base: selectedDate ? selectedDate.slice(0, 7) : maxMonth,
    current: selectedDate ? selectedDate.slice(0, 7) : maxMonth,
  });

  const expectedBase = selectedDate ? selectedDate.slice(0, 7) : maxMonth;
  const activeMonth = monthOffset.base === expectedBase ? monthOffset.current : expectedBase;
  const thresholds = computeCalendarQuantileThresholds(points);

  const cells = calendarMonth(activeMonth);
  const canPrev = activeMonth > minMonth;
  const canNext = activeMonth < maxMonth;
  const [yearNum, monthNum] = activeMonth.split('-').map(Number);
  const heading =
    locale === 'zh'
      ? `${yearNum}年${monthNum}月`
      : new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
          new Date(Date.UTC(yearNum, (monthNum || 1) - 1, 1)),
        );

  const weekdays = locale === 'zh' ? WEEKDAYS_ZH : WEEKDAYS_EN;
  const swatchHints = thresholds.hasData
    ? [
        `≤ ${formatCompactTokens(thresholds.p25)}`,
        `≤ ${formatCompactTokens(thresholds.p50)}`,
        `≤ ${formatCompactTokens(thresholds.p75)}`,
        `> ${formatCompactTokens(thresholds.p75)}`,
      ]
    : [];

  return (
    <div className="flex flex-1 min-h-0 flex-col justify-between gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[0.8rem] font-semibold text-[var(--color-text)]">{heading}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={prevMonthLabel}
            disabled={!canPrev}
            onClick={() =>
              setMonthOffset({ base: expectedBase, current: adjacentMonth(activeMonth, -1) })
            }
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-[7px] border border-[var(--color-border)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-row-bg)] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <IconChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={nextMonthLabel}
            disabled={!canNext}
            onClick={() =>
              setMonthOffset({ base: expectedBase, current: adjacentMonth(activeMonth, 1) })
            }
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-[7px] border border-[var(--color-border)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-row-bg)] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <IconChevronRight className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] text-[var(--color-text-soft)]">
        {weekdays.map((wd, idx) => (
          <span key={idx}>{wd}</span>
        ))}
      </div>

      <div role="grid" aria-label={heading} className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const point = byDate.get(cell.key);
          const isSelected = selectedDate === cell.key;
          const { level } = getCalendarIntensityLevel(point?.totalTokens ?? 0, thresholds);
          const intensity = LEVEL_INTENSITIES[level];

          return (
            <button
              key={cell.key}
              data-level={level}
              type="button"
              role="gridcell"
              disabled={!point}
              aria-label={`${cell.key}: ${point ? formatCompactTokens(point.totalTokens) : '—'}`}
              onClick={() => point && onSelectDate(cell.key)}
              style={
                intensity > 0
                  ? {
                      backgroundColor: `color-mix(in oklab, var(--color-accent) ${intensity}%, var(--color-surface-card))`,
                    }
                  : undefined
              }
              className={`flex h-8 cursor-pointer flex-col items-center justify-center rounded-[7px] border text-[0.66rem] tabular-nums transition-colors disabled:cursor-default disabled:opacity-35 ${
                isSelected
                  ? 'border-[var(--color-accent)] ring-1 ring-[var(--color-ring-focus)]'
                  : 'border-[var(--color-border-subtle)] bg-[var(--color-row-bg)] hover:border-[var(--color-border-strong)]'
              } ${!cell.inMonth ? (point ? 'border-dashed opacity-90' : 'opacity-45') : ''}`}
            >
              <span className="font-medium leading-none text-[var(--color-text)]">
                {cell.date.getUTCDate()}
              </span>
              <span className="mt-0.5 font-mono text-[0.58rem] leading-none text-[var(--color-text-muted)]">
                {point && point.totalTokens > 0 ? formatCompactTokens(point.totalTokens) : '—'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-1.5 text-[0.65rem] text-[var(--color-text-soft)]">
        <span>{lessLabel}</span>
        {([1, 2, 3, 4] as const).map((lvl, idx) => (
          <span
            key={lvl}
            aria-hidden="true"
            title={swatchHints[idx]}
            className="size-2.5 rounded-[2px] border border-[var(--color-border-subtle)]"
            style={{
              backgroundColor: `color-mix(in oklab, var(--color-accent) ${LEVEL_INTENSITIES[lvl]}%, var(--color-surface-card))`,
            }}
          />
        ))}
        <span>{moreLabel}</span>
        {thresholds.hasData ? (
          <span className="ml-1 hidden font-mono text-[0.62rem] text-[var(--color-text-soft)] sm:inline">
            P25 {formatCompactTokens(thresholds.p25)} · P75 {formatCompactTokens(thresholds.p75)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
