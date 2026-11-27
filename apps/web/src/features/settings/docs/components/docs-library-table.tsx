'use client';

import { useDeferredValue, useState } from 'react';
import { NavigationLink as Link } from '@/components/layouts/navigation-link';
import { useLocale, useTranslations } from 'next-intl';
import type { DocsMetadataUpdatePayload } from '../docs-settings-panel';
import type { DocsLibraryEntryModel } from '../types';
import { DocsMetadataEditDialog, type DocsMetadataEditTarget } from './docs-metadata-edit-dialog';
import { DocsPaginationFooter } from './docs-pagination-footer';
import { DocsSelect, type DocsSelectOption } from './docs-select';

const LIBRARY_PAGE_SIZE = 8;

type DocsLibraryTableProps = {
  entries: DocsLibraryEntryModel[];
  onMetadataUpdated?: (update: DocsMetadataUpdatePayload) => void;
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

function getRowKey(entry: Pick<DocsLibraryEntryModel, 'documentId' | 'locale' | 'slug'>) {
  return `${entry.documentId}-${entry.locale}-${entry.slug}`;
}

export function DocsLibraryTable({
  entries: propEntries,
  onMetadataUpdated,
}: DocsLibraryTableProps) {
  const t = useTranslations('docs.library');
  const locale = useLocale();
  const [localEntries, setLocalEntries] = useState<DocsLibraryEntryModel[]>(propEntries);
  const [searchValue, setSearchValue] = useState('');
  const [routeTypeFilter, setRouteTypeFilter] = useState<RouteTypeFilter>('all');
  const [accessRoleFilter, setAccessRoleFilter] = useState<AccessRoleFilter>('all');
  const [page, setPage] = useState(1);
  const [editTarget, setEditTarget] = useState<DocsMetadataEditTarget | null>(null);
  const deferredSearchValue = useDeferredValue(searchValue);

  const entries = onMetadataUpdated ? propEntries : localEntries;
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

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / LIBRARY_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedEntries = filteredEntries.slice(
    (safePage - 1) * LIBRARY_PAGE_SIZE,
    safePage * LIBRARY_PAGE_SIZE,
  );

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

  function handleDialogSaved(updated: DocsMetadataUpdatePayload) {
    if (onMetadataUpdated) {
      onMetadataUpdated(updated);
      return;
    }
    if (updated.targetType === 'document') {
      setLocalEntries((current) =>
        current.map((item) => {
          if (item.documentId !== updated.documentId) return item;
          return {
            ...item,
            accessRole: updated.accessRole,
            ...(item.locale === updated.locale
              ? { title: updated.title, updatedAt: updated.updatedAt }
              : {}),
          };
        }),
      );
    }
  }

  return (
    <section id="docs-table" className="space-y-3.5 border-t border-[var(--color-border-faint)] pt-6">
      {/* 标题、结果统计与搜索筛选工具栏 */}
      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="docs-table-heading" className="text-[length:var(--text-sm)] font-medium text-[var(--color-text)]">
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
              onChange={(event) => {
                setSearchValue(event.target.value);
                setPage(1);
              }}
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
            onChange={(value) => {
              setRouteTypeFilter(value as RouteTypeFilter);
              setPage(1);
            }}
            className="w-full sm:w-[152px] shrink-0"
          />

          <DocsSelect
            value={accessRoleFilter}
            options={accessRoleOptions}
            ariaLabel={t('filters.accessRole')}
            onChange={(value) => {
              setAccessRoleFilter(value as AccessRoleFilter);
              setPage(1);
            }}
            className="w-full sm:w-[144px] shrink-0"
          />
        </div>
      </div>

      {/* 紧凑现代表格 */}
      <div
        tabIndex={0}
        role="region"
        aria-labelledby="docs-table-heading"
        className={`overflow-x-auto [overflow-anchor:none] [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--color-border)] [&::-webkit-scrollbar-button]:hidden ${
          totalPages > 1 ? 'min-h-[488px]' : ''
        }`}
      >
        <table className="w-full min-w-[720px] table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-[26%]" />
            <col className="w-[8%]" />
            <col className="w-[10%]" />
            <col className="w-[16%]" />
            <col className="w-[7%]" />
            <col className="w-[14%]" />
            <col className="w-[19%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--color-border-faint)] whitespace-nowrap text-[length:var(--text-2xs)] uppercase tracking-[0.06em] text-[var(--color-text-soft)]">
              <th className="py-2 pl-2 pr-2 font-medium">{t('columns.title')}</th>
              <th className="py-2 px-2 font-medium">{t('columns.type')}</th>
              <th className="py-2 px-2 font-medium">{t('columns.accessRole')}</th>
              <th className="py-2 px-2 font-medium">{t('columns.collection')}</th>
              <th className="py-2 px-1.5 text-center font-medium">{t('columns.position')}</th>
              <th className="py-2 px-2 font-medium">{t('columns.lastUpdated')}</th>
              <th className="py-2 pl-2 pr-3 text-right font-medium">{t('columns.actions')}</th>
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
              paginatedEntries.map((entry) => (
                <tr
                  key={getRowKey(entry)}
                  className="transition-colors hover:bg-[color:var(--color-surface-hover)] group"
                >
                  {/* 标题与 slug */}
                  <td className="py-2.5 pl-2 pr-2 align-middle">
                    <p title={entry.title} className="truncate font-medium text-[length:var(--text-sm)] text-[var(--color-text)]">{entry.title}</p>
                    <p className="truncate font-mono text-[length:var(--text-2xs)] text-[var(--color-text-subtle)]">{entry.slug}</p>
                  </td>

                  {/* 类型：单篇 / 合集，非普通文章时补充 kind */}
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
                  <td className="whitespace-nowrap py-2.5 pl-2 pr-3 align-middle text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setEditTarget({
                            targetType: 'document',
                            targetId: entry.documentId,
                            locale: entry.locale,
                            slug: entry.slug,
                            title: entry.title,
                            accessRole: entry.accessRole,
                          })
                        }
                        className="cursor-pointer rounded-[6px] px-1.5 py-1 text-[length:var(--text-2xs)] font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] active:scale-95"
                      >
                        {t('actions.edit')}
                      </button>
                      <Link
                        href={entry.finalRoute}
                        target="_blank"
                        style={{ outline: 'none' }}
                        className="inline-flex items-center gap-1 rounded-[6px] px-1.5 py-1 text-[length:var(--text-2xs)] font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] active:scale-95 outline-none focus:outline-none"
                        title={t('actions.openRoute')}
                      >
                        <span>{t('actions.openRoute')}</span>
                        <svg viewBox="0 0 16 16" className="size-2.5 text-[var(--color-text-soft)]" fill="none" stroke="currentColor" strokeWidth="1.6">
                          <path d="M6 3.5h6.5v6.5M12.5 3.5l-7 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <DocsPaginationFooter
        page={safePage}
        totalPages={totalPages}
        pageSize={LIBRARY_PAGE_SIZE}
        totalItems={filteredEntries.length}
        onPageChange={setPage}
      />

      {editTarget ? (
        <DocsMetadataEditDialog
          key={`${editTarget.targetType}:${editTarget.targetId}:${editTarget.locale}`}
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={handleDialogSaved}
        />
      ) : null}
    </section>
  );
}
