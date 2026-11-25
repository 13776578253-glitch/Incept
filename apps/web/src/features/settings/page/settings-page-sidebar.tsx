'use client';

import {
  BarChart3,
  FileText,
  Globe,
  LayoutGrid,
  Music,
  Palette,
  Search,
  SlidersHorizontal,
  UserRound,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/hooks/use-language';
import {
  dispatchSettingsNavigate,
  searchSettingsItems,
  type SettingsSearchItem,
} from '../shared/settings-search-index';
import { getSettingsPageData } from '../shared/settings-schema';
import type { SettingsSection } from '../shared/settings-types';

type SidebarGroup = {
  id: string;
  label: { zh: string; en: string };
  sectionIds: string[];
};

const SIDEBAR_GROUPS: readonly SidebarGroup[] = [
  {
    id: 'preferences',
    label: { zh: '偏好设置', en: 'Preferences' },
    sectionIds: ['appearance', 'language', 'dashboard', 'music'],
  },
  {
    id: 'account',
    label: { zh: '账号与权限', en: 'Account' },
    sectionIds: ['account'],
  },
  {
    id: 'admin',
    label: { zh: '站点管理', en: 'Administration' },
    sectionIds: ['docs', 'projects'],
  },
];

function SectionIcon({ id, active }: { id: string; active: boolean }) {
  const className = `size-4 shrink-0 transition-colors ${
    active
      ? 'text-[var(--color-text)]'
      : 'text-[var(--color-nav-muted)] group-hover:text-[var(--color-text)]'
  }`;

  switch (id) {
    case 'appearance':
      return <Palette aria-hidden="true" className={className} strokeWidth={1.75} />;
    case 'language':
      return <Globe aria-hidden="true" className={className} strokeWidth={1.75} />;
    case 'dashboard':
      return <BarChart3 aria-hidden="true" className={className} strokeWidth={1.75} />;
    case 'account':
      return <UserRound aria-hidden="true" className={className} strokeWidth={1.75} />;
    case 'docs':
      return <FileText aria-hidden="true" className={className} strokeWidth={1.75} />;
    case 'projects':
      return <LayoutGrid aria-hidden="true" className={className} strokeWidth={1.75} />;
    case 'music':
      return <Music aria-hidden="true" className={className} strokeWidth={1.75} />;
    default:
      return <SlidersHorizontal aria-hidden="true" className={className} strokeWidth={1.75} />;
  }
}

function buildSectionHref(
  pathname: string,
  searchParams: URLSearchParams,
  sectionId: string,
  tabId?: string,
) {
  const nextSearchParams = new URLSearchParams(searchParams.toString());
  nextSearchParams.set('section', sectionId);
  if (tabId) {
    nextSearchParams.set('tab', tabId);
  } else {
    nextSearchParams.delete('tab');
  }
  return `${pathname}?${nextSearchParams.toString()}`;
}

function resolveGroupedSections(sections: SettingsSection[]) {
  const byId = new Map(sections.map((section) => [section.id, section]));
  const assigned = new Set<string>();

  const groups = SIDEBAR_GROUPS.map((group) => {
    const items = group.sectionIds
      .map((id) => byId.get(id))
      .filter((item): item is SettingsSection => Boolean(item));
    for (const item of items) {
      assigned.add(item.id);
    }
    return { ...group, items };
  }).filter((group) => group.items.length > 0);

  const extra = sections.filter((section) => !assigned.has(section.id));
  if (extra.length > 0) {
    groups.push({
      id: 'extensions',
      label: { zh: '扩展配置', en: 'Extensions' },
      sectionIds: extra.map((item) => item.id),
      items: extra,
    });
  }

  return groups;
}

function SettingsSidebar({ viewerRole }: { viewerRole: 'guest' | 'pro' | 'owner' }) {
  const { language } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const isZh = language === 'zh';

  const page = getSettingsPageData(language, viewerRole === 'owner');
  const requestedSection = searchParams.get('section');
  const activeSection = page.sections.some((section) => section.id === requestedSection)
    ? requestedSection
    : page.sections[0]?.id ?? 'appearance';
  const groups = resolveGroupedSections(page.sections);

  const searchResults = useMemo(
    () => searchSettingsItems(query, language, viewerRole),
    [query, language, viewerRole],
  );
  const isSearching = query.trim().length > 0;
  const activeIndex = searchResults.length > 0 ? Math.min(selectedIndex, searchResults.length - 1) : 0;

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      searchInputRef.current?.focus();
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const selectSearchResult = (item: SettingsSearchItem) => {
    const href = buildSectionHref(pathname, searchParams, item.sectionId, item.tabId);
    router.replace(href, { scroll: false });
    setQuery('');
    dispatchSettingsNavigate({
      sectionId: item.sectionId,
      tabId: item.tabId,
      anchorId: item.anchorId,
    });
  };

  return (
    <nav
      aria-label={isZh ? '设置分区' : 'Settings sections'}
      className="space-y-4"
    >
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-text-soft)]"
          strokeWidth={1.75}
        />
        <input
          ref={searchInputRef}
          type="search"
          value={query}
          aria-label={isZh ? '搜索设置' : 'Search settings'}
          placeholder={isZh ? '搜索设置…' : 'Search settings…'}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setQuery('');
              setSelectedIndex(0);
              searchInputRef.current?.blur();
              return;
            }
            if (!isSearching || searchResults.length === 0) {
              return;
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setSelectedIndex((activeIndex + 1) % searchResults.length);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setSelectedIndex((activeIndex - 1 + searchResults.length) % searchResults.length);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              const target = searchResults[activeIndex] ?? searchResults[0];
              if (target) {
                selectSearchResult(target);
              }
            }
          }}
          className="h-8 w-full rounded-full border border-[var(--color-border-input)] bg-[var(--color-surface-card,var(--color-bg))] pl-8.5 pr-8 text-[length:var(--text-xs)] text-[var(--color-text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--color-text-soft)] focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[var(--color-ring-focus)] [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            aria-label={isZh ? '清空搜索' : 'Clear search'}
            onClick={() => {
              setQuery('');
              searchInputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-[var(--color-text-soft)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
          >
            <X className="size-3" strokeWidth={1.8} />
          </button>
        ) : (
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute right-2.5 top-1/2 inline-flex h-4.5 min-w-4.5 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--color-border-faint)] bg-[var(--color-surface)] px-1.5 font-mono text-[10px] text-[var(--color-text-soft)]"
          >
            /
          </kbd>
        )}
      </div>

      {isSearching ? (
        <div
          role="listbox"
          aria-label={isZh ? '设置搜索结果' : 'Settings search results'}
          className="space-y-0.5"
        >
          {searchResults.length === 0 ? (
            <p className="px-2.5 py-4 text-center text-[length:var(--text-xs)] text-[var(--color-text-soft)]">
              {isZh ? '没有匹配的设置项' : 'No matching settings'}
            </p>
          ) : (
            searchResults.map((item, index) => {
              const highlighted = index === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={highlighted}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => selectSearchResult(item)}
                  className={`group flex w-full cursor-pointer items-start gap-2.5 rounded-[var(--radius-md,10px)] px-2.5 py-2 text-left transition-colors ${
                    highlighted
                      ? 'bg-[var(--color-nav-item-active)] text-[var(--color-text)]'
                      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)]'
                  }`}
                >
                  <span className="mt-0.5">
                    <SectionIcon id={item.sectionId} active={highlighted} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[length:var(--text-sm)] font-medium text-[var(--color-text)]">
                      {item.title[language]}
                    </span>
                    <span className="block truncate text-[length:var(--text-2xs)] text-[var(--color-text-soft)]">
                      {item.sectionLabel[language]}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.id} className="space-y-1">
              <p className="px-2.5 pb-0.5 text-[length:var(--text-2xs)] font-medium uppercase tracking-[0.06em] text-[var(--color-text-soft)]">
                {language === 'zh' ? group.label.zh : group.label.en}
              </p>
              <div className="space-y-0.5">
                {group.items.map((section) => {
                  const active = section.id === activeSection;

                  return (
                    <Link
                      key={section.id}
                      href={buildSectionHref(pathname, searchParams, section.id)}
                      scroll={false}
                      replace
                      aria-current={active ? 'page' : undefined}
                      className={`group flex items-center justify-between gap-2 rounded-[var(--radius-md,10px)] px-2.5 py-2 text-[length:var(--text-sm)] transition-colors ${
                        active
                          ? 'bg-[var(--color-nav-item-active)] font-medium text-[var(--color-text)]'
                          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-nav-item-hover)] hover:text-[var(--color-text)]'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <SectionIcon id={section.id} active={active} />
                        <span className="truncate">{section.label}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </nav>
  );
}

export function SettingsMobileTabs({
  sections,
  activeSectionId,
}: {
  sections: SettingsSection[];
  activeSectionId: string;
}) {
  const { language } = useLanguage();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <nav
      aria-label={language === 'zh' ? '设置分区导航' : 'Settings section tabs'}
      className="no-scrollbar -mx-1 mb-6 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 lg:hidden"
    >
      {sections.map((section) => {
        const active = section.id === activeSectionId;

        return (
          <Link
            key={section.id}
            href={buildSectionHref(pathname, searchParams, section.id)}
            scroll={false}
            replace
            aria-current={active ? 'page' : undefined}
            className={`group inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[length:var(--text-xs)] transition-colors ${
              active
                ? 'border-[var(--color-border-strong)] bg-[var(--color-nav-item-active)] font-medium text-[var(--color-text)]'
                : 'border-[var(--color-border-subtle)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            <SectionIcon id={section.id} active={active} />
            <span className="whitespace-nowrap">{section.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function SettingsPageSidebar({ viewerRole }: { viewerRole: 'guest' | 'pro' | 'owner' }) {
  return <SettingsSidebar viewerRole={viewerRole} />;
}
