'use client';

import { useEffect, useId, useRef, useState } from 'react';

export type DocsSelectOption = {
  value: string;
  label: string;
};

export function DocsSelect({
  value,
  options,
  ariaLabel,
  dotColor,
  onChange,
  className = '',
}: {
  value: string;
  options: DocsSelectOption[];
  ariaLabel: string;
  dotColor?: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options[selectedIndex];

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

  const moveSelection = (direction: -1 | 1) => {
    if (options.length === 0) return;
    const nextIndex = (selectedIndex + direction + options.length) % options.length;
    onChange(options[nextIndex].value);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            moveSelection(event.key === 'ArrowDown' ? 1 : -1);
            setIsOpen(true);
          }
        }}
        style={{ outline: 'none' }}
        className="inline-flex min-h-9 w-full cursor-pointer items-center justify-between gap-2.5 rounded-[10px] border border-[var(--color-border-input,var(--color-border))] bg-[var(--color-surface-card,var(--color-bg))] px-3 text-[length:var(--text-xs)] text-[var(--color-text)] outline-none transition-all hover:border-[var(--color-border-strong)] focus:border-[var(--color-border-focus,var(--color-border-strong))] focus:outline-none"
      >
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
          {dotColor ? (
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: dotColor }}
            />
          ) : null}
          <span className="truncate">{selected?.label ?? ''}</span>
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={`size-3 shrink-0 text-[var(--color-text-subtle)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
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
          className="absolute left-0 sm:left-auto sm:right-0 z-30 mt-1.5 min-w-[10rem] space-y-0.5 overflow-hidden rounded-[12px] border border-[var(--color-border-subtle,var(--color-border))] bg-[var(--color-popover-bg,var(--color-surface-card,var(--color-bg)))] p-1 shadow-[var(--shadow-nav-dropdown)] backdrop-blur-xl"
        >
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                  buttonRef.current?.focus();
                }}
                style={{ outline: 'none' }}
                className={`flex w-full items-center justify-between gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-[length:var(--text-xs)] leading-none whitespace-nowrap transition-colors outline-none focus:outline-none cursor-pointer ${
                  isSelected
                    ? 'bg-[var(--surface-pill-on-bg,var(--color-surface-hover))] font-medium text-[var(--color-text)]'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
                }`}
              >
                <span>{option.label}</span>
                {isSelected && (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    className="size-3 shrink-0 text-[var(--color-text)]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
