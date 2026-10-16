'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

export type DocsCategoryFilter = 'all' | 'collection' | 'singleArticle';
export type DocsViewMode = 'grid' | 'list';

type DocsHomeToolbarProps = {
  categoryFilter: DocsCategoryFilter;
  onCategoryChange: (category: DocsCategoryFilter) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  viewMode: DocsViewMode;
  onViewModeChange: (mode: DocsViewMode) => void;
  totalVisible: number;
};

export function DocsHomeToolbar({
  categoryFilter,
  onCategoryChange,
  searchValue,
  onSearchChange,
  viewMode,
  onViewModeChange,
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
      {/* Category pills */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Filter documentation by type"
          className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-row-bg)] p-1 shadow-[var(--shadow-card-sm)]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={categoryFilter === 'all'}
            onClick={() => onCategoryChange('all')}
            className={`rounded-full px-3.5 py-1.5 text-[0.76rem] font-medium transition-all ${
              categoryFilter === 'all'
                ? 'bg-[var(--color-pill-active-bg)] text-[var(--color-text)] shadow-[var(--shadow-pill-active)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {t('home.filter.all')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={categoryFilter === 'collection'}
            onClick={() => onCategoryChange('collection')}
            className={`rounded-full px-3.5 py-1.5 text-[0.76rem] font-medium transition-all ${
              categoryFilter === 'collection'
                ? 'bg-[var(--color-pill-active-bg)] text-[var(--color-text)] shadow-[var(--shadow-pill-active)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {t('home.filter.collections')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={categoryFilter === 'singleArticle'}
            onClick={() => onCategoryChange('singleArticle')}
            className={`rounded-full px-3.5 py-1.5 text-[0.76rem] font-medium transition-all ${
              categoryFilter === 'singleArticle'
                ? 'bg-[var(--color-pill-active-bg)] text-[var(--color-text)] shadow-[var(--shadow-pill-active)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {t('home.filter.standalone')}
          </button>
        </div>

        <span className="hidden font-mono text-[0.72rem] tabular-nums text-[var(--color-nav-muted)] sm:inline-block">
          {t('groups.entries', { count: totalVisible })}
        </span>
      </div>

      {/* Search and View Switcher */}
      <div className="flex items-center gap-2.5">
        {/* Search Input */}
        <div className="relative flex-1 md:w-72">
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-nav-muted)]"
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
            className="h-9 w-full rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-card)] pl-9 pr-9 text-[0.8125rem] text-[var(--color-text)] placeholder:text-[var(--color-nav-muted)] shadow-[var(--shadow-card-sm)] transition-colors focus:border-[var(--color-text-soft)] focus:outline-none"
          />

          {searchValue ? (
            <button
              type="button"
              aria-label={t('home.filter.clearSearch')}
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded-full text-[var(--color-nav-muted)] hover:text-[var(--color-text)]"
            >
              ×
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-[var(--color-border)] bg-[var(--color-row-bg)] px-1.5 py-0.5 font-mono text-[0.62rem] text-[var(--color-nav-muted)] sm:inline-block">
              /
            </kbd>
          )}
        </div>

        {/* View Mode Toggle */}
        <div
          role="group"
          aria-label="View layout switch"
          className="inline-flex shrink-0 items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-row-bg)] p-0.5 shadow-[var(--shadow-card-sm)]"
        >
          <button
            type="button"
            aria-label={t('home.filter.viewGrid')}
            aria-pressed={viewMode === 'grid'}
            onClick={() => onViewModeChange('grid')}
            className={`rounded-md p-1.5 transition-colors ${
              viewMode === 'grid'
                ? 'bg-[var(--color-pill-active-bg)] text-[var(--color-text)] shadow-[var(--shadow-pill-active)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="2" y="2" width="5" height="5" rx="1" />
              <rect x="9" y="2" width="5" height="5" rx="1" />
              <rect x="2" y="9" width="5" height="5" rx="1" />
              <rect x="9" y="9" width="5" height="5" rx="1" />
            </svg>
          </button>
          <button
            type="button"
            aria-label={t('home.filter.viewList')}
            aria-pressed={viewMode === 'list'}
            onClick={() => onViewModeChange('list')}
            className={`rounded-md p-1.5 transition-colors ${
              viewMode === 'list'
                ? 'bg-[var(--color-pill-active-bg)] text-[var(--color-text)] shadow-[var(--shadow-pill-active)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M2.5 4h11M2.5 8h11M2.5 12h11" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
