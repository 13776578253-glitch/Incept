'use client';

import { useEffect, useId, useRef, useState } from 'react';

export type MusicMultiSelectOption = {
  value: string;
  label: string;
  // 不可选项照样显示
  disabled?: boolean;
  title?: string;
};

// 归属用的多选下拉：按钮显示当前归属，展开后逐项勾选
export function MusicMultiSelect({
  values,
  options,
  ariaLabel,
  placeholder,
  disabled = false,
  onToggle,
  className = '',
  buttonClassName = '',
}: {
  values: string[];
  options: MusicMultiSelectOption[];
  ariaLabel: string;
  placeholder: string;
  disabled?: boolean;
  onToggle: (value: string) => void;
  className?: string;
  buttonClassName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const selectedLabels = options
    .filter((option) => values.includes(option.value))
    .map((option) => option.label);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      buttonRef.current?.focus();
    };

    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        className={`group inline-flex w-full items-center justify-between gap-2 rounded-full px-2.5 outline-none transition-all focus:outline-none disabled:cursor-default disabled:opacity-50 ${
          isOpen
            ? 'bg-[var(--color-bg)] font-medium text-[var(--color-text)] shadow-[var(--shadow-card-sm)]'
            : 'bg-transparent text-[var(--color-nav-dropdown-description)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] hover:shadow-[var(--shadow-card-sm)]'
        } ${buttonClassName}`}
      >
        <span className="min-w-0 truncate">
          {selectedLabels.length > 0 ? selectedLabels.join(', ') : placeholder}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={`size-3 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[var(--color-text)]' : 'text-[var(--color-nav-muted)] group-hover:text-[var(--color-text)]'
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          aria-multiselectable="true"
          className="absolute left-0 z-30 mt-1.5 min-w-full space-y-0.5 overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg)] p-1.5 shadow-[var(--shadow-nav-dropdown)] backdrop-blur-md"
        >
          {options.map((option) => {
            const isSelected = values.includes(option.value);

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                title={option.title}
                // 展开状态保持
                onClick={() => onToggle(option.value)}
                className={`flex w-full items-center gap-2 rounded-[9px] px-2.5 py-1.5 text-left text-[0.78rem] leading-none whitespace-nowrap transition-colors disabled:cursor-default ${
                  isSelected
                    ? 'bg-[var(--color-pill-active-bg)] font-medium text-[var(--color-text)] shadow-[var(--shadow-pill-active)]'
                    : 'text-[var(--color-nav-dropdown-description)] disabled:opacity-50'
                } ${
                  option.disabled
                    ? ''
                    : isSelected
                      ? 'hover:bg-[color:var(--color-row-hover-bg)]'
                      : 'hover:bg-[color:var(--color-row-hover-bg)] hover:text-[var(--color-text)]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex w-3.5 shrink-0 items-center justify-center text-[0.75rem]"
                  style={{ color: isSelected ? 'var(--badge-sky-icon)' : undefined }}
                >
                  {isSelected ? '✓' : ''}
                </span>
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
