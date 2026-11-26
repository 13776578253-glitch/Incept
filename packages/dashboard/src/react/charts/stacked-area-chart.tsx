'use client';

import { useEffect, useRef, useState } from 'react';
import { useScrollReveal } from './use-scroll-reveal';

export type StackedAreaBucket = {
  key: string;
  label: string;
  fullLabel: string;
  totalTokens: number;
  shares: Record<string, number>;
  tokensBySeries: Record<string, number>;
};

export type StackedAreaSeries = {
  id: string;
  label: string;
  color: string;
  summaryShare: number;
  summaryTokens?: number;
};

type StackedAreaChartProps = {
  buckets: ReadonlyArray<StackedAreaBucket>;
  series: ReadonlyArray<StackedAreaSeries>;
  mode?: 'absolute' | 'share';
  hideReadoutBar?: boolean;
  onHoverIndexChange?: (index: number | null) => void;
  minColumnWidth?: number;
  formatTokens: (value: number) => string;
  emptyLabel: string;
  ariaLabel: string;
};

const SVG_HEIGHT = 200;
const PAD_X = 4;
const PAD_Y = 8;

export function StackedAreaChart({
  buckets,
  series,
  mode = 'absolute',
  hideReadoutBar = false,
  onHoverIndexChange,
  minColumnWidth,
  formatTokens,
  emptyLabel,
  ariaLabel,
}: StackedAreaChartProps) {
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const handleScrollReveal = useScrollReveal();

  const shouldScroll = Boolean(minColumnWidth && minColumnWidth > 0 && buckets.length > 0);
  const minTrackWidth = shouldScroll ? buckets.length * (minColumnWidth as number) : undefined;
  const svgWidth = Math.max(720, minTrackWidth ?? 720);

  useEffect(() => {
    if (shouldScroll && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [shouldScroll, buckets.length]);

  const setHovered = (idx: number | null) => {
    setHoveredCol(idx);
    onHoverIndexChange?.(idx);
  };

  const hasAnyTokens = buckets.some((b) => b.totalTokens > 0);
  if (buckets.length === 0 || series.length === 0 || !hasAnyTokens) {
    return (
      <div className="flex flex-1 min-h-[210px] items-center justify-center rounded-[10px] border border-dashed border-[var(--color-border-subtle)] text-[0.78rem] text-[var(--color-text-soft)]">
        {emptyLabel}
      </div>
    );
  }

  const maxTotal = Math.max(1, ...buckets.map((b) => b.totalTokens));

  const shareSamples: Array<Record<string, number>> = [];
  if (mode === 'share') {
    let lastValid: Record<string, number> | null = null;
    for (const bucket of buckets) {
      if (bucket.totalTokens > 0) {
        lastValid = bucket.shares;
        shareSamples.push(bucket.shares);
      } else if (lastValid) {
        shareSamples.push(lastValid);
      } else {
        const firstValid = buckets.find((b) => b.totalTokens > 0);
        shareSamples.push(firstValid ? firstValid.shares : bucket.shares);
      }
    }
  }

  const plotW = svgWidth - PAD_X * 2;
  const plotH = SVG_HEIGHT - PAD_Y * 2;

  const xForIndex = (idx: number) => {
    if (buckets.length === 1) return PAD_X + plotW;
    return PAD_X + (idx / (buckets.length - 1)) * plotW;
  };

  const yForRatio = (ratio: number) => {
    const clamped = Math.min(1, Math.max(0, ratio));
    return PAD_Y + (1 - clamped) * plotH;
  };

  const bandPaths = series.map((item, sIdx) => {
    const sampleCount = buckets.length === 1 ? 2 : buckets.length;
    const xs =
      buckets.length === 1
        ? [PAD_X, PAD_X + plotW]
        : buckets.map((_, idx) => xForIndex(idx));

    const bottomY: number[] = [];
    const topY: number[] = [];

    for (let i = 0; i < sampleCount; i += 1) {
      const bucketIdx = buckets.length === 1 ? 0 : i;
      if (mode === 'share') {
        const shareMap = shareSamples[bucketIdx] ?? {};
        let lower = 0;
        for (let k = 0; k < sIdx; k += 1) {
          lower += Math.max(0, shareMap[series[k].id] ?? 0);
        }
        const upper =
          sIdx === series.length - 1
            ? 1
            : Math.min(1, lower + Math.max(0, shareMap[item.id] ?? 0));
        bottomY.push(yForRatio(lower));
        topY.push(yForRatio(upper));
      } else {
        const tokenMap = buckets[bucketIdx]?.tokensBySeries ?? {};
        let lowerTokens = 0;
        for (let k = 0; k < sIdx; k += 1) {
          lowerTokens += Math.max(0, tokenMap[series[k].id] ?? 0);
        }
        const upperTokens = lowerTokens + Math.max(0, tokenMap[item.id] ?? 0);
        bottomY.push(yForRatio(lowerTokens / maxTotal));
        topY.push(yForRatio(upperTokens / maxTotal));
      }
    }

    const topPoints = xs
      .map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${topY[i].toFixed(1)}`)
      .join(' ');
    const bottomPoints = [...xs]
      .reverse()
      .map((x, revIdx) => {
        const i = xs.length - 1 - revIdx;
        return `L ${x.toFixed(1)} ${bottomY[i].toFixed(1)}`;
      })
      .join(' ');

    return {
      id: item.id,
      color: item.color,
      areaPath: `${topPoints} ${bottomPoints} Z`,
      topStrokePath: topPoints,
    };
  });

  const activeCol =
    hoveredCol !== null && hoveredCol >= 0 && hoveredCol < buckets.length
      ? hoveredCol
      : buckets.length - 1;
  const activeBucket = buckets[activeCol];

  const tickIndices =
    buckets.length <= 2
      ? buckets.map((_, i) => i)
      : shouldScroll
        ? buckets
            .map((_, i) => i)
            .filter((i) => i === 0 || i === buckets.length - 1 || i % 4 === 0)
        : [0, Math.floor((buckets.length - 1) / 2), buckets.length - 1];

  return (
    <div
      className="flex flex-1 min-h-0 flex-col justify-between gap-2"
      aria-label={ariaLabel}
      role="region"
    >
      {!hideReadoutBar ? (
        <div className="dashboard-subtle-scrollbar flex h-7 shrink-0 items-center justify-between gap-3 overflow-x-auto overflow-y-hidden whitespace-nowrap rounded-[8px] bg-[var(--surface-recessed-bg,var(--color-row-bg))] px-2.5 text-[0.72rem] tabular-nums">
          <div className="flex shrink-0 items-center gap-2">
            <span className="font-mono font-medium text-[var(--color-text)]">
              {activeBucket?.fullLabel}
            </span>
            <span className="font-mono text-[var(--color-text-muted)]">
              {formatTokens(activeBucket?.totalTokens ?? 0)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-[0.68rem]">
            {series.map((item) => {
              const tokens = activeBucket?.tokensBySeries[item.id] ?? 0;
              const share =
                activeBucket && activeBucket.totalTokens > 0
                  ? activeBucket.shares[item.id] ?? 0
                  : 0;
              return (
                <span key={item.id} className="inline-flex items-center gap-1">
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-[var(--color-text-muted)]">{item.label}</span>
                  <span className="font-mono font-medium text-[var(--color-text)]">
                    {mode === 'absolute'
                      ? formatTokens(tokens)
                      : `${(share * 100).toFixed(1)}%`}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Main stacked area canvas with pinned Y-axis + optional horizontal scroll */}
      <div className="relative flex flex-1 min-h-0 gap-2">
        <div
          aria-hidden="true"
          className={`flex h-full min-h-[160px] w-11 shrink-0 flex-col justify-between pt-0 text-right font-mono text-[0.65rem] leading-none tabular-nums text-[var(--color-text-soft)] ${
            shouldScroll ? 'pb-[30px]' : 'pb-[22px]'
          }`}
        >
          <span>{mode === 'share' ? '100%' : formatTokens(maxTotal)}</span>
          <span>{mode === 'share' ? '50%' : formatTokens(maxTotal * 0.5)}</span>
          <span>{mode === 'share' ? '0%' : '0'}</span>
        </div>

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
            <div className="relative flex-1 min-h-[150px]">
              <svg
                viewBox={`0 0 ${svgWidth} ${SVG_HEIGHT}`}
                preserveAspectRatio="none"
                className="h-full w-full overflow-hidden rounded-[6px]"
              >
                {mode === 'absolute' ? (
                  <>
                    <line
                      x1={PAD_X}
                      x2={svgWidth - PAD_X}
                      y1={yForRatio(1)}
                      y2={yForRatio(1)}
                      stroke="var(--chart-grid, rgba(120,120,120,0.12))"
                      strokeDasharray="4 4"
                      vectorEffect="non-scaling-stroke"
                    />
                    <line
                      x1={PAD_X}
                      x2={svgWidth - PAD_X}
                      y1={yForRatio(0.5)}
                      y2={yForRatio(0.5)}
                      stroke="var(--chart-grid, rgba(120,120,120,0.12))"
                      strokeDasharray="4 4"
                      vectorEffect="non-scaling-stroke"
                    />
                    <line
                      x1={PAD_X}
                      x2={svgWidth - PAD_X}
                      y1={yForRatio(0)}
                      y2={yForRatio(0)}
                      stroke="var(--color-border-subtle, rgba(120,120,120,0.18))"
                      vectorEffect="non-scaling-stroke"
                    />
                  </>
                ) : null}

                {bandPaths.map((band) => (
                  <g key={band.id}>
                    <path
                      d={band.areaPath}
                      fill={band.color}
                      fillOpacity={0.84}
                      className="transition-opacity duration-150"
                    />
                    <path
                      d={band.topStrokePath}
                      fill="none"
                      stroke="var(--color-surface-card, #ffffff)"
                      strokeOpacity={0.55}
                      strokeWidth={1.2}
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                ))}

                {buckets.length > 1 ? (
                  <line
                    x1={xForIndex(activeCol)}
                    x2={xForIndex(activeCol)}
                    y1={PAD_Y}
                    y2={SVG_HEIGHT - PAD_Y}
                    stroke={mode === 'absolute' ? 'var(--color-border-strong)' : 'var(--color-surface-card, #ffffff)'}
                    strokeOpacity={0.85}
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}

                {buckets.map((bucket, idx) => {
                  const colWidth = plotW / Math.max(1, buckets.length);
                  const xStart =
                    buckets.length === 1
                      ? PAD_X
                      : xForIndex(idx) - colWidth / 2;
                  return (
                    <rect
                      key={bucket.key}
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

            {/* X-axis anchor labels */}
            <div className="mt-1.5 flex h-4 shrink-0 items-center justify-between font-mono text-[0.65rem] tabular-nums text-[var(--color-text-soft)]">
              {tickIndices.map((idx, pos) => (
                <span key={`${idx}-${pos}`} className="truncate">
                  {buckets[idx]?.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Fixed-height single-line color-dot legend so hovering/switching buckets never jumps chart height */}
      <div
        onScroll={handleScrollReveal}
        className="dashboard-subtle-scrollbar flex h-6 shrink-0 flex-nowrap items-center gap-x-3.5 overflow-x-auto overflow-y-hidden whitespace-nowrap pl-[52px] text-[0.69rem] tabular-nums text-[var(--color-text-muted)]"
      >
        {series.map((item) => {
          const val =
            hoveredCol !== null
              ? mode === 'absolute'
                ? formatTokens(activeBucket?.tokensBySeries[item.id] ?? 0)
                : `${((activeBucket?.shares[item.id] ?? 0) * 100).toFixed(1)}%`
              : mode === 'absolute' && typeof item.summaryTokens === 'number'
                ? `${formatTokens(item.summaryTokens)} · ${(item.summaryShare * 100).toFixed(1)}%`
                : `${(item.summaryShare * 100).toFixed(1)}%`;

          return (
            <span key={item.id} className="inline-flex shrink-0 items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span>{item.label}</span>
              <span className="font-mono text-[var(--color-text)]">{val}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
