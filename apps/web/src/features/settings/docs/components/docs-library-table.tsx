'use client';

import { useDeferredValue, useState } from 'react';
import { NavigationLink as Link } from '@/components/layouts/navigation-link';
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
    <section id="docs-table" className="space-y-3.5 border-t border-[var(--color-border-faint)] pt-6">
      {/* 标题、结果统计与搜索筛选工具栏 */}
      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[length:var(--text-sm)] font-medium text-[var(--color-text)]">
            {t('table.title')}
          </h3>
          <span className="text-[length:var(--text-2xs)] text-[var(--color-text-soft)] tabular-nums">
            {t('table.results', { count: filteredEntries.length })}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <div className="relative min-w-[180px] flex-1">
            <input
              type="search"
              value={searchValue}
              aria-label={t('filters.searchPlaceholder')}
              placeholder={t('filters.searchPlaceholder')}
              onChange={(event) => setSearchValue(event.target.value)}
              className="h-9 w-full rounded-[10px] border border-[var(--color-border-input,var(--color-border))] bg-[var(--color-surface-card,var(--color-bg))] pl-8 pr-2.5 text-[length:var(--text-xs)] text-[var(--color-text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--color-text-soft)] focus:border-[var(--color-border-focus,var(--color-border-strong))] focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-text-soft)]"
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
            onChange={(value) => setRouteTypeFilter(value as RouteTypeFilter)}
            className="w-full sm:w-[152px] shrink-0"
          />

          <DocsSelect
            value={accessRoleFilter}
            options={accessRoleOptions}
            ariaLabel={t('filters.accessRole')}
            onChange={(value) => setAccessRoleFilter(value as AccessRoleFilter)}
            className="w-full sm:w-[144px] shrink-0"
          />
        </div>
      </div>

      {/* 紧凑现代表格 */}
      <div className="overflow-x-auto [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--color-border)] [&::-webkit-scrollbar-button]:hidden">
        <table className="w-full min-w-[680px] table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-[25%]" />
            <col className="w-[13%]" />
            <col className="w-[10%]" />
            <col className="w-[17%]" />
            <col className="w-[9%]" />
            <col className="w-[14%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--color-border-faint)] whitespace-nowrap text-[length:var(--text-2xs)] uppercase tracking-[0.06em] text-[var(--color-text-soft)]">
              <th className="py-2 pl-0 pr-2 font-medium">{t('columns.title')}</th>
              <th className="py-2 px-2 font-medium">{t('columns.type')}</th>
              <th className="py-2 px-2 font-medium">{t('columns.accessRole')}</th>
              <th className="py-2 px-2 font-medium">{t('columns.collection')}</th>
              <th className="py-2 px-1.5 text-center font-medium">{t('columns.position')}</th>
              <th className="py-2 px-2 font-medium">{t('columns.lastUpdated')}</th>
              <th className="py-2 pl-2 pr-0 text-right font-medium">{t('columns.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border-faint)]">
            {filteredEntries.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="py-8 text-center text-[length:var(--text-xs)] text-[var(--color-text-muted)]"
                >
                  {t('table.empty')}
                </td>
              </tr>
            ) : (
              filteredEntries.map((entry) => (
                <tr
                  key={`${entry.documentId}-${entry.locale}-${entry.slug}`}
                  className="transition-colors hover:bg-[color:var(--color-surface-hover)] group"
                >
                  {/* 标题与 slug */}
                  <td className="py-2.5 pl-0 pr-2 align-middle">
                    <p title={entry.title} className="truncate font-medium text-[length:var(--text-sm)] text-[var(--color-text)]">{entry.title}</p>
                    <p className="truncate font-mono text-[length:var(--text-2xs)] text-[var(--color-text-subtle)]">{entry.slug}</p>
                  </td>

                  {/* 类型：路由类型，非普通文章时补充 kind */}
                  <td className="whitespace-nowrap py-2.5 px-2 align-middle text-[length:var(--text-xs)] text-[var(--color-text-muted)]">
                    <span className="text-[var(--color-text)]">{t(`routeType.${entry.routeType}`)}</span>
                    {entry.kind !== 'article' ? (
                      <span className="text-[var(--color-text-subtle)]"> · {entry.kind}</span>
                    ) : null}
                  </td>

                  {/* 访问权限 */}
                  <td className="whitespace-nowrap py-2.5 px-2 align-middle text-[length:var(--text-xs)] text-[var(--color-text-muted)]">
                    {t(`roles.${entry.accessRole}`)}
                  </td>

                  {/* 合集 */}
                  <td className="py-2.5 px-2 align-middle text-[length:var(--text-xs)]">
                    {entry.routeType === 'collectionArticle' ? (
                      <div className="truncate">
                        <span className="truncate font-medium text-[var(--color-text)] block">
                          {entry.collectionTitle ?? t('table.unknownCollection')}
                        </span>
                        <span className="truncate font-mono text-[length:var(--text-2xs)] text-[var(--color-text-subtle)] block">
                          {entry.collectionSlug}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[var(--color-text-subtle)]">—</span>
                    )}
                  </td>

                  {/* 位置 */}
                  <td className="py-2.5 px-1.5 align-middle text-center tabular-nums text-[length:var(--text-xs)] text-[var(--color-text-muted)] font-mono">
                    {entry.position ?? <span className="text-[var(--color-text-subtle)]">—</span>}
                  </td>

                  {/* 更新日期 */}
                  <td className="py-2.5 px-2 align-middle text-[length:var(--text-xs)] tabular-nums text-[var(--color-text-muted)] whitespace-nowrap">
                    {formatDate(entry.updatedAt, locale)}
                  </td>

                  {/* 操作按钮 */}
                  <td className="whitespace-nowrap py-2.5 pl-2 pr-0 align-middle text-right">
                    <Link
                      href={entry.finalRoute}
                      target="_blank"
                      style={{ outline: 'none' }}
                      className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[length:var(--text-2xs)] font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] active:scale-95 outline-none focus:outline-none"
                      title={t('actions.openRoute')}
                    >
                      <span>{t('actions.openRoute')}</span>
                      <svg viewBox="0 0 16 16" className="size-2.5 text-[var(--color-text-soft)]" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M6 3.5h6.5v6.5M12.5 3.5l-7 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </Link>
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
