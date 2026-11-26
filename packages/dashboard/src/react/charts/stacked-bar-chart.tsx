'use client';

import { useEffect, useRef, useState } from 'react';
import { useScrollReveal } from './use-scroll-reveal';

export type BarSegment = {
  id: string;
  label: string;
  value: number;
  color: string;
};

export type StackedBarDatum = {
  key: string;
  label: string;
  fullLabel: string;
  total: number;
  formattedTotal: string;
  isPartial?: boolean;
  segments: BarSegment[];
};

export type StackedBarLegendItem = {
  id: string;
  label: string;
  color: string;
  share: number;
};

type StackedBarChartProps = {
  data: ReadonlyArray<StackedBarDatum>;
  activeKey?: string | null;
  onSelectBar?: (datum: StackedBarDatum, index: number) => void;
  onHoverIndexChange?: (index: number | null) => void;
  hideReadoutBar?: boolean;
  enableSeriesSpotlight?: boolean;
  minColumnWidth?: number;
  formatYAxis: (value: number) => string;
  overlayLine?: ReadonlyArray<number | null>;
  overlayLabel?: string;
  overlayColor?: string;
  normalized?: boolean;
  legendItems?: ReadonlyArray<StackedBarLegendItem>;
  emptyLabel: string;
  partialLabel?: string;
  ariaLabel: string;
};

