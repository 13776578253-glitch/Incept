import type { ReactNode } from 'react';
import { cx } from './cx';

export type SettingsRowProps = {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  hint?: ReactNode;
  control?: ReactNode;
  stacked?: boolean;
  className?: string;
};

/**
 * Individual setting row inside a SettingsGroup (flat hairline or card surface).
 */
export function SettingsRow({
  id,
  title,
  description,
  hint,
  control,
  stacked = false,
  className,
}: SettingsRowProps) {
  return (
    <div
      id={id}
      className={cx(
        'py-4 [[data-surface=card]_&]:px-4 [[data-surface=card]_&]:py-3.5 sm:[[data-surface=card]_&]:px-5',
        stacked
          ? 'space-y-3'
          : 'grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-6',
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="text-[length:var(--text-base)] font-medium leading-5 text-[var(--color-text)]">
          {title}
        </div>
        {description ? (
          <p className="max-w-2xl text-[length:var(--text-sm)] leading-relaxed text-[var(--color-text-muted)]">
            {description}
          </p>
        ) : null}
        {hint ? (
          <p className="text-[length:var(--text-xs)] leading-5 text-[var(--color-text-soft)]">
            {hint}
          </p>
        ) : null}
      </div>

      {control ? (
        <div className={cx('min-w-0', !stacked && 'md:justify-self-end')}>
          {control}
        </div>
      ) : null}
    </div>
  );
}
