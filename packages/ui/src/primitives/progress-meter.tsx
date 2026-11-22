import type { ReactNode } from 'react';
import { cx } from './cx';

export type ProgressMeterTone = 'accent' | 'neutral' | 'emerald' | 'sky' | 'amber' | 'rose';

export type ProgressMeterSegment = {
  id: string;
  label: string;
  value: number;
  max?: number;
  tone?: ProgressMeterTone;
  valueText?: string;
};

export type ProgressMeterProps = {
  segments: ReadonlyArray<ProgressMeterSegment>;
  title?: ReactNode;
  summary?: ReactNode;
  className?: string;
};

const TONE_FILLS: Record<ProgressMeterTone, { fill: string; edge: string }> = {
  accent: {
    fill: 'var(--color-accent-fill)',
    edge: 'var(--color-accent-fill-border)',
  },
  neutral: {
    fill: 'var(--surface-chip-bg)',
    edge: 'var(--color-border)',
  },
  emerald: {
    fill: 'color-mix(in oklab, var(--badge-emerald-dot) 22%, var(--color-bg))',
    edge: 'var(--badge-emerald-border)',
  },
  sky: {
    fill: 'color-mix(in oklab, var(--badge-sky-dot) 22%, var(--color-bg))',
    edge: 'var(--badge-sky-border)',
  },
  amber: {
    fill: 'color-mix(in oklab, var(--badge-amber-dot) 22%, var(--color-bg))',
    edge: 'var(--badge-amber-border)',
  },
  rose: {
    fill: 'color-mix(in oklab, var(--badge-rose-dot) 22%, var(--color-bg))',
    edge: 'var(--badge-rose-border)',
  },
};

function clampPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (value / max) * 100));
}

/**
 * Chunky tactile segmented progress meter inspired by hatched quota bars (Fig 7).
 */
export function ProgressMeter({
  segments,
  title,
  summary,
  className,
}: ProgressMeterProps) {
  return (
    <div className={cx('space-y-2', className)}>
      {title || summary ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          {title ? (
            <div className="text-[length:var(--text-xs)] font-medium text-[var(--color-text-muted)]">
              {title}
            </div>
          ) : (
            <span />
          )}
          {summary ? (
            <div className="text-[length:var(--text-xs)] tabular-nums text-[var(--color-text-soft)]">
              {summary}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, segments.length)}, minmax(0, 1fr))`,
        }}
      >
        {segments.map((segment) => {
          const max = segment.max ?? 100;
          const clampedValue = Math.max(0, Math.min(max, segment.value));
          const percent = clampPercent(segment.value, max);
          const palette = TONE_FILLS[segment.tone ?? 'accent'];
          const isFull = percent >= 99.5;
          const isPartial = percent > 0 && !isFull;

          return (
            <div
              key={segment.id}
              role="progressbar"
              aria-label={segment.label}
              aria-valuemin={0}
              aria-valuemax={max}
              aria-valuenow={clampedValue}
              aria-valuetext={segment.valueText}
              className={cx(
                'relative flex h-8 min-w-0 items-center justify-between gap-1.5 overflow-hidden rounded-[9px] border px-2.5 transition-colors',
                isFull
                  ? 'border-solid'
                  : 'border-dashed border-[var(--color-border)]',
              )}
              style={{
                backgroundImage: 'var(--surface-hatched-bg)',
                borderColor: isFull ? palette.edge : undefined,
              }}
            >
              {percent > 0 ? (
                <span
                  aria-hidden="true"
                  className={cx(
                    'pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-300',
                    isPartial && 'border-r',
                  )}
                  style={{
                    width: `${percent}%`,
                    backgroundColor: palette.fill,
                    borderRightColor: isPartial ? palette.edge : undefined,
                  }}
                />
              ) : null}

              <span className="relative z-[1] truncate text-[length:var(--text-xs)] font-medium text-[var(--color-text)]">
                {segment.label}
              </span>
              {segment.valueText ? (
                <span
                  className={cx(
                    'relative z-[1] shrink-0 text-[length:var(--text-2xs)] font-medium tabular-nums',
                    percent > 0 ? 'text-[var(--color-text)]' : 'text-[var(--color-text-soft)]',
                  )}
                >
                  {segment.valueText}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
