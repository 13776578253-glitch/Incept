'use client';

import { Switch as BaseSwitch } from '@base-ui/react/switch';
import { cx } from './cx';

export type SwitchVariant = 'pill' | 'toggle';

export type SwitchProps = {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  stateLabel?: string;
  variant?: SwitchVariant;
  className?: string;
};

/**
 * Accessible toggle switch powered by Base UI with native button semantics.
 * Defaults to a single-click status-dot trigger pill (Fig 9) with a dashed inactive state (Fig 7).
 */
export function Switch({
  id,
  checked,
  onCheckedChange,
  disabled = false,
  ariaLabel,
  ariaLabelledBy,
  stateLabel,
  variant = 'pill',
  className,
}: SwitchProps) {
  if (variant === 'pill') {
    return (
      <BaseSwitch.Root
        id={id}
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        nativeButton
        render={<button type="button" />}
        onCheckedChange={(nextChecked) => onCheckedChange(nextChecked)}
        className={cx(
          'inline-flex min-h-7.5 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-[length:var(--text-xs)] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] active:not-disabled:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45',
          checked
            ? 'border-[var(--color-border-strong)] bg-[var(--surface-pill-on-bg,var(--color-surface-card))] text-[var(--color-text)] shadow-[var(--shadow-pill-active)] hover:not-disabled:bg-[var(--color-surface-subtle)]'
            : 'border-dashed border-[var(--color-border-strong)] bg-transparent text-[var(--color-text-muted)] hover:not-disabled:border-[var(--color-text-muted)] hover:not-disabled:text-[var(--color-text)]',
          className,
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            'size-1.5 shrink-0 rounded-full transition-colors',
            checked
              ? 'bg-[var(--color-accent)] shadow-[0_0_0_3px_var(--color-accent-soft)]'
              : 'bg-[var(--color-text-soft)]',
          )}
        />
        {stateLabel ? (
          <span aria-hidden={Boolean(ariaLabel)} className="whitespace-nowrap">
            {stateLabel}
          </span>
        ) : null}
      </BaseSwitch.Root>
    );
  }

  return (
    <div className={cx('inline-flex items-center gap-2.5', className)}>
      {stateLabel ? (
        <span
          aria-hidden="true"
          className={cx(
            'text-[length:var(--text-xs)] font-medium transition-colors',
            checked ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]',
            disabled && 'opacity-60',
          )}
        >
          {stateLabel}
        </span>
      ) : null}
      <BaseSwitch.Root
        id={id}
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        nativeButton
        render={<button type="button" />}
        onCheckedChange={(nextChecked) => onCheckedChange(nextChecked)}
        className={cx(
          'relative inline-flex h-6 w-10.5 shrink-0 cursor-pointer items-center rounded-full border p-0.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-50',
          checked
            ? 'border-transparent bg-[var(--color-primary-bg)]'
            : 'border-[var(--color-border-strong)] bg-[var(--surface-recessed-bg)] hover:not-disabled:border-[var(--color-text-soft)]',
        )}
      >
        <BaseSwitch.Thumb
          className={cx(
            'pointer-events-none block size-4.5 rounded-full shadow-[var(--shadow-card-sm)] transition-transform duration-150',
            checked
              ? 'translate-x-4.5 bg-[var(--color-primary-fg)]'
              : 'translate-x-0 bg-[var(--color-surface-card)]',
          )}
        />
      </BaseSwitch.Root>
    </div>
  );
}
