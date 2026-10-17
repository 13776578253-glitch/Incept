'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DocsHomeCard } from '@/features/docs/home/components/docs-home-card';
import { DocsHomeEmpty } from '@/features/docs/home/components/docs-home-empty';
import { DocsHomeStats } from '@/features/docs/home/components/docs-home-stats';
import {
  DocsHomeToolbar,
  type DocsCategoryFilter,
} from '@/features/docs/home/components/docs-home-toolbar';
import type {
  DocsHomeArticleItemModel,
  DocsHomePageModel,
} from '@/features/docs/shared/types';

function matchesSearch(entry: DocsHomeArticleItemModel, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    entry.title.toLowerCase().includes(q) ||
    entry.summary.toLowerCase().includes(q) ||
    (entry.eyebrow ? entry.eyebrow.toLowerCase().includes(q) : false) ||
    (entry.tags ? entry.tags.some((tag) => tag.toLowerCase().includes(q)) : false) ||
    entry.slug.toLowerCase().includes(q)
  );
}

function matchesCategory(
  entry: DocsHomeArticleItemModel,
  category: DocsCategoryFilter,
): boolean {
  if (category === 'all') return true;
  return entry.entryType === category;
}

type DocsHomeFeatureProps = {
  page: DocsHomePageModel;
};

export function DocsHomeFeature({ page }: DocsHomeFeatureProps) {
  const t = useTranslations('docs');
  const [categoryFilter, setCategoryFilter] = useState<DocsCategoryFilter>('all');
  const [searchValue, setSearchValue] = useState('');

  const deferredSearch = useDeferredValue(searchValue);

  const filteredGroups = useMemo(() => {
    const trimmedQuery = deferredSearch.trim();

    return page.groups
      .map((group) => {
        const matchingEntries = group.entries.filter(
          (entry) =>
            matchesCategory(entry, categoryFilter) &&
            matchesSearch(entry, trimmedQuery),
        );

        return {
          ...group,
          entries: matchingEntries,
        };
      })
      .filter((group) => group.entries.length > 0);
  }, [page.groups, categoryFilter, deferredSearch]);

  const totalVisible = useMemo(() => {
    return filteredGroups.reduce((acc, group) => acc + group.entries.length, 0);
  }, [filteredGroups]);

  return (
    <div className="mx-auto w-full max-w-[1480px] px-6 pt-6 pb-20 md:pt-8 md:pb-24 lg:px-10 lg:pt-9 lg:pb-28">
      {/* Header section */}
      <header className="space-y-2 md:space-y-2.5">
        <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-[var(--color-nav-muted)]">
          {t('home.eyebrow')}
        </p>
        <h1 className="text-[2rem] font-semibold tracking-[-0.05em] text-[var(--color-text)] md:text-[2.45rem] md:leading-[1.08]">
          {t('home.title')}
        </h1>
        <p className="max-w-[46rem] text-[0.875rem] leading-relaxed text-[var(--color-text-muted)]">
          {t('home.description')}
        </p>
      </header>

      {/* KPI Stats Overview */}
      {page.stats ? (
        <div className="mt-7 md:mt-8">
          <DocsHomeStats stats={page.stats} />
        </div>
      ) : null}

      {/* Toolbar Controls */}
      <div className="mt-8 mb-6 md:mt-10 md:mb-8">
        <DocsHomeToolbar
          categoryFilter={categoryFilter}
          onCategoryChange={setCategoryFilter}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          totalVisible={totalVisible}
        />
      </div>

      {/* Content Stream (Elongated full-width rows in single sequence) */}
      <main>
        {totalVisible === 0 ? (
          <DocsHomeEmpty
            onClear={() => {
              setSearchValue('');
              setCategoryFilter('all');
            }}
          />
        ) : (
          <div className="space-y-10 md:space-y-12">
            {filteredGroups.map((group) => (
              <section key={group.id} className="space-y-3.5">
                <header className="flex items-center justify-between border-b border-[var(--color-border)] pb-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full"
                      style={{ backgroundColor: 'var(--badge-sky-dot)' }}
                    />
                    <h2 className="text-[1.05rem] font-semibold tracking-[-0.02em] text-[var(--color-text)]">
                      {group.label}
                    </h2>
                  </div>
                  <span className="font-mono text-[0.72rem] tabular-nums text-[var(--color-nav-muted)]">
                    {t('groups.entries', { count: group.entries.length })}
                  </span>
                </header>

                <div className="space-y-3">
                  {group.entries.map((entry) => (
                    <DocsHomeCard key={entry.id} article={entry} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
