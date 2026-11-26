'use client';

import { useState } from 'react';
import { formatCompactTokens, formatPercent } from '../formatters';

export type DonutSlice = {
  id: string;
  label: string;
  value: number;
  share: number;
  color: string;
};

type DonutChartProps = {
  slices: ReadonlyArray<DonutSlice>;
  centerLabel: string;
  centerValue: string;
  emptyLabel: string;
  ariaLabel: string;
  centerTransitionKey?: string;
  modeTransitionKey?: string;
  transitionDirection?: 'prev' | 'next' | null;
  formatValue?: (value: number) => string;
};

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DonutChart({
  slices,
  centerLabel,
  centerValue,
  emptyLabel,
  ariaLabel,
  formatValue = formatCompactTokens,
}: DonutChartProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const nonZeroSlices = slices.filter((s) => s.value > 0);
  const activeSlice = nonZeroSlices.find((s) => s.id === activeId) ?? null;

  if (nonZeroSlices.length === 0) {
    return (
      <div className="flex h-[352px] w-full items-center justify-center rounded-[10px] border border-dashed border-[var(--color-border-subtle)] text-[0.78rem] text-[var(--color-text-soft)] sm:h-[184px]">
        {emptyLabel}
      </div>
    );
  }

  let offset = 0;
  const arcData = nonZeroSlices.map((slice) => {
    const length = Math.max(0, slice.share * CIRCUMFERENCE);
    const currentOffset = offset;
    offset += length;
    return { ...slice, length, offset: currentOffset };
  });

  return (
    <div
      aria-label={ariaLabel}
      role="region"
      className="flex h-[352px] w-full flex-col items-center gap-5 sm:h-[184px] sm:flex-row sm:items-center"
    >
      <div className="relative size-[148px] shrink-0">
        <svg viewBox="0 0 148 148" className="size-full -rotate-90">
          <circle
            cx="74"
            cy="74"
            r={RADIUS}
            fill="none"
            stroke="var(--surface-recessed-bg, var(--color-row-bg))"
            strokeWidth="16"
          />
          {arcData.map((arc) => {
            const isDimmed = activeSlice !== null && activeSlice.id !== arc.id;
            const arcGap = arcData.length > 1 && arc.length > 3 ? 1.5 : 0;
            return (
              <circle
                key={arc.id}
                cx="74"
                cy="74"
                r={RADIUS}
                fill="none"
                stroke={arc.color}
                strokeWidth={activeSlice?.id === arc.id ? '19' : '16'}
                strokeDasharray={`${Math.max(0.5, arc.length - arcGap)} ${CIRCUMFERENCE}`}
                strokeDashoffset={-arc.offset}
                className="dashboard-donut-arc cursor-pointer transition-[stroke-dasharray,stroke-dashoffset,stroke-width,opacity] duration-300 ease-out"
                style={{ opacity: isDimmed ? 0.38 : 1 }}
                onMouseEnter={() => setActiveId(arc.id)}
                onMouseLeave={() => setActiveId(null)}
              />
            );
          })}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className="max-w-[84px] truncate text-[0.62rem] text-[var(--color-text-muted)]">
            {activeSlice ? activeSlice.label : centerLabel}
          </span>
          <span className="mt-0.5 font-mono text-[0.95rem] font-semibold tracking-tight tabular-nums text-[var(--color-text)]">
            {activeSlice ? formatPercent(activeSlice.share) : centerValue}
          </span>
        </div>
      </div>

      <ul className="flex h-[184px] w-full min-w-0 flex-1 flex-col justify-center gap-1 overflow-hidden">
        {slices.map((slice) => {
          const isActive = activeId === slice.id;
          return (
            <li key={slice.id}>
              <button
                type="button"
                onMouseEnter={() => setActiveId(slice.id)}
                onMouseLeave={() => setActiveId(null)}
                onFocus={() => setActiveId(slice.id)}
                onBlur={() => setActiveId(null)}
                className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-[7px] px-2 py-1 text-left text-[0.74rem] leading-[18px] transition-colors ${
                  isActive ? 'bg-[var(--color-row-bg)]' : 'hover:bg-[var(--color-row-bg)]'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="truncate text-[var(--color-text)]">{slice.label}</span>
                </span>
                <span className="shrink-0 font-mono text-[0.71rem] tabular-nums text-[var(--color-text-muted)]">
                  {formatValue(slice.value)} · {formatPercent(slice.share)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
