import 'server-only';
import { getCurrentViewer } from '@/server/auth';
import {
  getDocsLibraryStats,
  listDocsHomeCurationEntries,
  listDocsLibraryEntries,
} from '@incept/db/docs';
import type {
  DbDocsHomeCurationEntryRecord,
  DbDocsLibraryEntryRecord,
  DbDocsLibraryStatsRecord,
} from '@incept/db/docs';
import type {
  DocsHomeCurationEntryModel,
  DocsLibraryEntryModel,
  DocsLibraryPageModel,
  DocsLibraryStatsModel,
} from '@/features/settings/docs/types';

function mapDocsLibraryEntryRecord(
  record: DbDocsLibraryEntryRecord,
): DocsLibraryEntryModel {
  return {
    documentId: record.documentId,
    locale: record.locale,
    title: record.title,
    slug: record.slug,
    routeType: record.routeType,
    kind: record.kind,
    layoutMode: record.layoutMode,
    accessRole: record.accessRole,
    collectionId: record.collectionId,
    collectionSlug: record.collectionSlug,
    collectionTitle: record.collectionTitle,
    position: record.position,
    finalRoute: record.finalRoute,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapDocsLibraryStatsRecord(
  record: DbDocsLibraryStatsRecord,
): DocsLibraryStatsModel {
  return {
    totalArticles: record.totalArticles,
    standaloneArticleCount: record.standaloneArticleCount,
    collectionArticleCount: record.collectionArticleCount,
    collectionCount: record.collectionCount,
    recentlyUpdatedCount: record.recentlyUpdatedCount,
  };
}

function mapDocsHomeCurationEntryRecord(
  record: DbDocsHomeCurationEntryRecord,
): DocsHomeCurationEntryModel {
  return {
    entryType: record.entryType,
    targetId: record.targetId,
    title: record.title,
    slug: record.slug,
    locales: record.locales,
    accessRole: record.accessRole,
    isCurated: record.isCurated,
    publishedAt: record.publishedAt.toISOString(),
  };
}

// 设置页的 Owner 发布总览，不向 Guest/Pro 查询或传递条目数据。
export async function loadDocsSettings(): Promise<DocsLibraryPageModel | null> {
  if ((await getCurrentViewer()).role !== 'owner') return null;
  const [stats, entries, curationEntries] = await Promise.all([
    getDocsLibraryStats(),
    listDocsLibraryEntries(),
    listDocsHomeCurationEntries(),
  ]);

  return {
    stats: mapDocsLibraryStatsRecord(stats),
    entries: entries.map(mapDocsLibraryEntryRecord),
    curationEntries: curationEntries.map(mapDocsHomeCurationEntryRecord),
  };
}
