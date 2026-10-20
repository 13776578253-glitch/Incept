import 'server-only';
import { getCurrentViewer } from '@/server/auth';
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

// 设置页的 Owner 发布总览，不向 Guest/Pro 查询或传递条目数据。
export async function loadDocsSettings(): Promise<DocsLibraryPageModel | null> {
  if ((await getCurrentViewer()).role !== 'owner') return null;
  const [stats, entries] = await Promise.all([
    getDocsLibraryStats(),
    listDocsLibraryEntries(),
  ]);

  return {
    stats: mapDocsLibraryStatsRecord(stats),
    entries: entries.map(mapDocsLibraryEntryRecord),
  };
}
