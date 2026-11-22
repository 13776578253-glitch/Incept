import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'border-transparent bg-[var(--color-primary-bg)] text-[color:var(--color-primary-fg)] shadow-[var(--shadow-card-sm)] hover:not-disabled:brightness-[1.06] active:not-disabled:scale-[0.99]',
  secondary:
    'border-[var(--color-border)] bg-[var(--color-surface-card)] text-[var(--color-text)] shadow-[var(--shadow-card-sm)] hover:not-disabled:border-[var(--color-border-strong)] hover:not-disabled:bg-[var(--color-surface-subtle)] active:not-disabled:scale-[0.99]',
  ghost:
    'border-transparent bg-transparent text-[var(--color-text-muted)] hover:not-disabled:bg-[var(--color-nav-item-hover)] hover:not-disabled:text-[var(--color-text)]',
  danger:
    'border-[var(--badge-rose-border)] bg-[var(--badge-rose-bg)] text-[var(--badge-rose-fg)] hover:not-disabled:brightness-[0.98]',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'min-h-8 gap-1.5 rounded-[var(--radius-md,10px)] px-3 text-[length:var(--text-xs)]',
  md: 'min-h-9 gap-2 rounded-[var(--radius-md,10px)] px-3.5 text-[length:var(--text-sm)]',
};

/**
 * Shared action button primitive styled with semantic design tokens.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex cursor-pointer items-center justify-center border font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
