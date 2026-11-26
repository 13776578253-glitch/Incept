'use client';

import type { ReactNode } from 'react';
import { cx } from './cx';

export type SegmentedOption<T extends string = string> = {
  id: T;
  label: string;
  icon?: ReactNode;
  ariaLabel?: string;
};

export type SegmentedControlProps<T extends string = string> = {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T | '';
  onValueChange: (value: T) => void;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Recessed pill group with an elevated active segment.
 */
export function SegmentedControl<T extends string = string>({
  options,
  value,
  onValueChange,
  ariaLabel,
  disabled = false,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cx(
        'inline-flex flex-wrap items-center gap-0.5 rounded-[var(--radius-md,10px)] border border-[var(--color-border-subtle)] bg-[var(--surface-recessed-bg)] p-0.5',
        disabled && 'opacity-50',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.id === value;

        return (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            aria-label={option.ariaLabel}
            aria-pressed={active}
            onClick={() => onValueChange(option.id)}
            className={cx(
              'inline-flex min-h-7 cursor-pointer items-center gap-1.5 rounded-[8px] px-2.5 py-1 text-[length:var(--text-xs)] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] disabled:cursor-not-allowed',
              active
                ? 'border border-[var(--color-pill-active-border)] bg-[var(--color-pill-active-bg)] font-medium text-[var(--color-text)] shadow-[var(--shadow-pill-active)]'
                : 'border border-transparent text-[var(--color-text-muted)] hover:not-disabled:text-[var(--color-text)]',
            )}
          >
            {option.icon ? (
              <span aria-hidden="true" className="inline-flex shrink-0 items-center">
                {option.icon}
              </span>
            ) : null}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
