'use client';

import { useEffect, useRef, useState } from 'react';

export type SelectOption = {
  value: string;
  label: string;
};

export function CustomSelect({
  id,
  value,
  onChange,
  options,
  disabled = false,
  className = '',
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const currentOption = options.find((opt) => opt.value === value) ?? options[0];

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Accessible native select for form serialization, accessibility & automated tests */}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="sr-only"
        tabIndex={-1}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Styled trigger button */}
      <button
        ref={triggerRef}
        type="button"
        id={`${id}-trigger`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!isOpen) {
              setIsOpen(true);
            } else {
              const currentIndex = options.findIndex((opt) => opt.value === value);
              const nextIndex =
                e.key === 'ArrowDown'
                  ? (currentIndex + 1) % options.length
                  : (currentIndex - 1 + options.length) % options.length;
              onChange(options[nextIndex].value);
            }
          }
        }}
        className="flex min-h-9 w-full items-center justify-between gap-3 rounded-[10px] border border-[var(--color-border-input,var(--color-border))] bg-[var(--color-surface-card,var(--color-bg))] pl-3 pr-3.5 text-left text-[length:var(--text-xs)] transition-all hover:border-[var(--color-border-strong)] focus:border-[var(--color-border-focus,var(--color-border-strong))] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
      >
        <span className={`truncate ${!value || currentOption?.value === '' ? 'text-[var(--color-text-subtle)]' : 'text-[var(--color-text)]'}`}>
          {currentOption?.label ?? value}
        </span>
        <svg
          viewBox="0 0 16 16"
          className={`size-3 text-[var(--color-text-subtle)] transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-[var(--color-text)]' : ''
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>

      {/* Custom styled floating dropdown popover */}
      {isOpen && (
        <div
          className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-60 overflow-y-auto rounded-[12px] border border-[var(--color-border-subtle,var(--color-border))] bg-[var(--color-popover-bg,var(--color-surface-card,var(--color-bg)))] p-1 shadow-[var(--shadow-nav-dropdown)] backdrop-blur-xl"
        >
          <div className="space-y-0.5">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className={`flex w-full items-center justify-between rounded-[8px] px-2.5 py-1.5 text-left text-[length:var(--text-xs)] transition-colors cursor-pointer ${
                    active
                      ? 'bg-[var(--surface-pill-on-bg,var(--color-surface-hover))] font-medium text-[var(--color-text)]'
                      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]'
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {active && (
                    <svg
                      viewBox="0 0 16 16"
                      className="size-3.5 text-[var(--color-text)] shrink-0 ml-2"
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
        </div>
      )}
    </div>
  );
}
