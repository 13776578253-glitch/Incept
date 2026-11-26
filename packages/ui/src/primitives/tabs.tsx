'use client';

import { cx } from './cx';

export type UnderlineTabItem<T extends string = string> = {
  id: T;
  label: string;
  count?: number;
};

export type UnderlineTabsProps<T extends string = string> = {
  items: readonly UnderlineTabItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
};

/**
 * Minimal bottom-border tab navigation aligned with the Codex/Linear settings surface.
 */
export function UnderlineTabs<T extends string>({
  items,
  value,
  onValueChange,
  ariaLabel,
  className,
}: UnderlineTabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cx('flex items-center gap-6 border-b border-[var(--color-border-faint)]', className)}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(item.id)}
            className={cx(
              'relative -mb-px inline-flex cursor-pointer items-center gap-1.5 pb-2.5 text-[length:var(--text-sm)] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]',
              active
                ? 'text-[var(--color-text)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
            )}
          >
            <span>{item.label}</span>
            {typeof item.count === 'number' ? (
              <span className="tabular-nums text-[length:var(--text-2xs)] font-normal text-[var(--color-text-soft)]">
                {item.count}
              </span>
            ) : null}
            {active ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[var(--color-accent)]"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
