'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

export type DocsCategoryFilter = 'all' | 'collection' | 'singleArticle';

type DocsHomeToolbarProps = {
  categoryFilter: DocsCategoryFilter;
  onCategoryChange: (category: DocsCategoryFilter) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  totalVisible: number;
};

export function DocsHomeToolbar({
  categoryFilter,
  onCategoryChange,
  searchValue,
  onSearchChange,
  totalVisible,
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
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      {/* Category capsule filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Filter documentation by type"
          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--roadmap-lane-bg,var(--color-row-bg))] p-1 shadow-[var(--shadow-card-sm)]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={categoryFilter === 'all'}
            onClick={() => onCategoryChange('all')}
            className={`rounded-full px-3.5 py-1 text-[0.8rem] font-medium transition-all ${
              categoryFilter === 'all'
                ? 'border border-[var(--color-border)] bg-[var(--color-pill-active-bg)] text-[var(--color-text)] shadow-[var(--shadow-pill-active)]'
                : 'border border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {t('home.filter.all')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={categoryFilter === 'collection'}
            onClick={() => onCategoryChange('collection')}
            className={`rounded-full px-3.5 py-1 text-[0.8rem] font-medium transition-all ${
              categoryFilter === 'collection'
                ? 'border border-[var(--color-border)] bg-[var(--color-pill-active-bg)] text-[var(--color-text)] shadow-[var(--shadow-pill-active)]'
                : 'border border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {t('home.filter.collections')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={categoryFilter === 'singleArticle'}
            onClick={() => onCategoryChange('singleArticle')}
            className={`rounded-full px-3.5 py-1 text-[0.8rem] font-medium transition-all ${
              categoryFilter === 'singleArticle'
                ? 'border border-[var(--color-border)] bg-[var(--color-pill-active-bg)] text-[var(--color-text)] shadow-[var(--shadow-pill-active)]'
                : 'border border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {t('home.filter.standalone')}
          </button>
        </div>

        <span className="hidden font-mono text-[0.72rem] tabular-nums text-[var(--color-nav-muted)] sm:inline-block">
          {t('groups.entries', { count: totalVisible })}
        </span>
      </div>

      {/* Real-time search box */}
      <div className="relative w-full md:w-72 lg:w-80">
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
