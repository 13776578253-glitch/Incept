'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { DocsMetadataUpdatePayload } from '../docs-settings-panel';
import type { DocsHomeCurationEntryModel } from '../types';
import { DocsPaginationFooter } from './docs-pagination-footer';
import { DocsSelect, type DocsSelectOption } from './docs-select';

const CURATION_PAGE_SIZE = 6;

type CurationFilter = 'all' | 'selected' | 'unselected';
type AccessRoleValue = DocsHomeCurationEntryModel['accessRole'];

type DocsHomeCurationPanelProps = {
  initialEntries: DocsHomeCurationEntryModel[];
  entriesOverride?: DocsHomeCurationEntryModel[];
  onCuratedChanged?: (
    entryType: DocsHomeCurationEntryModel['entryType'],
    targetId: number,
    isCurated: boolean,
  ) => void;
  onMetadataUpdated?: (update: DocsMetadataUpdatePayload) => void;
};

function getEntryKey(entry: Pick<DocsHomeCurationEntryModel, 'entryType' | 'targetId'>) {
  return `${entry.entryType}:${entry.targetId}`;
}

export function DocsHomeCurationPanel({
  initialEntries,
  entriesOverride,
  onCuratedChanged,
  onMetadataUpdated,
}: DocsHomeCurationPanelProps) {
  const t = useTranslations('docs.library');
  const [localEntries, setLocalEntries] = useState<DocsHomeCurationEntryModel[]>(initialEntries);
  const [filter, setFilter] = useState<CurationFilter>('all');
  const [searchValue, setSearchValue] = useState('');
  const [page, setPage] = useState(1);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(() => new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftRole, setDraftRole] = useState<AccessRoleValue>('private');
  const [applyToArticles, setApplyToArticles] = useState(true);
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const deferredSearchValue = useDeferredValue(searchValue);

  const entries = entriesOverride ?? localEntries;

  function setEntryCurated(entry: DocsHomeCurationEntryModel, nextCurated: boolean) {
    if (onCuratedChanged) {
      onCuratedChanged(entry.entryType, entry.targetId, nextCurated);
    } else {
      const key = getEntryKey(entry);
      setLocalEntries((current) =>
        current.map((item) =>
          getEntryKey(item) === key ? { ...item, isCurated: nextCurated } : item,
        ),
      );
    }
  }

  const editableRoleOptions: DocsSelectOption[] = [
    { value: 'guest', label: t('roles.guest') },
    { value: 'pro', label: t('roles.pro') },
    { value: 'private', label: t('roles.private') },
  ];

  const selectedCount = useMemo(
    () => entries.filter((entry) => entry.isCurated).length,
    [entries],
  );

  const visibleEntries = useMemo(() => {
    const query = deferredSearchValue.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filter === 'selected' && !entry.isCurated) {
        return false;
      }
      if (filter === 'unselected' && entry.isCurated) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        entry.title.toLowerCase().includes(query) ||
        entry.slug.toLowerCase().includes(query)
      );
    });
  }, [entries, filter, deferredSearchValue]);

  const totalPages = Math.max(1, Math.ceil(visibleEntries.length / CURATION_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedEntries = useMemo(() => {
    const offset = (safePage - 1) * CURATION_PAGE_SIZE;
    return visibleEntries.slice(offset, offset + CURATION_PAGE_SIZE);
  }, [visibleEntries, safePage]);

  async function handleToggle(entry: DocsHomeCurationEntryModel) {
    const key = getEntryKey(entry);
    if (pendingKeys.has(key)) {
      return;
    }

    const nextCurated = !entry.isCurated;
    setErrorMessage(null);
    setEntryCurated(entry, nextCurated);
    setPendingKeys((current) => {
      const next = new Set(current);
      next.add(key);
      return next;
    });

    try {
      const response = await fetch('/api/internal/docs/curation', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entryType: entry.entryType,
          targetId: entry.targetId,
          isCurated: nextCurated,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch {
      setEntryCurated(entry, entry.isCurated);
      setErrorMessage(t('curation.saveError'));
    } finally {
      setPendingKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  function startEditing(entry: DocsHomeCurationEntryModel) {
    setErrorMessage(null);
    setEditingKey(getEntryKey(entry));
    setDraftTitle(entry.title);
    setDraftRole(entry.accessRole);
    setApplyToArticles(true);
  }

  async function saveMetadata(entry: DocsHomeCurationEntryModel) {
    if (isSavingMeta) return;
    const trimmedTitle = draftTitle.trim();
    if (!trimmedTitle) {
      setErrorMessage(t('edit.titleRequired'));
      return;
    }
    const targetType = entry.entryType === 'collection' ? 'collection' : 'document';
    const primaryLocale = entry.locales[0] ?? 'zh';

    setIsSavingMeta(true);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/internal/docs/metadata', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType,
          targetId: entry.targetId,
          locale: primaryLocale,
          title: trimmedTitle,
          accessRole: draftRole,
          ...(targetType === 'collection' ? { applyToArticles } : {}),
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as {
        ok?: boolean;
        entry?: DocsMetadataUpdatePayload;
      };
      const updated: DocsMetadataUpdatePayload =
        data.entry ??
        (targetType === 'collection'
          ? {
              targetType: 'collection',
              collectionId: entry.targetId,
              locale: primaryLocale,
              title: trimmedTitle,
              accessRole: draftRole,
              updatedDocumentIds: [],
              updatedAt: new Date().toISOString(),
            }
          : {
              targetType: 'document',
              documentId: entry.targetId,
              locale: primaryLocale,
              title: trimmedTitle,
              accessRole: draftRole,
              updatedAt: new Date().toISOString(),
            });

      if (!entriesOverride) {
        setLocalEntries((current) =>
          current.map((item) =>
            getEntryKey(item) === getEntryKey(entry)
              ? { ...item, title: updated.title, accessRole: updated.accessRole }
              : item,
          ),
        );
      }
      onMetadataUpdated?.(updated);
      setEditingKey(null);
    } catch {
      setErrorMessage(t('edit.saveError'));
    } finally {
      setIsSavingMeta(false);
    }
  }

  const filterTabs: Array<{ id: CurationFilter; label: string }> = [
    { id: 'all', label: t('curation.filterAll') },
    { id: 'selected', label: t('curation.filterSelected') },
    { id: 'unselected', label: t('curation.filterUnselected') },
  ];

  return (
    <section
      id="docs-curation"
      className="space-y-3 rounded-[12px] border border-[var(--color-border-faint)] bg-[var(--color-surface-card)] p-4 sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-[length:var(--text-2xs)] font-medium uppercase tracking-[0.06em] text-[var(--color-text-soft)]">
            {t('curation.eyebrow')}
          </p>
          <div className="flex items-center gap-2.5">
            <h3 className="text-[length:var(--text-base)] font-semibold tracking-[-0.015em] text-[var(--color-text)]">
              {t('curation.title')}
            </h3>
            <span className="font-mono text-[length:var(--text-2xs)] tabular-nums text-[var(--color-text-muted)]">
              {t('curation.selectedCount', {
                selected: selectedCount,
                total: entries.length,
              })}
            </span>
          </div>
          <p className="text-[length:var(--text-xs)] leading-relaxed text-[var(--color-text-muted)]">
            {t('curation.description')}
          </p>
        </div>

        {/* Search + Filter tabs */}
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <div className="relative min-w-[160px] flex-1 sm:w-[190px] sm:flex-initial">
            <input
              type="search"
              value={searchValue}
              aria-label={t('curation.searchPlaceholder')}
              placeholder={t('curation.searchPlaceholder')}
              onChange={(event) => {
                setSearchValue(event.target.value);
                setPage(1);
              }}
              className="h-8 w-full rounded-[8px] border border-[var(--color-border-faint)] bg-[var(--color-bg)] pl-7 pr-2.5 text-[length:var(--text-xs)] text-[var(--color-text)] outline-none transition-[border-color] placeholder:text-[var(--color-text-soft)] focus:border-[var(--color-border-focus,var(--color-border-strong))] [&::-webkit-search-cancel-button]:hidden"
            />
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="pointer-events-none absolute left-2 top-1/2 size-3.25 -translate-y-1/2 text-[var(--color-text-soft)]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <circle cx="7" cy="7" r="4.5" />
              <path d="m10.5 10.5 3 3" strokeLinecap="round" />
            </svg>
          </div>

          <div
            role="tablist"
            aria-label={t('curation.title')}
            className="inline-flex shrink-0 items-center rounded-[8px] border border-[var(--color-border-faint)] bg-[var(--color-bg)] p-0.5"
          >
            {filterTabs.map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setFilter(tab.id);
                    setPage(1);
                  }}
                  className={`cursor-pointer rounded-[6px] px-2.5 py-1 text-[length:var(--text-2xs)] font-medium transition-colors ${
                    active
                      ? 'bg-[var(--color-surface-card)] text-[var(--color-text)] shadow-[var(--shadow-card-sm)]'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {errorMessage ? (
        <p
          role="alert"
          className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-row-bg)] px-3 py-2 text-[length:var(--text-xs)] text-[var(--color-text)]"
        >
          {errorMessage}
        </p>
      ) : null}

      {visibleEntries.length === 0 ? (
        <div className="py-6 text-center text-[length:var(--text-xs)] text-[var(--color-text-muted)]">
          {t('curation.empty')}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-[var(--color-border-faint)]">
            {paginatedEntries.map((entry) => {
              const key = getEntryKey(entry);
              const isPending = pendingKeys.has(key);
              const isEditing = editingKey === key;
              const typeLabel =
                entry.entryType === 'collection'
                  ? t('curation.entryTypeCollection')
                  : t('curation.entryTypeSingle');

              return (
                <li
                  key={key}
                  className="space-y-2 py-2.5 first:pt-1 last:pb-1"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p
                        title={entry.title}
                        className="truncate text-[length:var(--text-sm)] font-medium text-[var(--color-text)]"
                      >
                        {entry.title}
                      </p>
                      <p className="truncate text-[length:var(--text-2xs)] text-[var(--color-text-muted)]">
                        <span>{typeLabel}</span>
                        <span className="text-[var(--color-text-subtle)]"> · </span>
                        <span className="font-mono">{entry.slug}</span>
                        <span className="text-[var(--color-text-subtle)]"> · </span>
                        <span>{t(`roles.${entry.accessRole}`)}</span>
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => (isEditing ? setEditingKey(null) : startEditing(entry))}
                        className="cursor-pointer rounded-[6px] px-2 py-1 text-[length:var(--text-2xs)] font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                      >
                        {isEditing ? t('actions.cancel') : t('actions.edit')}
                      </button>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={entry.isCurated}
                        aria-label={entry.title}
                        disabled={isPending}
                        onClick={() => void handleToggle(entry)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring-focus)] disabled:cursor-not-allowed disabled:opacity-60 ${
                          entry.isCurated
                            ? 'border-transparent bg-[var(--color-accent)]'
                            : 'border-[var(--color-border)] bg-[var(--color-row-bg)]'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform ${
                            entry.isCurated ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="space-y-2 rounded-[10px] border border-[var(--color-border-faint)] bg-[var(--color-bg)] p-3">
                      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                        <input
                          type="text"
                          value={draftTitle}
                          maxLength={200}
                          autoFocus
                          disabled={isSavingMeta}
                          aria-label={t('edit.titleLabel')}
                          onChange={(event) => setDraftTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              void saveMetadata(entry);
                            } else if (event.key === 'Escape') {
                              event.preventDefault();
                              setEditingKey(null);
                            }
                          }}
                          className="h-9 min-w-[180px] flex-1 rounded-[10px] border border-[var(--color-border-input,var(--color-border))] bg-[var(--color-surface-card,var(--color-bg))] px-2.5 text-[length:var(--text-xs)] text-[var(--color-text)] outline-none focus:border-[var(--color-border-focus,var(--color-border-strong))]"
                        />

                        <DocsSelect
                          value={draftRole}
                          options={editableRoleOptions}
                          ariaLabel={t('edit.accessRoleLabel')}
                          onChange={(value) => setDraftRole(value as AccessRoleValue)}
                          className="w-full sm:w-[132px] shrink-0"
                        />

                        <div className="inline-flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isSavingMeta}
                            onClick={() => void saveMetadata(entry)}
                            className="h-9 cursor-pointer rounded-[8px] bg-[var(--color-accent)] px-3 text-[length:var(--text-xs)] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isSavingMeta ? t('actions.saving') : t('actions.save')}
                          </button>
                          <button
                            type="button"
                            disabled={isSavingMeta}
                            onClick={() => setEditingKey(null)}
                            className="h-9 cursor-pointer rounded-[8px] border border-[var(--color-border-faint)] px-2.5 text-[length:var(--text-xs)] font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {t('actions.cancel')}
                          </button>
                        </div>
                      </div>

                      {entry.entryType === 'collection' ? (
                        <label className="inline-flex cursor-pointer items-center gap-2 text-[length:var(--text-2xs)] text-[var(--color-text-muted)]">
                          <input
                            type="checkbox"
                            checked={applyToArticles}
                            disabled={isSavingMeta}
                            onChange={(event) => setApplyToArticles(event.target.checked)}
                            className="size-3.5 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                          />
                          <span>{t('edit.applyToCollectionArticles')}</span>
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <DocsPaginationFooter
            page={safePage}
            totalPages={totalPages}
            pageSize={CURATION_PAGE_SIZE}
            totalItems={visibleEntries.length}
            onPageChange={setPage}
          />
        </>
      )}
    </section>
  );
}
