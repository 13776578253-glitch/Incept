'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { DocsHomeCurationPanel } from './components/docs-home-curation-panel';
import { DocsLibraryStats } from './components/docs-library-stats';
import { DocsLibraryTable } from './components/docs-library-table';
import type {
  DocsHomeCurationEntryModel,
  DocsLibraryEntryModel,
  DocsLibraryPageModel,
} from './types';

export type DocsMetadataUpdatePayload =
  | {
      targetType: 'document';
      documentId: number;
      locale: 'en' | 'zh';
      title: string;
      accessRole: 'guest' | 'pro' | 'private';
      updatedAt: string;
    }
  | {
      targetType: 'collection';
      collectionId: number;
      locale: 'en' | 'zh';
      title: string;
      accessRole: 'guest' | 'pro' | 'private';
      updatedDocumentIds: number[];
      updatedAt: string;
    };

export function DocsSettingsPanel({ page }: { page: DocsLibraryPageModel }) {
  const locale = useLocale();
  const isZh = locale === 'zh';
  const [entries, setEntries] = useState<DocsLibraryEntryModel[]>(page.entries);
  const [curationEntries, setCurationEntries] = useState<DocsHomeCurationEntryModel[]>(
    page.curationEntries ?? [],
  );

  function handleMetadataUpdated(update: DocsMetadataUpdatePayload) {
    if (update.targetType === 'document') {
      setEntries((current) =>
        current.map((item) => {
          if (item.documentId !== update.documentId) {
            return item;
          }
          return {
            ...item,
            accessRole: update.accessRole,
            ...(item.locale === update.locale
              ? { title: update.title, updatedAt: update.updatedAt }
              : {}),
          };
        }),
      );
      setCurationEntries((current) =>
        current.map((item) => {
          if (item.entryType !== 'singleArticle' || item.targetId !== update.documentId) {
            return item;
          }
          const primaryLocale = item.locales[0] ?? 'zh';
          return {
            ...item,
            accessRole: update.accessRole,
            ...(primaryLocale === update.locale ? { title: update.title } : {}),
          };
        }),
      );
      return;
    }

    const updatedDocSet = new Set(update.updatedDocumentIds);
    setCurationEntries((current) =>
      current.map((item) => {
        if (item.entryType !== 'collection' || item.targetId !== update.collectionId) {
          return item;
        }
        const primaryLocale = item.locales[0] ?? 'zh';
        return {
          ...item,
          accessRole: update.accessRole,
          ...(primaryLocale === update.locale ? { title: update.title } : {}),
        };
      }),
    );
    setEntries((current) =>
      current.map((item) => {
        const isInCollection = item.collectionId === update.collectionId;
        const shouldUpdateTitle = isInCollection && item.locale === update.locale;
        const shouldUpdateRole = updatedDocSet.has(item.documentId);
        if (!shouldUpdateTitle && !shouldUpdateRole) {
          return item;
        }
        return {
          ...item,
          ...(shouldUpdateTitle ? { collectionTitle: update.title } : {}),
          ...(shouldUpdateRole ? { accessRole: update.accessRole } : {}),
        };
      }),
    );
  }

  return (
    <section id="docs" className="min-w-0 max-w-[760px] space-y-6">
      <header className="space-y-1">
        <h2 className="text-[length:var(--text-xl)] font-semibold tracking-[-0.025em] text-[var(--color-text)]">
          {isZh ? '文档管理' : 'Docs & Articles'}
        </h2>
        <p className="text-[length:var(--text-sm)] leading-relaxed text-[var(--color-text-muted)] tabular-nums">
          {isZh
            ? `共 ${page.stats.totalArticles} 篇已发布文档 · 概览分布、路由检索与访问权限`
            : `${page.stats.totalArticles} published ${page.stats.totalArticles === 1 ? 'article' : 'articles'} · Overview, routes, and access control`}
        </p>
      </header>
      <DocsLibraryStats stats={page.stats} />
      <DocsHomeCurationPanel
        initialEntries={curationEntries}
        entriesOverride={curationEntries}
        onCuratedChanged={(entryType, targetId, isCurated) => {
          setCurationEntries((current) =>
            current.map((item) =>
              item.entryType === entryType && item.targetId === targetId
                ? { ...item, isCurated }
                : item,
            ),
          );
        }}
        onMetadataUpdated={handleMetadataUpdated}
      />
      <DocsLibraryTable
        entries={entries}
        onMetadataUpdated={handleMetadataUpdated}
      />
    </section>
  );
}
