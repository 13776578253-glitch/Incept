'use client';

import { useDeferredValue, useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { DocsHomeAddCard } from '@/features/docs/home/components/docs-home-add-card';
import { DocsHomeCard } from '@/features/docs/home/components/docs-home-card';
import { DocsHomeCurationToggle } from '@/features/docs/home/components/docs-home-curation-toggle';
import { DocsHomeEmpty } from '@/features/docs/home/components/docs-home-empty';
import { DocsHomeToolbar } from '@/features/docs/home/components/docs-home-toolbar';
import type {
  DocsHomeArticleItemModel,
  DocsHomePageModel,
} from '@/features/docs/shared/types';

const CURATED_STORAGE_KEY = 'incept-docs-home-curated';
const CURATED_CHANGE_EVENT = 'incept:docs-home-curated-change';

let memoryCuratedPreference: boolean | null = null;

function subscribeCuratedPreference(callback: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }
  const onChange = () => callback();
  window.addEventListener('storage', onChange);
  window.addEventListener(CURATED_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CURATED_CHANGE_EVENT, onChange);
  };
}

function getCuratedSnapshot(): boolean {
  try {
    return window.localStorage.getItem(CURATED_STORAGE_KEY) !== '0';
  } catch {
    return memoryCuratedPreference ?? true;
  }
}

function getCuratedServerSnapshot(): boolean {
  return true;
}

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

type DocsHomeFeatureProps = {
  page: DocsHomePageModel;
};

export function DocsHomeFeature({ page }: DocsHomeFeatureProps) {
  const t = useTranslations('docs');
  const [searchValue, setSearchValue] = useState('');
  const curatedOnly = useSyncExternalStore(
    subscribeCuratedPreference,
    getCuratedSnapshot,
    getCuratedServerSnapshot,
  );

  const deferredSearch = useDeferredValue(searchValue);

  const hasAnyEntries = useMemo(() => {
    return page.groups.some((group) => group.entries.length > 0);
  }, [page.groups]);

  const hasAnyCurated = useMemo(() => {
    return page.groups.some((group) => group.entries.some((entry) => Boolean(entry.isCurated)));
  }, [page.groups]);

  const shouldApplyCuration = curatedOnly && hasAnyCurated;

  const handleToggleCurated = () => {
    const next = !curatedOnly;
    memoryCuratedPreference = next;
    try {
      window.localStorage.setItem(CURATED_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Ignore storage write failures cleanly
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CURATED_CHANGE_EVENT));
    }
  };

  const filteredGroups = useMemo(() => {
    const trimmedQuery = deferredSearch.trim();

    return page.groups
      .map((group) => {
        const matchingEntries = group.entries.filter(
          (entry) =>
            (!shouldApplyCuration || Boolean(entry.isCurated)) &&
            matchesSearch(entry, trimmedQuery),
        );

        return {
          ...group,
          entries: matchingEntries,
        };
      })
      .filter((group) => group.entries.length > 0);
  }, [page.groups, deferredSearch, shouldApplyCuration]);

  const totalVisible = useMemo(() => {
    return filteredGroups.reduce((acc, group) => acc + group.entries.length, 0);
  }, [filteredGroups]);

  return (
    <div className="mx-auto w-full max-w-[780px] px-4 sm:px-6 pt-6 pb-20 md:pt-8 md:pb-24 lg:pt-9 lg:pb-28">
      {/* Accessible Title */}
      <h1 className="sr-only">{t('home.title')}</h1>

      {/* Centered Search Toolbar with playful sketchy curation toggle beside it */}
      <div className="relative mb-7 flex w-full items-center gap-2.5 sm:mb-8 md:mb-9 lg:mb-10 lg:block">
        <DocsHomeToolbar
          searchValue={searchValue}
          onSearchChange={setSearchValue}
        />
        {hasAnyEntries ? (
          <div className="shrink-0 lg:absolute lg:left-[calc(50%+222px)] lg:top-1/2 lg:-translate-y-1/2">
            <DocsHomeCurationToggle
              curatedOnly={curatedOnly}
              onToggle={handleToggleCurated}
            />
          </div>
        ) : null}
      </div>

      {/* Content Stream (Two-column compact vertical grid) */}
      <div>
        {totalVisible === 0 ? (
          <DocsHomeEmpty
            onClear={() => {
              if (searchValue) {
                setSearchValue('');
              } else if (curatedOnly) {
                handleToggleCurated();
              }
            }}
          />
        ) : (
          <div className="space-y-8 md:space-y-9">
            {filteredGroups.map((group, groupIndex) => (
              <section key={group.id} className="space-y-2.5">
                <header className="flex items-center justify-between border-b border-[var(--color-border-faint)] pb-2">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: 'var(--color-accent)' }}
                    />
                    <h2 className="text-[length:var(--text-base)] font-semibold tracking-[-0.015em] text-[var(--color-text)]">
                      {group.label}
                    </h2>
                  </div>
                  <span className="font-mono text-[length:var(--text-2xs)] tabular-nums text-[var(--color-nav-muted)]">
                    {t('groups.entries', { count: group.entries.length })}
                  </span>
                </header>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {groupIndex === 0 && !deferredSearch.trim() ? (
                    <DocsHomeAddCard />
                  ) : null}
                  {group.entries.map((entry) => (
                    <DocsHomeCard key={entry.id} article={entry} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
