'use client';

import { useEffect, useId, useRef, useState } from 'react';

export type MusicSelectOption = {
  value: string;
  label: string;
};

export function MusicSelect({
  value,
  options,
  ariaLabel,
  disabled = false,
  onChange,
  className = '',
  buttonClassName = '',
}: {
  value: string;
  options: MusicSelectOption[];
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  className?: string;
  buttonClassName?: string;
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
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            moveSelection(event.key === 'ArrowDown' ? 1 : -1);
            setIsOpen(true);
          }
        }}
        className={`inline-flex w-full items-center justify-between gap-3 rounded-[9px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] px-3 text-[var(--color-text)] outline-none transition-colors hover:bg-[var(--color-nav-item-hover)] focus-visible:ring-2 focus-visible:ring-[var(--color-text-soft)] disabled:cursor-default disabled:opacity-50 ${buttonClassName}`}
      >
        <span className="min-w-0 truncate">{selected?.label ?? ''}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 12 8"
          className={`h-[6px] w-[9px] shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path
            d="m1 1.25 5 5 5-5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.25"
          />
        </svg>
      </button>

      {isOpen ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute right-0 z-30 mt-1 min-w-full overflow-hidden rounded-[10px] border border-[var(--color-nav-dropdown-border)] bg-[var(--color-nav-dropdown-bg)] p-1 shadow-[var(--shadow-nav-dropdown)]"
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
                className={`flex w-full items-center rounded-[7px] px-2.5 py-2 text-left text-[0.8125rem] leading-none whitespace-nowrap transition-colors ${
                  isSelected
                    ? 'bg-[var(--color-nav-item-active)] text-[var(--color-text)]'
                    : 'text-[var(--color-nav-dropdown-description)] hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)]'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
