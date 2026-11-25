'use client';

import { useEffect, useRef, useState } from 'react';

export type LineSeriesItem = {
  id: string;
  label: string;
  color: string;
  values: ReadonlyArray<number | null>;
  summaryValue?: string;
  denominators?: ReadonlyArray<number>;
};

export type LineAxisLabel = {
  key: string;
  label: string;
  fullLabel: string;
};

type MultiLineChartProps = {
  xAxis: ReadonlyArray<LineAxisLabel>;
  series: ReadonlyArray<LineSeriesItem>;
  hiddenSeriesIds?: ReadonlySet<string>;
  onToggleSeries?: (seriesId: string) => void;
  hideReadoutBar?: boolean;
  onHoverIndexChange?: (index: number | null) => void;
  minColumnWidth?: number;
  yMin?: number;
  yMax?: number;
  showArea?: boolean;
  formatValue: (value: number) => string;
  formatDenominator?: (value: number) => string;
  emptyLabel: string;
  ariaLabel: string;
};

const SVG_HEIGHT = 200;
const PAD_LEFT = 8;
const PAD_RIGHT = 8;
const PAD_TOP = 12;
const PAD_BOTTOM = 12;

function buildContinuousSegments(
  points: ReadonlyArray<{ x: number; y: number; value: number } | null>,
): string[] {
  const paths: string[] = [];
  let current = '';

  for (const pt of points) {
    if (!pt) {
      if (current) {
        paths.push(current);
        current = '';
      }
      continue;
    }
    current += current
      ? ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`
      : `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
  }

  if (current) {
    paths.push(current);
  }
  return paths;
}

