'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DocsHomeCard } from '@/features/docs/home/components/docs-home-card';
import { DocsHomeEmpty } from '@/features/docs/home/components/docs-home-empty';
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
    <div className="mx-auto w-full max-w-[780px] px-4 sm:px-6 pt-6 pb-20 md:pt-8 md:pb-24 lg:pt-9 lg:pb-28">
      {/* Accessible Title */}
      <h1 className="sr-only">{t('home.title')}</h1>

      {/* Toolbar Controls */}
      <div className="mb-5 md:mb-6">
        <DocsHomeToolbar
          categoryFilter={categoryFilter}
          onCategoryChange={setCategoryFilter}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          totalVisible={totalVisible}
        />
      </div>

      {/* Content Stream (Two-column compact vertical grid) */}
      <main>
        {totalVisible === 0 ? (
          <DocsHomeEmpty
            onClear={() => {
              setSearchValue('');
              setCategoryFilter('all');
            }}
          />
        ) : (
          <div className="space-y-8 md:space-y-9">
            {filteredGroups.map((group) => (
              <section key={group.id} className="space-y-2.5">
                <header className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: 'var(--badge-sky-dot)' }}
                    />
                    <h2 className="text-[0.95rem] font-semibold tracking-[-0.015em] text-[var(--color-text)]">
                      {group.label}
                    </h2>
                  </div>
                  <span className="font-mono text-[0.7rem] tabular-nums text-[var(--color-nav-muted)]">
                    {t('groups.entries', { count: group.entries.length })}
                  </span>
                </header>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
