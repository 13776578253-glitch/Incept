'use client';

import { Select as BaseSelect } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from './cx';

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
  hint?: string;
  leading?: ReactNode;
};

export type SelectProps<T extends string = string> = {
  id?: string;
  name?: string;
  value: T;
  options: ReadonlyArray<SelectOption<T>>;
  onValueChange: (value: T) => void;
  ariaLabel?: string;
  disabled?: boolean;
  placeholder?: string;
  align?: 'start' | 'end' | 'center';
  className?: string;
};

/**
 * Viewport-aware custom select built on Base UI Select.
 */
export function Select<T extends string = string>({
  id,
  name,
  value,
  options,
  onValueChange,
  ariaLabel,
  disabled = false,
  placeholder,
  align = 'end',
  className,
}: SelectProps<T>) {
  const selectedOption = options.find((option) => option.value === value);

  return (
    <BaseSelect.Root<T>
      id={id}
      name={name}
      value={value}
      disabled={disabled}
      items={options.map((option) => ({ value: option.value, label: option.label }))}
      onValueChange={(nextValue) => {
        if (nextValue !== null) {
          onValueChange(nextValue);
        }
      }}
    >
      <BaseSelect.Trigger
        aria-label={ariaLabel}
        className={cx(
          'inline-flex min-h-8.5 min-w-[9.25rem] cursor-pointer items-center justify-between gap-2.5 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[length:var(--text-sm)] font-medium text-[var(--color-text)] transition-colors duration-150 hover:not-disabled:border-[var(--color-border-strong)] hover:not-disabled:bg-[var(--color-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <span className="inline-flex min-w-0 items-center gap-2 truncate">
          {selectedOption?.leading ? (
            <span aria-hidden="true" className="inline-flex shrink-0 items-center">
              {selectedOption.leading}
            </span>
          ) : null}
          <BaseSelect.Value placeholder={placeholder} className="truncate" />
        </span>
        <BaseSelect.Icon className="inline-flex shrink-0 text-[var(--color-text-muted)]">
          <ChevronDown className="size-3.5" strokeWidth={1.75} />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>

      <BaseSelect.Portal>
        <BaseSelect.Positioner
          side="bottom"
          align={align}
          sideOffset={6}
          alignItemWithTrigger={false}
          className="z-[var(--z-dropdown,30)] outline-none"
        >
          <BaseSelect.Popup className="max-h-72 min-w-[var(--anchor-width)] max-w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-[var(--radius-card,14px)] border border-[var(--color-border)] bg-[var(--color-popover-bg,var(--color-surface-card))] p-1 text-[var(--color-text)] shadow-[var(--shadow-nav-dropdown)] backdrop-blur-xl outline-none">
            <BaseSelect.List className="space-y-0.5">
              {options.map((option) => (
                <BaseSelect.Item
                  key={option.value}
                  value={option.value}
                  className="flex cursor-pointer select-none items-center justify-between gap-3 rounded-[9px] px-2.5 py-1.5 text-[length:var(--text-sm)] text-[var(--color-text-muted)] outline-none transition-colors data-[highlighted]:bg-[var(--color-nav-item-hover)] data-[highlighted]:text-[var(--color-text)] data-[selected]:bg-[var(--color-nav-item-active)] data-[selected]:font-medium data-[selected]:text-[var(--color-text)]"
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    {option.leading ? (
                      <span aria-hidden="true" className="inline-flex shrink-0 items-center">
                        {option.leading}
                      </span>
                    ) : null}
                    <BaseSelect.ItemText className="truncate">{option.label}</BaseSelect.ItemText>
                    {option.hint ? (
                      <span className="truncate text-[length:var(--text-2xs)] text-[var(--color-text-soft)]">
                        {option.hint}
                      </span>
                    ) : null}
                  </span>
                  <BaseSelect.ItemIndicator className="inline-flex shrink-0 text-[var(--color-text)]">
                    <Check className="size-3.5" strokeWidth={2} />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
