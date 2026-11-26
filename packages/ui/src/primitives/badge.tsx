import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export type BadgeTone = 'neutral' | 'accent' | 'sky' | 'indigo' | 'emerald' | 'amber' | 'rose';

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
};

const TONE_STYLES: Record<BadgeTone, { color: string; backgroundColor: string; borderColor: string; dotColor: string }> = {
  neutral: {
    color: 'var(--color-text-muted)',
    backgroundColor: 'var(--surface-chip-bg)',
    borderColor: 'var(--surface-chip-border)',
    dotColor: 'var(--color-nav-muted)',
  },
  accent: {
    color: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-soft)',
    borderColor: 'var(--color-accent-border)',
    dotColor: 'var(--color-accent)',
  },
  sky: {
    color: 'var(--badge-sky-fg)',
    backgroundColor: 'var(--badge-sky-bg)',
    borderColor: 'var(--badge-sky-border)',
    dotColor: 'var(--badge-sky-dot)',
  },
  indigo: {
    color: 'var(--badge-indigo-fg)',
    backgroundColor: 'var(--badge-indigo-bg)',
    borderColor: 'var(--badge-indigo-border)',
    dotColor: 'var(--badge-indigo-dot)',
  },
  emerald: {
    color: 'var(--badge-emerald-fg)',
    backgroundColor: 'var(--badge-emerald-bg)',
    borderColor: 'var(--badge-emerald-border)',
    dotColor: 'var(--badge-emerald-dot)',
  },
  amber: {
    color: 'var(--badge-amber-fg)',
    backgroundColor: 'var(--badge-amber-bg)',
    borderColor: 'var(--badge-amber-border)',
    dotColor: 'var(--badge-amber-dot)',
  },
  rose: {
    color: 'var(--badge-rose-fg)',
    backgroundColor: 'var(--badge-rose-bg)',
    borderColor: 'var(--badge-rose-border)',
    dotColor: 'var(--badge-rose-dot)',
  },
};

/**
 * Compact semantic status pill with optional indicator dot.
 */
export function Badge({
  tone = 'neutral',
  dot = false,
  className,
  style,
  children,
  ...props
}: BadgeProps) {
  const palette = TONE_STYLES[tone];

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[length:var(--text-2xs)] font-medium leading-4',
        className,
      )}
      style={{
        color: palette.color,
        backgroundColor: palette.backgroundColor,
        borderColor: palette.borderColor,
        ...style,
      }}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: palette.dotColor }}
        />
      ) : null}
      <span>{children}</span>
    </span>
  );
}
