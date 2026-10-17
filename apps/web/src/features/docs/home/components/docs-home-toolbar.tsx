'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

type DocsHomeToolbarProps = {
  searchValue: string;
  onSearchChange: (value: string) => void;
};

export function DocsHomeToolbar({
  searchValue,
  onSearchChange,
}: DocsHomeToolbarProps) {
  const t = useTranslations('docs');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key === '/' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName)
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex w-full justify-center">
      {/* Centered real-time search box matching top button height (38px) */}
      <div className="relative w-full max-w-[420px] sm:max-w-[460px]">
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-nav-muted)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3 3" strokeLinecap="round" />
        </svg>

        <input
          ref={searchInputRef}
          type="search"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('home.filter.searchPlaceholder')}
          aria-label={t('home.filter.searchPlaceholder')}
          className="h-[38px] w-full rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-card)] pl-9.5 pr-9 text-[0.82rem] text-[var(--color-text)] placeholder:text-[var(--color-nav-muted)] shadow-[var(--shadow-card-sm)] transition-colors focus:border-[var(--color-text-soft)] focus:outline-none"
        />

        {searchValue ? (
          <button
            type="button"
            aria-label={t('home.filter.clearSearch')}
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-[var(--color-nav-muted)] hover:text-[var(--color-text)]"
          >
            ×
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-[var(--color-border)] bg-[var(--color-row-bg)] px-1.5 py-0.5 font-mono text-[0.62rem] text-[var(--color-nav-muted)] sm:inline-block">
            /
          </kbd>
        )}
      </div>
    </div>
  );
}