export function StackedBarChart({
  data,
  activeKey,
  onSelectBar,
  onHoverIndexChange,
  hideReadoutBar = false,
  enableSeriesSpotlight = false,
  minColumnWidth,
  formatYAxis,
  overlayLine,
  overlayLabel,
  overlayColor = 'var(--chart-total-line, #0ea5e9)',
  normalized = false,
  legendItems,
  emptyLabel,
  partialLabel = 'Partial',
  ariaLabel,
}: StackedBarChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);
  const [lockedSeriesId, setLockedSeriesId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const handleScrollReveal = useScrollReveal();

  const focusedSeriesId = enableSeriesSpotlight ? (hoveredSegmentId ?? lockedSeriesId) : null;

  const shouldScroll = Boolean(minColumnWidth && minColumnWidth > 0 && data.length > 0);
  const minTrackWidth = shouldScroll ? data.length * (minColumnWidth as number) : undefined;

  useEffect(() => {
    if (shouldScroll && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [shouldScroll, data.length]);

  const setHovered = (idx: number | null) => {
    setHoveredIndex(idx);
    onHoverIndexChange?.(idx);
  };

  if (data.length === 0) {
    return (
      <div className="flex flex-1 min-h-[210px] items-center justify-center rounded-[10px] border border-dashed border-[var(--color-border-subtle)] text-[0.78rem] text-[var(--color-text-soft)]">
        {emptyLabel}
      </div>
    );
  }

  const maxTotal = normalized
    ? 100
    : Math.max(
        1,
        ...data.map((d) => d.total),
        ...(overlayLine ?? []).map((v) => v ?? 0),
      );

  const displayIndex =
    hoveredIndex !== null && hoveredIndex >= 0 && hoveredIndex < data.length
      ? hoveredIndex
      : data.findIndex((d) => d.key === activeKey);
  const inspected = displayIndex >= 0 ? data[displayIndex] : null;
  const inspectedOverlay =
    !normalized && displayIndex >= 0 && overlayLine && overlayLine[displayIndex] !== null
      ? overlayLine[displayIndex]
      : null;

  const tickStep = shouldScroll
    ? 2
    : data.length <= 10
      ? 1
      : data.length <= 18
        ? 2
        : data.length <= 31
          ? 4
          : 6;

  let overlayPath = '';
  if (!normalized && overlayLine && overlayLine.length === data.length && data.length > 1) {
    const parts: string[] = [];
    overlayLine.forEach((val, idx) => {
      if (val === null || !Number.isFinite(val)) return;
      const x = ((idx + 0.5) / data.length) * 1000;
      const y = 100 - Math.min(100, Math.max(0, (val / maxTotal) * 100));
      const prevNull = idx === 0 || overlayLine[idx - 1] === null;
      parts.push(`${prevNull ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    });
    overlayPath = parts.join(' ');
  }

  // When hovering a bucket, show that bucket's actual model breakdown in the legend; otherwise period summary.
  const activeLegendItems = legendItems
    ? inspected && inspected.total > 0 && inspected.segments.length > 1
      ? inspected.segments.map((seg) => ({
          id: seg.id,
          label: seg.label,
          color: seg.color,
          share: seg.value / inspected.total,
        }))
      : legendItems
    : null;

  const floatingSegments =
    enableSeriesSpotlight && hoveredIndex !== null && inspected
      ? [...inspected.segments]
          .filter((s) => s.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 8)
      : [];

  const popoverSideStyle = (() => {
    if (hoveredIndex === null || data.length === 0) return undefined;
    if (shouldScroll) {
      return hoveredIndex > data.length * 0.5 ? { left: '10px' } : { right: '10px' };
    }
    const isRightHalf = hoveredIndex >= data.length * 0.52;
    if (isRightHalf) {
      const rightOffsetPct = Math.max(4, ((data.length - hoveredIndex) / data.length) * 100);
      return { right: `calc(${rightOffsetPct.toFixed(1)}% + 8px)` };
    }
    const leftOffsetPct = Math.min(62, ((hoveredIndex + 1) / data.length) * 100);
    return { left: `calc(${leftOffsetPct.toFixed(1)}% + 8px)` };
  })();

  return (
    <div
      className="flex flex-1 min-h-0 flex-col justify-between gap-2"
      aria-label={ariaLabel}
      role="region"
    >
      {!hideReadoutBar ? (
        <div className="dashboard-subtle-scrollbar flex h-7 shrink-0 items-center justify-between gap-3 overflow-x-auto overflow-y-hidden whitespace-nowrap rounded-[8px] bg-[var(--surface-recessed-bg,var(--color-row-bg))] px-2.5 text-[0.72rem] tabular-nums">
          {inspected ? (
            <>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono font-medium text-[var(--color-text)]">
                  {inspected.fullLabel}
                </span>
                {inspected.isPartial ? (
                  <span className="rounded-full border border-[var(--color-border-subtle)] px-1.5 py-0 text-[0.64rem] text-[var(--color-text-muted)]">
                    {partialLabel}
                  </span>
                ) : null}
                <span className="font-semibold text-[var(--color-text)]">
                  {inspected.formattedTotal}
                </span>
                {inspectedOverlay !== null && overlayLabel ? (
                  <span className="text-[var(--color-text-muted)]">
                    · {overlayLabel}: {formatYAxis(inspectedOverlay)}
                  </span>
                ) : null}
              </div>
              {inspected.segments.length > 1 ? (
                <div className="flex shrink-0 items-center gap-3 text-[0.68rem] text-[var(--color-text-muted)]">
                  {inspected.segments.slice(0, 4).map((seg) => (
                    <span key={seg.id} className="inline-flex items-center gap-1">
                      <span
                        aria-hidden="true"
                        className="size-2 rounded-[2px]"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="max-w-[96px] truncate">{seg.label}</span>
                      <span className="font-mono text-[var(--color-text)]">
                        {normalized && inspected.total > 0
                          ? `${((seg.value / inspected.total) * 100).toFixed(1)}%`
                          : formatYAxis(seg.value)}
                      </span>
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <span className="text-[var(--color-text-soft)]">
              {data[0]?.fullLabel} — {data[data.length - 1]?.fullLabel}
            </span>
          )}
        </div>
      ) : null}

      {/* Main bar canvas with fixed Y-axis + optional horizontal scroll track */}
      <div className="relative flex flex-1 min-h-0 gap-2">
        <div
          aria-hidden="true"
          className={`flex h-full min-h-[160px] w-11 shrink-0 flex-col justify-between pt-0 text-right font-mono text-[0.65rem] leading-none tabular-nums text-[var(--color-text-soft)] ${
            shouldScroll ? 'pb-[30px]' : 'pb-[22px]'
          }`}
        >
          <span>{normalized ? '100%' : formatYAxis(maxTotal)}</span>
          <span>{normalized ? '50%' : formatYAxis(maxTotal * 0.5)}</span>
          <span>{normalized ? '0%' : '0'}</span>
        </div>

        <div className="relative flex min-w-0 flex-1 flex-col">
          {enableSeriesSpotlight &&
          hoveredIndex !== null &&
          inspected &&
          floatingSegments.length > 0 &&
          popoverSideStyle ? (
            <div
              role="tooltip"
              style={popoverSideStyle}
              className="pointer-events-none absolute top-2 z-20 w-[216px] rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-card,var(--color-bg))] p-2.5 shadow-lg"
            >
              <div className="flex items-baseline justify-between gap-2 border-b border-[var(--color-border-faint)] pb-1.5">
                <span className="font-mono text-[0.7rem] font-semibold tabular-nums text-[var(--color-text)]">
                  {inspected.fullLabel}
                </span>
                <span className="font-mono text-[0.7rem] font-semibold tabular-nums text-[var(--color-text)]">
                  {inspected.formattedTotal}
                </span>
              </div>
              <ul className="mt-1.5 space-y-1">
                {floatingSegments.map((seg) => {
                  const isFocused = focusedSeriesId === seg.id;
                  const isDimmed = focusedSeriesId !== null && !isFocused;
                  return (
                    <li
                      key={seg.id}
                      className={`flex items-center justify-between gap-2 font-mono text-[0.67rem] tabular-nums transition-opacity duration-150 ${
                        isDimmed ? 'opacity-40' : 'opacity-100'
                      } ${isFocused ? 'font-semibold text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}`}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className="size-1.5 shrink-0 rounded-[2px]"
                          style={{ backgroundColor: seg.color }}
                        />
                        <span className="truncate">{seg.label}</span>
                      </span>
                      <span className="shrink-0 text-[var(--color-text)]">
                        {formatYAxis(seg.value)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div
            ref={scrollRef}
            onScroll={shouldScroll ? handleScrollReveal : undefined}
            className={`flex min-w-0 flex-1 flex-col ${
              shouldScroll ? 'dashboard-subtle-scrollbar overflow-x-auto overflow-y-hidden' : ''
            }`}
          >
          <div
            className={`flex flex-1 min-h-0 flex-col ${shouldScroll ? 'px-1.5 pb-2' : ''}`}
            style={minTrackWidth ? { minWidth: `${minTrackWidth}px` } : undefined}
          >
            <div
              className="relative flex-1 min-h-[140px]"
              onMouseLeave={() => {
                setHovered(null);
                setHoveredSegmentId(null);
              }}
            >
              {/* Gridlines */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex flex-col justify-between"
              >
                <div className="border-t border-dashed border-[var(--chart-grid,var(--color-border-faint))]" />
                <div className="border-t border-dashed border-[var(--chart-grid,var(--color-border-faint))]" />
                <div className="border-b border-[var(--color-border-subtle)]" />
              </div>

              {/* Optional smooth moving-average / EWMA overlay line */}
              {overlayPath ? (
                <svg
                  viewBox="0 0 1000 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible"
                >
                  <path
                    d={overlayPath}
                    fill="none"
                    stroke={overlayColor}
                    strokeWidth="2"
                    strokeDasharray="5 4"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              ) : null}

              <div className="absolute inset-0 z-0 flex items-end gap-[3px] sm:gap-1.5">
                {data.map((item, idx) => {
                  const barPct =
                    item.total > 0
                      ? normalized
                        ? 100
                        : Math.max(2, (item.total / maxTotal) * 100)
                      : 0;
                  const isSelected = activeKey === item.key || hoveredIndex === idx;

                  return (
                    <button
                      key={item.key}
                      type="button"
                      aria-label={`${item.fullLabel}: ${item.formattedTotal}`}
                      onMouseEnter={() => setHovered(idx)}
                      onMouseLeave={() => setHovered(null)}
                      onFocus={() => setHovered(idx)}
                      onBlur={() => setHovered(null)}
                      onClick={() => onSelectBar?.(item, idx)}
                      className="group relative flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end focus-visible:outline-none"
                    >
                      {barPct > 0 ? (
                        <div
                          className={`flex w-full max-w-[32px] flex-col-reverse gap-[1px] overflow-hidden rounded-t-[4px] transition-opacity duration-150 ${
                            focusedSeriesId !== null
                              ? isSelected
                                ? 'opacity-100 ring-1 ring-[var(--color-border-strong)]'
                                : 'opacity-100'
                              : isSelected
                                ? 'opacity-100 ring-1 ring-[var(--color-accent-border)]'
                                : hoveredIndex !== null
                                  ? 'opacity-48'
                                  : 'opacity-92 group-hover:opacity-100'
                          }`}
                          style={{ height: `${barPct}%` }}
                        >
                          {item.segments.map((seg) => {
                            if (seg.value <= 0) return null;
                            const isDimmedSegment =
                              focusedSeriesId !== null && seg.id !== focusedSeriesId;
                            return (
                              <span
                                key={seg.id}
                                onMouseEnter={
                                  enableSeriesSpotlight
                                    ? () => setHoveredSegmentId(seg.id)
                                    : undefined
                                }
                                onMouseLeave={
                                  enableSeriesSpotlight
                                    ? () => setHoveredSegmentId(null)
                                    : undefined
                                }
                                style={{
                                  flexGrow: seg.value,
                                  flexBasis: 0,
                                  minHeight: '1px',
                                  backgroundColor: isDimmedSegment
                                    ? 'color-mix(in oklab, var(--color-text-soft) 18%, var(--surface-recessed-bg, var(--color-row-bg)))'
                                    : seg.color,
                                  opacity: isDimmedSegment ? 0.72 : 1,
                                }}
                                className="block w-full transition-[background-color,opacity] duration-150"
                              />
                            );
                          })}
                        </div>
                      ) : normalized ? (
                        <span
                          aria-hidden="true"
                          className="mb-1 text-[0.65rem] leading-none text-[var(--color-text-soft)]"
                        >
                          —
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Thinned X-axis ticks */}
            <div className="mt-1.5 flex h-4 shrink-0 items-center gap-[3px] sm:gap-1.5">
              {data.map((item, idx) => {
                const showTick =
                  idx === 0 || idx === data.length - 1 || idx % tickStep === 0;
                return (
                  <div
                    key={item.key}
                    className="min-w-0 flex-1 text-center font-mono text-[0.62rem] tabular-nums text-[var(--color-text-soft)]"
                  >
                    {showTick ? (
                      <span className="inline-block max-w-full truncate">
                        {item.label}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          </div>
        </div>
      </div>

      {/* Fixed-height single-line share legend aligned with bar plot start */}
      {activeLegendItems && activeLegendItems.length > 0 ? (
        <div
          onScroll={handleScrollReveal}
          className="dashboard-subtle-scrollbar flex h-6 shrink-0 flex-nowrap items-center gap-x-2.5 overflow-x-auto overflow-y-hidden whitespace-nowrap pl-[52px] text-[0.69rem] tabular-nums text-[var(--color-text-muted)]"
        >
          {activeLegendItems.map((item) => {
            if (!enableSeriesSpotlight) {
              return (
                <span key={item.id} className="inline-flex shrink-0 items-center gap-1.5 px-1">
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span>{item.label}</span>
                  <span className="font-mono text-[var(--color-text)]">
                    {(item.share * 100).toFixed(1)}%
                  </span>
                </span>
              );
            }

            const isLocked = lockedSeriesId === item.id;
            const isDimmedLegend = focusedSeriesId !== null && focusedSeriesId !== item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={isLocked}
                onMouseEnter={() => setHoveredSegmentId(item.id)}
                onMouseLeave={() => setHoveredSegmentId(null)}
                onFocus={() => setHoveredSegmentId(item.id)}
                onBlur={() => setHoveredSegmentId(null)}
                onClick={() =>
                  setLockedSeriesId((prev) => (prev === item.id ? null : item.id))
                }
                className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[5px] px-1.5 py-0.5 transition-opacity duration-150 ${
                  isLocked
                    ? 'bg-[var(--color-nav-item-active,var(--color-row-bg))] text-[var(--color-text)]'
                    : 'hover:bg-[var(--color-nav-item-hover,var(--color-row-bg))] hover:text-[var(--color-text)]'
                } ${isDimmedLegend ? 'opacity-45' : 'opacity-100'}`}
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span>{item.label}</span>
                <span className="font-mono text-[var(--color-text)]">
                  {(item.share * 100).toFixed(1)}%
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
