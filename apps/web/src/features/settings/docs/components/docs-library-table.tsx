'use client';

import { useDeferredValue, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { DocsLibraryEntryModel } from '../types';
import { DocsSelect, type DocsSelectOption } from './docs-select';

type DocsLibraryTableProps = {
  entries: DocsLibraryEntryModel[];
};

type RouteTypeFilter = 'all' | DocsLibraryEntryModel['routeType'];
type AccessRoleFilter = 'all' | DocsLibraryEntryModel['accessRole'];

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function getEntrySearchText(entry: DocsLibraryEntryModel) {
  return [
    entry.title,
    entry.slug,
    entry.collectionTitle,
    entry.collectionSlug,
    entry.finalRoute,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function DocsLibraryTable({
  entries,
}: DocsLibraryTableProps) {
  const t = useTranslations('docs.library');
  const locale = useLocale();
  const [searchValue, setSearchValue] = useState('');
  const [routeTypeFilter, setRouteTypeFilter] = useState<RouteTypeFilter>('all');
  const [accessRoleFilter, setAccessRoleFilter] = useState<AccessRoleFilter>('all');
  const [copiedRoute, setCopiedRoute] = useState<string | null>(null);
  const deferredSearchValue = useDeferredValue(searchValue);

  const normalizedSearchValue = deferredSearchValue.trim().toLowerCase();
  const filteredEntries = entries.filter((entry) => {
    if (routeTypeFilter !== 'all' && entry.routeType !== routeTypeFilter) {
      return false;
    }

    if (accessRoleFilter !== 'all' && entry.accessRole !== accessRoleFilter) {
      return false;
    }

    if (!normalizedSearchValue) {
      return true;
    }

    return getEntrySearchText(entry).includes(normalizedSearchValue);
  });

  async function handleCopyRoute(route: string) {
    await navigator.clipboard.writeText(route);
    setCopiedRoute(route);
    window.setTimeout(() => {
      setCopiedRoute((currentValue) => (
        currentValue === route ? null : currentValue
      ));
    }, 1800);
  }

  const routeTypeOptions: DocsSelectOption[] = [
    { value: 'all', label: `${t('filters.routeType')}: ${t('filters.all')}` },
    { value: 'singleArticle', label: t('routeType.singleArticle') },
    { value: 'collectionArticle', label: t('routeType.collectionArticle') },
  ];

  const accessRoleOptions: DocsSelectOption[] = [
    { value: 'all', label: `${t('filters.accessRole')}: ${t('filters.all')}` },
    { value: 'guest', label: t('roles.guest') },
    { value: 'pro', label: t('roles.pro') },
    { value: 'private', label: t('roles.private') },
  ];

  return (
    <section className="space-y-4 rounded-2xl bg-[color:var(--color-row-bg)] p-4 sm:p-5">
      {/* 标题与统计 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg)] text-[var(--badge-sky-icon)] shadow-[var(--shadow-card-sm)]">
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 3.5h11M2.5 8h11M2.5 12.5h6" />
            </svg>
          </span>
          <h3 className="text-[0.9375rem] font-medium text-[var(--color-text)]">
            {t('table.title')}
          </h3>
        </div>
        <span className="text-[0.72rem] text-[var(--color-nav-muted)] tabular-nums">
          {t('table.results', { count: filteredEntries.length })}
        </span>
      </div>

      {/* 现代化搜索与筛选工具栏（参照 music 与 projects） */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[13rem] flex-1">
          <input
            type="search"
            value={searchValue}
            aria-label={t('filters.searchPlaceholder')}
            placeholder={t('filters.searchPlaceholder')}
            onChange={(event) => setSearchValue(event.target.value)}
            className="min-h-9.5 w-full rounded-[12px] bg-[var(--color-bg)] pl-9 pr-3.5 text-[0.8125rem] text-[var(--color-text)] outline-none shadow-[var(--shadow-card-sm)] transition-all placeholder:text-[var(--color-nav-muted)] focus:outline-none"
          />
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
        </div>

        <DocsSelect
          value={routeTypeFilter}
          options={routeTypeOptions}
          ariaLabel={t('filters.routeType')}
          dotColor="var(--badge-indigo-dot)"
          onChange={(value) => setRouteTypeFilter(value as RouteTypeFilter)}
          className="min-w-[8.5rem]"
        />

        <DocsSelect
          value={accessRoleFilter}
          options={accessRoleOptions}
          ariaLabel={t('filters.accessRole')}
          dotColor="var(--badge-emerald-dot)"
          onChange={(value) => setAccessRoleFilter(value as AccessRoleFilter)}
          className="min-w-[8rem]"
        />
      </div>

      {/* 紧凑现代表格 */}
      <div className="overflow-x-auto pt-1 [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--color-border)] [&::-webkit-scrollbar-button]:hidden">
        <table className="w-full min-w-[1040px] table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-56" />
            <col className="w-36" />
            <col className="w-28" />
            <col className="w-36" />
            <col className="w-16" />
            <col className="w-28" />
            <col className="w-52" />
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--color-nav-dropdown-border)] text-[0.7rem] uppercase tracking-[0.08em] text-[var(--color-nav-muted)]">
              <th className="py-2.5 pl-3 pr-2 font-medium">{t('columns.title')}</th>
              <th className="py-2.5 px-2 font-medium">{t('columns.type')}</th>
              <th className="py-2.5 px-2 font-medium">{t('columns.accessRole')}</th>
              <th className="py-2.5 px-2 font-medium">{t('columns.collection')}</th>
              <th className="py-2.5 px-2 text-center font-medium">{t('columns.position')}</th>
              <th className="py-2.5 px-2 font-medium">{t('columns.lastUpdated')}</th>
              <th className="py-2.5 pl-2 pr-3 text-right font-medium">{t('columns.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-nav-dropdown-border)]">
            {filteredEntries.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="py-8 text-center text-xs text-[var(--color-nav-dropdown-description)]"
                >
                  {t('table.empty')}
                </td>
              </tr>
            ) : (
              filteredEntries.map((entry) => (
                <tr
                  key={`${entry.documentId}-${entry.locale}-${entry.slug}`}
                  className="transition-colors hover:bg-[color:var(--color-row-hover-bg)] group"
                >
                  {/* 标题与 slug */}
                  <td className="py-3 pl-3 pr-2 align-middle">
                    <p className="font-medium text-[0.82rem] text-[var(--color-text)] truncate">{entry.title}</p>
                    <p className="font-mono text-[0.7rem] text-[var(--color-text-soft)] truncate">{entry.slug}</p>
                  </td>

                  {/* 类型：路由类型，非普通文章时补充 kind */}
                  <td className="py-3 px-2 align-middle text-[0.78rem] text-[var(--color-text-muted)]">
                    <span className="text-[var(--color-text)]">{t(`routeType.${entry.routeType}`)}</span>
                    {entry.kind !== 'article' ? (
                      <span className="text-[var(--color-text-soft)]"> · {entry.kind}</span>
                    ) : null}
                  </td>

                  {/* 访问权限 */}
                  <td className="py-3 px-2 align-middle text-[0.78rem] text-[var(--color-text-muted)]">
                    {t(`roles.${entry.accessRole}`)}
                  </td>

                  {/* 合集 */}
                  <td className="py-3 px-2 align-middle text-[0.78rem]">
                    {entry.routeType === 'collectionArticle' ? (
                      <div className="truncate">
                        <span className="text-[var(--color-text)] font-medium truncate block">
                          {entry.collectionTitle ?? t('table.unknownCollection')}
                        </span>
                        <span className="font-mono text-[0.7rem] text-[var(--color-text-soft)] truncate block">
                          {entry.collectionSlug}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[var(--color-nav-muted)]">—</span>
                    )}
                  </td>

                  {/* 位置 */}
                  <td className="py-3 px-2 align-middle text-center tabular-nums text-[0.78rem] text-[var(--color-text-muted)] font-mono">
                    {entry.position ?? <span className="text-[var(--color-nav-muted)]">—</span>}
                  </td>

                  {/* 更新日期 */}
                  <td className="py-3 px-2 align-middle text-[0.74rem] tabular-nums text-[var(--color-text-soft)] whitespace-nowrap">
                    {formatDate(entry.updatedAt, locale)}
                  </td>

                  {/* 操作按钮 */}
                  <td className="py-3 pl-2 pr-3 align-middle text-right">
                    <div className="inline-flex items-center gap-1.5 justify-end whitespace-nowrap">
                      <Link
                        href={entry.finalRoute}
                        target="_blank"
                        style={{ outline: 'none' }}
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--color-bg)] px-2.5 py-1 text-[0.72rem] font-medium text-[var(--color-text)] shadow-[var(--shadow-card-sm)] transition-all hover:bg-[color:var(--color-row-hover-bg)] active:scale-95 outline-none focus:outline-none"
                        title={t('actions.openRoute')}
                      >
                        <span>{t('actions.openRoute')}</span>
                        <svg viewBox="0 0 16 16" className="size-3 text-[var(--color-nav-muted)]" fill="none" stroke="currentColor" strokeWidth="1.6">
                          <path d="M6 3.5h6.5v6.5M12.5 3.5l-7 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handleCopyRoute(entry.finalRoute)}
                        style={{ outline: 'none' }}
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--color-bg)] px-2.5 py-1 text-[0.72rem] font-medium text-[var(--color-text-muted)] shadow-[var(--shadow-card-sm)] transition-all hover:text-[var(--color-text)] hover:bg-[color:var(--color-row-hover-bg)] active:scale-95 outline-none focus:outline-none"
                        title={t('actions.copyRoute')}
                      >
                        {copiedRoute === entry.finalRoute ? (
                          <>
                            <span className="size-1.5 rounded-full bg-[var(--badge-emerald-dot)]" />
                            <span className="text-[var(--badge-emerald-fg)] font-medium">{t('actions.copied')}</span>
                          </>
                        ) : (
                          <span>{t('actions.copyRoute')}</span>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
