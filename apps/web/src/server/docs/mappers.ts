import type {
  DbDocsArticleRecord,
  DbDocsCollectionRecord,
  DbDocsHomeEntryRecord,
} from '@incept/db/docs';
import { calculateDocsReadingStats } from '@incept/db/docs';
import type {
  DocsAccessRole,
  DocsArticlePageModel,
  DocsContentBlockModel,
  DocsHomeGroupModel,
  DocsHomeIntroModel,
  DocsLayoutMode,
  DocsNavGroupModel,
  DocsOutlineItemModel,
  DocsSectionModel,
} from '@/features/docs/shared/types';

// 将数据库中的文章记录转换为前端使用的页面模型

// history: Docs Home no longer renders per-year descriptions; the obsolete static description map was removed.
// history: Single-article and collection mappers remain separate because their route and sidebar contracts differ.

export const docsHomeIntro: DocsHomeIntroModel = {
  eyebrow: 'Docs',
  title: 'Documentation and references',
  description:
    'Browse published guides, reference notes, and topic-based articles.',
};

// 将数据库中的内容块转换为前端使用的内容块模型
function toDocsContentBlocks(
  blocks: DbDocsArticleRecord['bodyJson']['sections'][number]['blocks'],
): DocsContentBlockModel[] {
  return blocks as DocsContentBlockModel[];
}

// 将数据库中的文章记录转换为前端使用的文档页面模型
function toDocsSections(
  body: DbDocsArticleRecord['bodyJson'],
): DocsSectionModel[] {
  return body.sections.map((section) => ({
    id: section.id,
    title: section.title,
    description: section.description,
    blocks: toDocsContentBlocks(section.blocks),
  }));
}

// 将数据库中的文章记录转换为前端使用的目录模型
function toDocsOutline(
  body: DbDocsArticleRecord['bodyJson'],
): DocsOutlineItemModel[] {
  return body.sections.map((section) => ({
    id: section.id,
    label: section.title,
  }));
}

// 将数据库中的侧边栏结构转换为前端使用的导航分组模型
function toDocsSidebarGroups(
  sidebarJson: DbDocsArticleRecord['sidebarJson'],
): DocsNavGroupModel[] {
  return sidebarJson?.groups ?? [];
}

// 将数据库中的文章记录转换为前端使用的singule文档页面模型
export function mapDocsArticleRecordToPageModel(
  record: DbDocsArticleRecord,
): DocsArticlePageModel {
  return {
    id: String(record.documentId),
    slug: record.slug,
    routeType: 'singleArticle',
    layoutMode: record.layoutMode as DocsLayoutMode,
    locale: record.locale,
    eyebrow: record.eyebrow ?? undefined,
    title: record.title,
    description: record.summary ?? undefined,
    publishedAt: record.publishedAt?.toISOString(),
    lastEditedAt: record.lastEditedAt?.toISOString(),
    readingStats: calculateDocsReadingStats({
      title: record.title,
      summary: record.summary,
      body: record.bodyJson,
    }),
    outlineLabel: 'On this page',
    sidebarGroups: toDocsSidebarGroups(record.sidebarJson),
    outline: toDocsOutline(record.bodyJson),
    sections: toDocsSections(record.bodyJson),
  };
}

// 将数据库中的系列文章记录转换为前端使用的collection文档页面模型 / series 文章具有集合层级，需要额外处理集合信息
export function mapDocsCollectionRecordToPageModel(
  record: DbDocsCollectionRecord,
): DocsArticlePageModel {
  return {
    id: String(record.articleDocumentId),
    slug: record.articleSlug,
    routeType: 'collectionArticle',
    collectionSlug: record.collectionSlug,
    articleSlug: record.articleSlug,
    layoutMode: 'sidebar',
    locale: record.locale,
    eyebrow: record.articleEyebrow ?? record.collectionEyebrow ?? undefined,
    title: record.articleTitle,
    description: record.articleSummary ?? undefined,
    publishedAt: record.articlePublishedAt?.toISOString(),
    lastEditedAt: record.articleLastEditedAt?.toISOString(),
    readingStats: calculateDocsReadingStats({
      title: record.articleTitle,
      summary: record.articleSummary,
      body: record.articleBodyJson,
    }),
    outlineLabel: 'On this page',
    sidebarGroups: [
      {
        id: `collection-${record.collectionSlug}`,
        label: record.collectionTitle,
        defaultOpen: true,
        items: record.collectionItems.map((item) => ({
          id: item.slug,
          label: item.title,
          href: `/docs/series/${record.collectionSlug}/${item.slug}`,
          active: item.slug === record.articleSlug,
        })),
      },
    ],
    outline: toDocsOutline(record.articleBodyJson),
    sections: toDocsSections(record.articleBodyJson),
  };
}

function groupDocsHomeEntriesByYear(entries: DbDocsHomeEntryRecord[]) {
  const grouped = new Map<string, DbDocsHomeEntryRecord[]>();

  for (const entry of entries) {
    const year = String(entry.publishedAt.getFullYear());
    const yearEntries = grouped.get(year) ?? [];
    yearEntries.push(entry);
    grouped.set(year, yearEntries);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([year, groupedEntries]) => ({
      year,
      entries: groupedEntries.sort(
        (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime(),
      ),
    }));
}

// 将数据库中的主页条目转换为前端使用的主页分组模型
export function mapDocsHomeEntriesToPageGroups(
  entries: DbDocsHomeEntryRecord[],
  viewerRole: DocsAccessRole,
  canAccessDocsArticle: (
    viewerRole: DocsAccessRole,
    requiredRole: DocsAccessRole,
  ) => boolean,
  routeBase = '/docs',
): DocsHomeGroupModel[] {
  return groupDocsHomeEntriesByYear(entries).flatMap((group) => {
    const mappedEntries = group.entries.flatMap((entry) => {
      const isAccessible =
        canAccessDocsArticle(viewerRole, entry.requiredRole) &&
        (entry.entryType !== 'collection' ||
          canAccessDocsArticle(viewerRole, entry.firstArticleAccessRole));

      if (!isAccessible) {
        return [];
      }

      if (entry.entryType === 'collection') {
        return {
          id: `collection-${entry.collectionId}-${entry.locale}`,
          entryType: 'collection' as const,
          slug: entry.collectionSlug,
          collectionSlug: entry.collectionSlug,
          firstArticleSlug: entry.firstArticleSlug,
          title: entry.title,
          summary: entry.summary ?? '',
          publishedAt: entry.publishedAt.toISOString(),
          requiredRole: entry.requiredRole,
          eyebrow: entry.eyebrow ?? undefined,
          isAccessible: true,
          href: `${routeBase}/series/${entry.collectionSlug}/${entry.firstArticleSlug}`,
        };
      }

      return {
        id: `${entry.documentId}-${entry.locale}`,
        entryType: 'singleArticle' as const,
        slug: entry.slug,
        title: entry.title,
        summary: entry.summary ?? '',
        publishedAt: entry.publishedAt.toISOString(),
        requiredRole: entry.requiredRole,
        eyebrow: entry.eyebrow ?? undefined,
        isAccessible: true,
        href: `${routeBase}/${entry.slug}`,
      };
    });

    return mappedEntries.length
      ? [{
          id: group.year,
          label: group.year,
          entries: mappedEntries,
        }]
      : [];
  });
}
