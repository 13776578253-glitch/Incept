import type { AppLocale } from '@/i18n/config/locales';
import {
  listPublishedDocsHomeEntries,
  findPublishedDocsArticleBySlug,
  findPublishedDocsCollectionArticleBySlugs,
} from '@incept/db/docs';
import type { DbDocsLocale } from '@incept/db/docs';
import type {
  DocsAccessRole,
  DocsArticlePageModel,
  DocsHomePageModel,
} from '@/features/docs/shared/types';
import {
  docsHomeIntro,
  mapDocsArticleRecordToPageModel,
  mapDocsCollectionRecordToPageModel,
  mapDocsHomeEntriesToPageGroups,
} from '@/server/docs/mappers';

// 定义访问角色的等级，确保权限检查的一致性
const docsRoleRank: Record<DocsAccessRole, number> = {
  guest: 0,
  pro: 1,
  private: 2,
};

// 根据访问角色判断用户是否有权限访问文档
export function canAccessDocsArticle(
  viewerRole: DocsAccessRole,
  requiredRole: DocsAccessRole,
) {
  return docsRoleRank[viewerRole] >= docsRoleRank[requiredRole];
}

// 查询指定 locale 和 slug 的已发布文档，并检查访问权限，返回前端使用的文档页面模型
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
    locale: locale as DbDocsLocale,
    slug,
  });

  if (!record) {
    return null;
  }

  if (!canAccessDocsArticle(viewerRole, record.accessRole)) {
    return null;
  }

  return mapDocsArticleRecordToPageModel(record);
}

// 查询指定 locale、系列 slug 和文章 slug 的已发布文档，并检查访问权限，返回前端使用的文档页面模型
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
    locale: locale as DbDocsLocale,
    collectionSlug,
    articleSlug,
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
  });
}

// 查询主页的已发布文档列表，并根据访问角色过滤，返回前端使用的主页模型
export async function getDocsHomePage({
  locale,
  viewerRole,
}: {
  locale: AppLocale;
  viewerRole: DocsAccessRole;
}): Promise<DocsHomePageModel> {
  const entries = await listPublishedDocsHomeEntries({
    locale: locale as DbDocsLocale,
  });

  return {
    intro: docsHomeIntro,
    groups: mapDocsHomeEntriesToPageGroups(
      entries,
      viewerRole,
      canAccessDocsArticle,
    ),
  };
}
