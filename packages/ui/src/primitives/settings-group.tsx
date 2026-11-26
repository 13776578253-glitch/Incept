import type { ReactNode } from 'react';
import { cx } from './cx';

export type SettingsGroupSurface = 'flat' | 'card';

export type SettingsGroupProps = {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  surface?: SettingsGroupSurface;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

/**
 * Quiet section title paired with an open hairline divider list (flat) or bordered card.
 */
export function SettingsGroup({
  title,
  description,
  action,
  surface = 'flat',
  children,
  className,
  bodyClassName,
}: SettingsGroupProps) {
  return (
    <section className={cx('space-y-3', className)}>
      {title || description || action ? (
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="space-y-0.5">
            {title ? (
              <h3 className="text-[length:var(--text-sm)] font-semibold tracking-[-0.01em] text-[var(--color-text)]">
                {title}
              </h3>
            ) : null}
            {description ? (
              <p className="text-[length:var(--text-xs)] leading-5 text-[var(--color-text-muted)]">
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}

      <div
        data-surface={surface}
        className={cx(
          surface === 'card'
            ? 'rounded-[var(--radius-card,14px)] border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] [&>*:not(:last-child)]:border-b [&>*:not(:last-child)]:border-[var(--color-border-faint)]'
            : 'border-t border-[var(--color-border-faint)] [&>*:not(:last-child)]:border-b [&>*:not(:last-child)]:border-[var(--color-border-faint)]',
          bodyClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
