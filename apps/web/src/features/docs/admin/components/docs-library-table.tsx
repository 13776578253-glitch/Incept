'use client';

import { useDeferredValue, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { DocsLibraryEntryModel } from '../types';

type DocsLibraryTableProps = {
  entries: DocsLibraryEntryModel[];
};

type RouteTypeFilter = 'all' | DocsLibraryEntryModel['routeType'];
type LocaleFilter = 'all' | DocsLibraryEntryModel['locale'];
type AccessRoleFilter = 'all' | DocsLibraryEntryModel['accessRole'];

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
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
  const [searchValue, setSearchValue] = useState('');
  const [routeTypeFilter, setRouteTypeFilter] = useState<RouteTypeFilter>('all');
  const [localeFilter, setLocaleFilter] = useState<LocaleFilter>('all');
  const [accessRoleFilter, setAccessRoleFilter] = useState<AccessRoleFilter>('all');
  const [copiedRoute, setCopiedRoute] = useState<string | null>(null);
  const deferredSearchValue = useDeferredValue(searchValue);

  const normalizedSearchValue = deferredSearchValue.trim().toLowerCase();
  const filteredEntries = entries.filter((entry) => {
    if (routeTypeFilter !== 'all' && entry.routeType !== routeTypeFilter) {
      return false;
    }

    if (localeFilter !== 'all' && entry.locale !== localeFilter) {
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

  return (
    <section className="space-y-5 rounded-[1rem] border border-[color:var(--color-border-muted)] bg-[color:var(--color-surface-card)] p-5">
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-[0.74rem] uppercase tracking-[0.18em] text-[var(--color-text-soft)]">
            {t('table.eyebrow')}
          </p>
          <h2 className="text-[1.15rem] font-semibold text-[var(--color-text)]">
            {t('table.title')}
          </h2>
          <p className="text-[0.94rem] leading-7 text-[var(--color-text-muted)]">
            {t('table.description')}
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,0.7fr))]">
          <label className="space-y-2">
            <span className="text-[0.78rem] font-medium uppercase tracking-[0.14em] text-[var(--color-text-soft)]">
              {t('filters.search')}
            </span>
            <input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={t('filters.searchPlaceholder')}
              className="w-full rounded-[0.8rem] border border-[color:var(--color-border-input)] bg-[var(--color-bg)] px-3 py-2.5 text-[0.95rem] text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-soft)] focus:border-[color:var(--color-border-focus)]"
            />
          </label>

          <label className="space-y-2">
            <span className="text-[0.78rem] font-medium uppercase tracking-[0.14em] text-[var(--color-text-soft)]">
              {t('filters.routeType')}
            </span>
            <select
              value={routeTypeFilter}
              onChange={(event) => setRouteTypeFilter(event.target.value as RouteTypeFilter)}
              className="w-full rounded-[0.8rem] border border-[color:var(--color-border-input)] bg-[var(--color-bg)] px-3 py-2.5 text-[0.95rem] text-[var(--color-text)] outline-none transition-colors focus:border-[color:var(--color-border-focus)]"
            >
              <option value="all">{t('filters.all')}</option>
              <option value="singleArticle">{t('routeType.singleArticle')}</option>
              <option value="collectionArticle">{t('routeType.collectionArticle')}</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-[0.78rem] font-medium uppercase tracking-[0.14em] text-[var(--color-text-soft)]">
              {t('filters.locale')}
            </span>
            <select
              value={localeFilter}
              onChange={(event) => setLocaleFilter(event.target.value as LocaleFilter)}
              className="w-full rounded-[0.8rem] border border-[color:var(--color-border-input)] bg-[var(--color-bg)] px-3 py-2.5 text-[0.95rem] text-[var(--color-text)] outline-none transition-colors focus:border-[color:var(--color-border-focus)]"
            >
              <option value="all">{t('filters.all')}</option>
              <option value="en">en</option>
              <option value="zh">zh</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-[0.78rem] font-medium uppercase tracking-[0.14em] text-[var(--color-text-soft)]">
              {t('filters.accessRole')}
            </span>
            <select
              value={accessRoleFilter}
              onChange={(event) => setAccessRoleFilter(event.target.value as AccessRoleFilter)}
              className="w-full rounded-[0.8rem] border border-[color:var(--color-border-input)] bg-[var(--color-bg)] px-3 py-2.5 text-[0.95rem] text-[var(--color-text)] outline-none transition-colors focus:border-[color:var(--color-border-focus)]"
            >
              <option value="all">{t('filters.all')}</option>
              <option value="guest">{t('roles.guest')}</option>
              <option value="pro">{t('roles.pro')}</option>
              <option value="private">{t('roles.private')}</option>
            </select>
          </label>
        </div>

        <p className="text-[0.9rem] leading-7 text-[var(--color-text-soft)]">
          {t('table.results', { count: filteredEntries.length })}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-left">
              {[
                t('columns.title'),
                t('columns.locale'),
                t('columns.routeType'),
                t('columns.kind'),
                t('columns.accessRole'),
                t('columns.collection'),
                t('columns.position'),
                t('columns.currentRoute'),
                t('columns.lastUpdated'),
                t('columns.actions'),
              ].map((label) => (
                <th
                  key={label}
                  className="border-b border-[color:var(--color-border-table-head)] px-3 py-3 text-[0.76rem] font-medium uppercase tracking-[0.14em] text-[var(--color-text-soft)]"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-10 text-center text-[0.95rem] leading-7 text-[var(--color-text-soft)]"
                >
                  {t('table.empty')}
                </td>
              </tr>
            ) : (
              filteredEntries.map((entry) => (
                <tr key={`${entry.documentId}-${entry.locale}-${entry.slug}`}>
                  <td className="border-b border-[color:var(--color-border-faint)] px-3 py-4 align-top">
                    <div className="space-y-1">
                      <p className="font-medium text-[var(--color-text)]">{entry.title}</p>
                      <p className="text-[0.88rem] text-[var(--color-text-soft)]">{entry.slug}</p>
                    </div>
                  </td>
                  <td className="border-b border-[color:var(--color-border-faint)] px-3 py-4 align-top text-[0.92rem] text-[var(--color-text-muted)]">
                    <span className="inline-flex items-center rounded-full border border-[var(--surface-chip-border)] bg-[var(--surface-chip-bg)] px-2 py-0.5 text-[0.72rem] font-medium uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                      {entry.locale}
                    </span>
                  </td>
                  <td className="border-b border-[color:var(--color-border-faint)] px-3 py-4 align-top text-[0.92rem] text-[var(--color-text-muted)]">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.74rem] font-medium whitespace-nowrap"
                      style={
                        entry.routeType === 'collectionArticle'
                          ? {
                              color: 'var(--badge-indigo-fg)',
                              backgroundColor: 'var(--badge-indigo-bg)',
                              borderColor: 'var(--badge-indigo-border)',
                            }
                          : {
                              color: 'var(--badge-sky-fg)',
                              backgroundColor: 'var(--badge-sky-bg)',
                              borderColor: 'var(--badge-sky-border)',
                            }
                      }
                    >
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            entry.routeType === 'collectionArticle'
                              ? 'var(--badge-indigo-dot)'
                              : 'var(--badge-sky-dot)',
                        }}
                      />
                      {t(`routeType.${entry.routeType}`)}
                    </span>
                  </td>
                  <td className="border-b border-[color:var(--color-border-faint)] px-3 py-4 align-top text-[0.92rem] text-[var(--color-text-muted)]">
                    {entry.kind}
                  </td>
                  <td className="border-b border-[color:var(--color-border-faint)] px-3 py-4 align-top text-[0.92rem] text-[var(--color-text-muted)]">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.74rem] font-medium whitespace-nowrap"
                      style={
                        entry.accessRole === 'private'
                          ? {
                              color: 'var(--badge-rose-fg)',
                              backgroundColor: 'var(--badge-rose-bg)',
                              borderColor: 'var(--badge-rose-border)',
                            }
                          : entry.accessRole === 'pro'
                            ? {
                                color: 'var(--badge-amber-fg)',
                                backgroundColor: 'var(--badge-amber-bg)',
                                borderColor: 'var(--badge-amber-border)',
                              }
                            : {
                                color: 'var(--badge-emerald-fg)',
                                backgroundColor: 'var(--badge-emerald-bg)',
                                borderColor: 'var(--badge-emerald-border)',
                              }
                      }
                    >
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            entry.accessRole === 'private'
                              ? 'var(--badge-rose-dot)'
                              : entry.accessRole === 'pro'
                                ? 'var(--badge-amber-dot)'
                                : 'var(--badge-emerald-dot)',
                        }}
                      />
                      {t(`roles.${entry.accessRole}`)}
                    </span>
                  </td>
                  <td className="border-b border-[color:var(--color-border-faint)] px-3 py-4 align-top text-[0.92rem] leading-7 text-[var(--color-text-muted)]">
                    {entry.routeType === 'collectionArticle' ? (
                      <div className="space-y-1">
                        <p className="text-[var(--color-text)]">
                          {entry.collectionTitle ?? t('table.unknownCollection')}
                        </p>
                        <p className="text-[0.85rem] text-[var(--color-text-soft)]">
                          {entry.collectionSlug}
                        </p>
                      </div>
                    ) : (
                      <span className="text-[var(--color-text-soft)]">{t('table.none')}</span>
                    )}
                  </td>
                  <td className="border-b border-[color:var(--color-border-faint)] px-3 py-4 align-top text-[0.92rem] text-[var(--color-text-muted)] tabular-nums">
                    {entry.position ?? <span className="text-[var(--color-text-soft)]">{t('table.none')}</span>}
                  </td>
                  <td className="border-b border-[color:var(--color-border-faint)] px-3 py-4 align-top">
                    <code className="break-all rounded-md border border-[var(--surface-chip-border)] bg-[var(--surface-chip-bg)] px-2 py-0.5 text-[0.8rem] text-[var(--color-text-muted)]">
                      {entry.finalRoute}
                    </code>
                  </td>
                  <td className="border-b border-[color:var(--color-border-faint)] px-3 py-4 align-top text-[0.88rem] text-[var(--color-text-muted)] tabular-nums">
                    {formatDate(entry.updatedAt)}
                  </td>
                  <td className="border-b border-[color:var(--color-border-faint)] px-3 py-4 align-top">
                    <div className="flex flex-col items-start gap-1.5">
                      <Link
                        href={entry.finalRoute}
                        target="_blank"
                        className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1 text-[0.76rem] font-medium text-[var(--color-text)] shadow-[var(--shadow-card-sm)] transition-colors hover:border-[var(--color-text-soft)]"
                      >
                        {t('actions.openRoute')}
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleCopyRoute(entry.finalRoute)}
                        className="inline-flex items-center rounded-full border border-[var(--surface-chip-border)] bg-[var(--surface-chip-bg)] px-2.5 py-1 text-[0.75rem] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
                      >
                        {copiedRoute === entry.finalRoute
                          ? t('actions.copied')
                          : t('actions.copyRoute')}
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
