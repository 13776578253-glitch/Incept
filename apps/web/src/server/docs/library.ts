import type { AppLocale } from '@/i18n/config/locales';
import {
  getDocsLibraryStats,
  listDocsLibraryEntries,
} from '@incept/db/docs';
import type {
  DbDocsLibraryEntryRecord,
  DbDocsLibraryStatsRecord,
} from '@incept/db/docs';
import type {
  DocsLibraryEntryModel,
  DocsLibraryPageModel,
  DocsLibraryStatsModel,
} from '@/features/docs/admin/types';

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

// 读取 studio/docs/library 所需的当前发布状态数据，不包含导入历史
export async function getDocsLibraryPage({
  locale: _locale,
}: {
  locale: AppLocale;
}): Promise<DocsLibraryPageModel> {
  const [stats, entries] = await Promise.all([
    getDocsLibraryStats(),
    listDocsLibraryEntries(),
  ]);

  return {
    stats: mapDocsLibraryStatsRecord(stats),
    entries: entries.map(mapDocsLibraryEntryRecord),
  };
}
