import type { AppLocale } from '@/i18n/config/locales';
import {
  listPublishedDocsHomeEntries,
  findPublishedDocsArticleBySlug,
  findPublishedUnlistedDocsArticleByDocumentKey,
  findPublishedDocsCollectionArticleBySlugs,
  getDocsLibraryStats,
} from '@incept/db/docs';
import type { DbDocsLocale } from '@incept/db/docs';
import type {
  DocsAccessRole,
  DocsArticlePageModel,
  DocsHomePageModel,
} from '@/features/docs/shared/types';
import type { DbDocsCollectionNavigationNode } from '@incept/db/docs';
import { resolveArticleReadingRoute, resolveCollectionReadingRoute, preferredHomeEntries } from './reading-language';
import {
  docsHomeIntro,
  mapDocsArticleRecordToPageModel,
  mapDocsCollectionRecordToPageModel,
  mapDocsHomeEntriesToPageGroups,
} from '@/server/docs/mappers';

const docsRoleRank: Record<DocsAccessRole, number> = {
  guest: 0,
  pro: 1,
  private: 2,
};

export function canAccessDocsArticle(
  viewerRole: DocsAccessRole,
  requiredRole: DocsAccessRole,
) {
  return docsRoleRank[viewerRole] >= docsRoleRank[requiredRole];
}

function filterCollectionNavigation(
  nodes: DbDocsCollectionNavigationNode[],
  viewerRole: DocsAccessRole,
): DbDocsCollectionNavigationNode[] {
  return nodes.flatMap((node) => {
    const children = filterCollectionNavigation(node.children, viewerRole);
    const articleVisible =
      node.type === 'folder' ||
      !node.accessRole ||
      canAccessDocsArticle(viewerRole, node.accessRole);

    if (!articleVisible || (node.type === 'folder' && !children.length && !node.label)) {
      return [];
    }

    return [{ ...node, children }];
  });
}

// 查询指定 locale 和 slug 的已发布文档，并检查访问权限，返回文档页面模型
export async function getDocsArticlePage({
  locale,
  slug,
  viewerRole,
}: {
  locale: AppLocale;
  slug: string;
  viewerRole: DocsAccessRole;
}): Promise<DocsArticlePageModel | null> {
  const record = await findPublishedDocsArticleBySlug({
    ...await resolveArticleReadingRoute(locale, slug),
  });

  if (!record) {
    return null;
  }

  if (!canAccessDocsArticle(viewerRole, record.accessRole)) {
    return null;
  }

  return mapDocsArticleRecordToPageModel(record);
}

// Reads an internal Docs article without attaching it to the Docs route.
// history: About page content
export async function getUnlistedDocsArticlePage({
  locale,
  documentKey,
  viewerRole,
}: {
  locale: AppLocale;
  documentKey: string;
  viewerRole: DocsAccessRole;
}): Promise<DocsArticlePageModel | null> {
  const record = await findPublishedUnlistedDocsArticleByDocumentKey({
    locale: locale as DbDocsLocale,
    documentKey,
  });

  if (!record || !canAccessDocsArticle(viewerRole, record.accessRole)) {
    return null;
  }

  return mapDocsArticleRecordToPageModel(record);
}

// 查询指定 locale、系列 slug 和文章 slug 的已发布文档，并检查访问权限，返回文档页面模型
export async function getDocsCollectionArticlePage({
  locale,
  collectionSlug,
  articleSlug,
  viewerRole,
}: {
  locale: AppLocale;
  collectionSlug: string;
  articleSlug: string;
  viewerRole: DocsAccessRole;
}): Promise<DocsArticlePageModel | null> {
  const record = await findPublishedDocsCollectionArticleBySlugs({
    ...await resolveCollectionReadingRoute(locale, collectionSlug, articleSlug),
  });

  if (!record) {
    return null;
  }

  if (
    !canAccessDocsArticle(viewerRole, record.collectionAccessRole) ||
    !canAccessDocsArticle(viewerRole, record.articleAccessRole)
  ) {
    return null;
  }

  return mapDocsCollectionRecordToPageModel({
    ...record,
    collectionItems: record.collectionItems.filter((item) =>
      canAccessDocsArticle(viewerRole, item.accessRole),
    ),
    collectionNavigation: filterCollectionNavigation(record.collectionNavigation, viewerRole),
  });
}

// 查询主页的已发布文档列表，并根据访问角色过滤，返回主页分组模型
export async function getDocsHomePage({
  locale,
  viewerRole,
}: {
  locale: AppLocale;
  viewerRole: DocsAccessRole;
}): Promise<DocsHomePageModel> {
  const [entries, rawStats] = await Promise.all([
    preferredHomeEntries(locale, listPublishedDocsHomeEntries),
    getDocsLibraryStats({ locale: locale as DbDocsLocale }).catch(() => null),
  ]);

  const stats = rawStats
    ? {
        totalArticles: rawStats.totalArticles,
        standalone: rawStats.standaloneArticleCount,
        collections: rawStats.collectionCount,
        recentlyUpdated: rawStats.recentlyUpdatedCount,
      }
    : undefined;

  return {
    intro: docsHomeIntro,
    stats,
    groups: mapDocsHomeEntriesToPageGroups(
      entries,
      viewerRole,
      canAccessDocsArticle,
    ),
  };
}