export function MultiLineChart({
  xAxis,
  series,
  hiddenSeriesIds,
  onToggleSeries,
  hideReadoutBar = false,
  onHoverIndexChange,
  minColumnWidth,
  yMin = 0,
  yMax = 1,
  showArea = false,
  formatValue,
  formatDenominator,
  emptyLabel,
  ariaLabel,
}: MultiLineChartProps) {
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const shouldScroll = Boolean(minColumnWidth && minColumnWidth > 0 && xAxis.length > 0);
  const minTrackWidth = shouldScroll ? xAxis.length * (minColumnWidth as number) : undefined;
  const svgWidth = Math.max(720, minTrackWidth ?? 720);

  useEffect(() => {
    if (shouldScroll && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [shouldScroll, xAxis.length]);

  const setHovered = (idx: number | null) => {
    setHoveredCol(idx);
    onHoverIndexChange?.(idx);
  };

  if (xAxis.length === 0 || series.length === 0) {
    return (
      <div className="flex flex-1 min-h-[210px] items-center justify-center rounded-[10px] border border-dashed border-[var(--color-border-subtle)] text-[0.78rem] text-[var(--color-text-soft)]">
        {emptyLabel}
      </div>
    );
  }

  const visibleSeries = series.filter((s) => !hiddenSeriesIds?.has(s.id));
  const span = Math.max(0.0001, yMax - yMin);
  const plotW = svgWidth - PAD_LEFT - PAD_RIGHT;
  const plotH = SVG_HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xForIndex = (idx: number) => {
    if (xAxis.length === 1) return PAD_LEFT + plotW / 2;
    return PAD_LEFT + (idx / (xAxis.length - 1)) * plotW;
  };

  const yForValue = (val: number) => {
    const ratio = Math.min(1, Math.max(0, (val - yMin) / span));
    return PAD_TOP + (1 - ratio) * plotH;
  };

  const activeCol =
    hoveredCol !== null && hoveredCol >= 0 && hoveredCol < xAxis.length
      ? hoveredCol
      : xAxis.length - 1;
  const activeAxis = xAxis[activeCol];

  const tickStep = shouldScroll
    ? 2
    : xAxis.length <= 8
      ? 1
      : xAxis.length <= 18
        ? 2
        : xAxis.length <= 31
          ? 5
          : 6;

  return (
    <div
      className="flex flex-1 min-h-0 flex-col justify-between gap-2"
      aria-label={ariaLabel}
      role="region"
    >
      {/* Interactive model chips (when more than 1 series or toggleable) */}
      {series.length > 1 || onToggleSeries ? (
        <div className="dashboard-subtle-scrollbar flex h-7 shrink-0 items-center gap-1.5 overflow-x-auto overflow-y-hidden whitespace-nowrap">
          {series.map((item) => {
            const isHidden = hiddenSeriesIds?.has(item.id) ?? false;
            const content = (
              <>
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: isHidden ? 'var(--color-border-strong)' : item.color }}
                />
                <span className="max-w-[140px] truncate">{item.label}</span>
                {item.summaryValue ? (
                  <span className="font-mono text-[var(--color-text)]">
                    {item.summaryValue}
                  </span>
                ) : null}
              </>
            );

            if (onToggleSeries) {
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={!isHidden}
                  onClick={() => onToggleSeries(item.id)}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.7rem] transition-colors ${
                    isHidden
                      ? 'border-[var(--color-border-faint)] bg-transparent text-[var(--color-text-soft)] opacity-60 hover:opacity-90'
                      : 'border-[var(--color-border-subtle)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)]'
                  }`}
                >
                  {content}
                </button>
              );
            }

            return (
              <span
                key={item.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-2.5 py-0.5 text-[0.7rem] text-[var(--color-text-muted)]"
              >
                {content}
              </span>
            );
          })}
        </div>
      ) : null}

      {!hideReadoutBar ? (
        <div className="dashboard-subtle-scrollbar flex h-7 shrink-0 items-center justify-between gap-3 overflow-x-auto overflow-y-hidden whitespace-nowrap rounded-[8px] bg-[var(--surface-recessed-bg,var(--color-row-bg))] px-2.5 text-[0.72rem] tabular-nums">
          <span className="shrink-0 font-mono font-medium text-[var(--color-text)]">
            {activeAxis?.fullLabel}
          </span>
          <div className="flex shrink-0 items-center gap-3">
            {visibleSeries.map((item) => {
              const val = item.values[activeCol];
              const denom = item.denominators?.[activeCol];
              return (
                <span key={item.id} className="inline-flex shrink-0 items-center gap-1.5 text-[0.7rem]">
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="max-w-[120px] truncate text-[var(--color-text-muted)]">
                    {item.label}
                  </span>
                  <span className="font-mono font-semibold text-[var(--color-text)]">
                    {val !== null && Number.isFinite(val) ? formatValue(val) : '—'}
                  </span>
                  {formatDenominator && typeof denom === 'number' && denom > 0 ? (
                    <span className="font-mono text-[0.65rem] text-[var(--color-text-soft)]">
                      ({formatDenominator(denom)})
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* SVG line canvas with pinned Y-axis + optional horizontal scroll */}
      <div className="flex flex-1 min-h-0 gap-2">
        <div
          aria-hidden="true"
          className={`flex h-full min-h-[165px] w-11 shrink-0 flex-col justify-between pt-0 text-right font-mono text-[0.65rem] leading-none tabular-nums text-[var(--color-text-soft)] ${
            shouldScroll ? 'pb-[30px]' : 'pb-[22px]'
          }`}
        >
          <span>{formatValue(yMax)}</span>
          <span>{formatValue(yMin + span * 0.5)}</span>
          <span>{formatValue(yMin)}</span>
        </div>

        <div
          ref={scrollRef}
          className={`flex min-w-0 flex-1 flex-col ${
            shouldScroll ? 'dashboard-subtle-scrollbar overflow-x-auto overflow-y-hidden' : ''
          }`}
        >
          <div
            className={`flex flex-1 min-h-0 flex-col ${shouldScroll ? 'px-1.5 pb-2' : ''}`}
            style={minTrackWidth ? { minWidth: `${minTrackWidth}px` } : undefined}
          >
            <div className="relative flex-1 min-h-[150px]">
              <svg
                viewBox={`0 0 ${svgWidth} ${SVG_HEIGHT}`}
                preserveAspectRatio="none"
                className="h-full w-full overflow-visible"
              >
                {[yMin, yMin + span * 0.5, yMax].map((tickVal, idx) => {
                  const y = yForValue(tickVal);
                  return (
                    <line
                      key={idx}
                      x1={PAD_LEFT}
                      x2={svgWidth - PAD_RIGHT}
                      y1={y}
                      y2={y}
                      stroke="var(--chart-grid, rgba(120,120,120,0.12))"
                      strokeDasharray={idx === 0 ? undefined : '4 4'}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}

                {activeCol >= 0 ? (
                  <line
                    x1={xForIndex(activeCol)}
                    x2={xForIndex(activeCol)}
                    y1={PAD_TOP}
                    y2={SVG_HEIGHT - PAD_BOTTOM}
                    stroke="var(--color-border-strong)"
                    strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}

                {visibleSeries.map((item) => {
                  const coords = item.values.map((val, idx) => {
                    if (val === null || !Number.isFinite(val)) return null;
                    return { x: xForIndex(idx), y: yForValue(val), value: val };
                  });
                  const segments = buildContinuousSegments(coords);
                  const singleDots = coords.filter((pt, idx) => {
                    if (!pt) return false;
                    const prevNull = idx === 0 || coords[idx - 1] === null;
                    const nextNull = idx === coords.length - 1 || coords[idx + 1] === null;
                    return prevNull && nextNull;
                  });

                  return (
                    <g key={item.id}>
                      {showArea && visibleSeries.length === 1 && segments.length === 1 && coords.length > 1 ? (
                        (() => {
                          const valid = coords.filter((pt): pt is NonNullable<typeof pt> => pt !== null);
                          if (valid.length < 2) return null;
                          const first = valid[0];
                          const last = valid[valid.length - 1];
                          const baselineY = yForValue(yMin);
                          const areaPath = `${segments[0]} L ${last.x.toFixed(1)} ${baselineY.toFixed(1)} L ${first.x.toFixed(1)} ${baselineY.toFixed(1)} Z`;
                          return (
                            <path
                              d={areaPath}
                              fill={item.color}
                              fillOpacity={0.1}
                            />
                          );
                        })()
                      ) : null}
                      {segments.map((d, segIdx) => (
                        <path
                          key={segIdx}
                          d={d}
                          fill="none"
                          stroke={item.color}
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}
                      {singleDots.map((pt, dotIdx) =>
                        pt ? (
                          <circle
                            key={dotIdx}
                            cx={pt.x}
                            cy={pt.y}
                            r={3.5}
                            fill={item.color}
                            vectorEffect="non-scaling-stroke"
                          />
                        ) : null,
                      )}
                      {coords[activeCol] ? (
                        <circle
                          cx={coords[activeCol]!.x}
                          cy={coords[activeCol]!.y}
                          r={4}
                          fill={item.color}
                          stroke="var(--color-surface-card, var(--color-bg))"
                          strokeWidth={2}
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : null}
                    </g>
                  );
                })}

                {xAxis.map((axisItem, idx) => {
                  const colWidth = plotW / Math.max(1, xAxis.length);
                  const xStart =
                    xAxis.length === 1
                      ? PAD_LEFT
                      : xForIndex(idx) - colWidth / 2;
                  return (
                    <rect
                      key={axisItem.key}
                      x={Math.max(0, xStart)}
                      y={0}
                      width={colWidth}
                      height={SVG_HEIGHT}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHovered(idx)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => setHovered(idx)}
                    />
                  );
                })}
              </svg>
            </div>

            <div className="mt-1.5 flex h-4 shrink-0 items-center justify-between gap-1">
              {xAxis.map((axisItem, idx) => {
                const showTick =
                  idx === 0 || idx === xAxis.length - 1 || idx % tickStep === 0;
                return (
                  <div
                    key={axisItem.key}
                    className="min-w-0 flex-1 text-center font-mono text-[0.62rem] tabular-nums text-[var(--color-text-soft)]"
                  >
                    {showTick ? (
                      <span className="inline-block max-w-full truncate">
                        {axisItem.label}
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
  );
}
