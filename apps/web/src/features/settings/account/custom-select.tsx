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
        className="flex min-h-10 w-full items-center justify-between gap-3 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-bg)] pl-3.5 pr-5 text-left text-[0.8125rem] shadow-[var(--shadow-card-sm)] transition-all hover:border-[var(--color-text-soft)]/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={`truncate ${!value || currentOption?.value === '' ? 'text-[var(--color-nav-muted)]' : 'text-[var(--color-text)]'}`}>
          {currentOption?.label ?? value}
        </span>
        <svg
          viewBox="0 0 16 16"
          className={`size-3 text-[var(--color-nav-muted)] transition-transform duration-200 shrink-0 ${
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
          className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-60 overflow-y-auto rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg)] p-1.5 shadow-[var(--shadow-nav-dropdown)] backdrop-blur-md"
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
                  className={`flex w-full items-center justify-between rounded-[9px] px-3 py-2 text-left text-[0.8125rem] transition-all duration-150 ${
                    active
                      ? 'bg-[var(--color-pill-active-bg)] font-medium text-[var(--color-text)] shadow-[var(--shadow-pill-active)]'
                      : 'text-[var(--color-nav-dropdown-description)] hover:bg-[color:var(--color-row-hover-bg)] hover:text-[var(--color-text)]'
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {active && (
                    <svg
                      viewBox="0 0 16 16"
                      className="size-3.5 text-[var(--badge-sky-dot)] shrink-0 ml-2"
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
