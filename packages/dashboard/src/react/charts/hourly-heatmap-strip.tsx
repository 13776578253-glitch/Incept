'use client';

import { useState } from 'react';
import { formatCompactTokens } from '../formatters';
import { IconClock } from '../sections/workbench/workbench-icons';

type HourlyHeatmapStripProps = {
  date: string;
  hourlyTokens?: number[];
  hourlyMeasuredTokens?: number;
  dayTotalTokens: number;
  title: string;
  emptyLabel: string;
  peakSummaryLabel: (hour: string, tokens: string) => string;
  activeDetailLabel: (range: string, tokens: string, share: string) => string;
  quietHourLabel: (range: string) => string;
  coverageLabel: (percent: string) => string;
  activeHoursLabel: (count: number) => string;
  lessLabel: string;
  moreLabel: string;
};

const LEVEL_INTENSITIES = [0, 22, 42, 64, 88] as const;
const HOUR_ROWS = [
  { label: '00–11', start: 0 },
  { label: '12–23', start: 12 },
] as const;

function padHour(hour: number): string {
  return String(hour).padStart(2, '0');
}

function getHourlyLevel(tokens: number, maxTokens: number): 0 | 1 | 2 | 3 | 4 {
  if (tokens <= 0 || maxTokens <= 0) return 0;
  const ratio = tokens / maxTokens;
  if (ratio <= 0.2) return 1;
  if (ratio <= 0.45) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

export function HourlyHeatmapStrip({
  date,
  hourlyTokens,
  hourlyMeasuredTokens,
  dayTotalTokens,
  title,
  emptyLabel,
  peakSummaryLabel,
  activeDetailLabel,
  quietHourLabel,
  coverageLabel,
  activeHoursLabel,
  lessLabel,
  moreLabel,
}: HourlyHeatmapStripProps) {
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [pinnedState, setPinnedState] = useState<{ date: string; hour: number | null }>({
    date,
    hour: null,
  });

  const normalizedHours =
    Array.isArray(hourlyTokens) && hourlyTokens.length === 24
      ? hourlyTokens.map((v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0))
      : null;

  const summedTokens = normalizedHours ? normalizedHours.reduce((sum, v) => sum + v, 0) : 0;
  const measuredTotal =
    typeof hourlyMeasuredTokens === 'number' && Number.isFinite(hourlyMeasuredTokens) && hourlyMeasuredTokens > 0
      ? hourlyMeasuredTokens
      : summedTokens;
  const hasHourlyData = Boolean(normalizedHours) && measuredTotal > 0;

  let peakHour = 0;
  let peakTokens = 0;
  let activeHourCount = 0;
  if (normalizedHours && hasHourlyData) {
    for (let hour = 0; hour < 24; hour++) {
      const val = normalizedHours[hour];
      if (val > 0) activeHourCount++;
      if (val > peakTokens) {
        peakTokens = val;
        peakHour = hour;
      }
    }
  }

  const pinnedHour = pinnedState.date === date ? pinnedState.hour : null;
  const activeHour = hoveredHour ?? pinnedHour;
  const shareDenominator = dayTotalTokens > 0 ? dayTotalTokens : measuredTotal;
  const coveragePct =
    hasHourlyData && dayTotalTokens > 0
      ? Math.max(1, Math.min(100, Math.round((measuredTotal / dayTotalTokens) * 100)))
      : 100;

  const activeTokens =
    activeHour !== null && normalizedHours ? (normalizedHours[activeHour] ?? 0) : 0;
  const activeRange =
    activeHour !== null ? `${padHour(activeHour)}:00–${padHour(activeHour)}:59` : '';
  const activePct =
    activeHour !== null && shareDenominator > 0 ? (activeTokens / shareDenominator) * 100 : 0;

  return (
    <div
      className={`flex h-[116px] shrink-0 flex-col justify-between rounded-[12px] border bg-[var(--surface-recessed-bg,var(--color-row-bg))] p-3 ${
        hasHourlyData
          ? 'border-[var(--color-border-subtle)]'
          : 'border-dashed border-[var(--color-border-subtle)]'
      }`}
    >
      <div className="flex h-5 items-center justify-between gap-2 text-[0.75rem]">
        <span className="inline-flex shrink-0 items-center gap-1.5 font-medium text-[var(--color-text)]">
          <IconClock className="size-3.5 text-[var(--color-accent)]" />
          <span>{title}</span>
        </span>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 overflow-hidden">
          {!hasHourlyData ? (
            <span className="truncate text-[0.68rem] text-[var(--color-text-soft)]">
              {emptyLabel}
            </span>
          ) : activeHour !== null ? (
            <span className="truncate font-mono text-[0.7rem] tabular-nums text-[var(--color-text)]">
              {activeTokens > 0
                ? activeDetailLabel(
                    activeRange,
                    formatCompactTokens(activeTokens),
                    `${activePct.toFixed(1)}%`,
                  )
                : quietHourLabel(activeRange)}
            </span>
          ) : (
            <>
              <span className="truncate font-mono text-[0.7rem] tabular-nums text-[var(--color-text-muted)]">
                {peakSummaryLabel(`${padHour(peakHour)}:00`, formatCompactTokens(peakTokens))}
              </span>
              {coveragePct < 100 ? (
                <span className="shrink-0 rounded-full border border-[var(--color-border-subtle)] px-1.5 py-px font-mono text-[0.62rem] tabular-nums text-[var(--color-text-soft)]">
                  {coverageLabel(`${coveragePct}%`)}
                </span>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div
        className="mt-2.5 space-y-1.5"
        onMouseLeave={() => setHoveredHour(null)}
      >
        {HOUR_ROWS.map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            <span className="w-9 shrink-0 font-mono text-[0.62rem] tabular-nums text-[var(--color-text-soft)]">
              {row.label}
            </span>
            <div className="grid flex-1 grid-cols-12 gap-1">
              {Array.from({ length: 12 }, (_, offset) => {
                const hour = row.start + offset;
                if (!hasHourlyData || !normalizedHours) {
                  return (
                    <div
                      key={hour}
                      aria-hidden="true"
                      className="h-3.5 rounded-[3px] bg-[var(--color-border-strong)] opacity-35"
                    />
                  );
                }

                const tokens = normalizedHours[hour] ?? 0;
                const level = getHourlyLevel(tokens, peakTokens);
                const intensity = LEVEL_INTENSITIES[level];
                const isPinned = pinnedHour === hour;
                const isActive = activeHour === hour;
                const isPeak = activeHour === null && hour === peakHour && peakTokens > 0;
                const hourRange = `${padHour(hour)}:00–${padHour(hour)}:59`;
                const pct = shareDenominator > 0 ? (tokens / shareDenominator) * 100 : 0;
                const ariaLabel =
                  tokens > 0
                    ? activeDetailLabel(
                        hourRange,
                        formatCompactTokens(tokens),
                        `${pct.toFixed(1)}%`,
                      )
                    : quietHourLabel(hourRange);

                return (
                  <button
                    key={hour}
                    type="button"
                    data-hour={hour}
                    data-level={level}
                    aria-pressed={isPinned}
                    aria-label={ariaLabel}
                    title={ariaLabel}
                    onMouseEnter={() => setHoveredHour(hour)}
                    onFocus={() => setHoveredHour(hour)}
                    onBlur={() => setHoveredHour((prev) => (prev === hour ? null : prev))}
                    onClick={() =>
                      setPinnedState((prev) => ({
                        date,
                        hour: prev.date === date && prev.hour === hour ? null : hour,
                      }))
                    }
                    style={
                      intensity > 0
                        ? {
                            backgroundColor: `color-mix(in oklab, var(--color-accent) ${intensity}%, var(--color-surface-card))`,
                          }
                        : undefined
                    }
                    className={`h-3.5 w-full cursor-pointer rounded-[3px] border transition-[transform,box-shadow,border-color] duration-100 focus-visible:outline-none ${
                      level === 0
                        ? 'border-[var(--color-border-faint,var(--color-border-subtle))] bg-[var(--color-surface-card)]/70'
                        : 'border-[color-mix(in_oklab,var(--color-accent)_28%,var(--color-border-subtle))]'
                    } ${
                      isActive
                        ? 'z-10 scale-[1.06] ring-1 ring-[var(--color-text)]/75'
                        : isPeak
                          ? 'ring-1 ring-[var(--color-accent)]/55'
                          : 'hover:border-[var(--color-border-strong)]'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div
        className={`mt-2 flex h-3.5 items-center justify-between gap-2 text-[0.62rem] text-[var(--color-text-soft)] ${
          hasHourlyData ? '' : 'opacity-40'
        }`}
      >
        <span className="truncate font-mono tabular-nums">
          {hasHourlyData ? activeHoursLabel(activeHourCount) : 'UTC+8'}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <span>{lessLabel}</span>
          {([1, 2, 3, 4] as const).map((lvl) => (
            <span
              key={lvl}
              aria-hidden="true"
              className="size-2 rounded-[2px] border border-[var(--color-border-subtle)]"
              style={{
                backgroundColor: `color-mix(in oklab, var(--color-accent) ${LEVEL_INTENSITIES[lvl]}%, var(--color-surface-card))`,
              }}
            />
          ))}
          <span>{moreLabel}</span>
        </div>
      </div>
    </div>
  );
}
