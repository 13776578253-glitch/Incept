import type { DocsArticlePageModel, DocsNavGroupModel, DocsOutlineItemModel, DocsSectionModel } from '../shared/types';
import { calculateDocsReadingStats } from '@incept/db/docs';
import type { DocsImportNormalizedSource, DocsImportPreviewModel } from './types';
import { buildDocsOutline } from '../shared/outline';

// 预览模型映射器，将导入草稿数据转换为预览展示所需的结构，主要负责将原始的导入源数据规范化为文档页面模型，并计算预览中需要展示的错误和警告信息等 --- IGNORE ---
function toDocsSections(source: DocsImportNormalizedSource): DocsSectionModel[] {
  return source.body.sections.map((section) => ({
    id: section.id,
    title: section.title,
    description: section.description,
    blocks: section.blocks,
  }));
}

function toDocsOutline(source: DocsImportNormalizedSource): DocsOutlineItemModel[] {
  return buildDocsOutline(
    source.body.sections.map((section) => ({
      id: section.id,
      title: section.title,
      blocks: section.blocks,
    })),
  );
}

function toDocsSidebarGroups(source: DocsImportNormalizedSource): DocsNavGroupModel[] {
  if (source.meta.routeType !== 'collectionArticle') {
    return [];
  }

  return [
    {
      id: `collection-${source.meta.collectionSlug}`,
      label: source.meta.collectionTitle ?? source.meta.collectionSlug ?? 'Collection',
      defaultOpen: true,
      items: [
        {
          id: source.meta.slug,
          label: source.meta.title,
          href: `/docs/series/${source.meta.collectionSlug}/${source.meta.slug}`,
          active: true,
        },
      ],
    },
  ];
}

export function mapDocsImportSourceToPageModel(
  source: DocsImportNormalizedSource,
): DocsArticlePageModel {
  return {
    id: `import-preview-${source.meta.locale}-${source.meta.slug}`,
    slug: source.meta.slug,
    routeType: source.meta.routeType,
    collectionSlug: source.meta.collectionSlug,
    articleSlug: source.meta.routeType === 'collectionArticle' ? source.meta.slug : undefined,
    layoutMode: source.meta.layoutMode,
    locale: source.meta.locale,
    eyebrow: source.meta.eyebrow,
    title: source.meta.title,
    description: source.meta.summary,
    publishedAt: source.meta.publishedAt,
    readingStats: calculateDocsReadingStats({
      title: source.meta.title,
      summary: source.meta.summary,
      body: source.body,
    }),
    outlineLabel: 'On this page',
    sidebarGroups: toDocsSidebarGroups(source),
    outline: toDocsOutline(source),
    sections: toDocsSections(source),
  };
}

export function toDocsImportPreviewModel(draft: import('./types').DocsImportDraft): DocsImportPreviewModel {
  const errorCount = draft.issues.filter((issue) => issue.level === 'error').length;
  const warningCount = draft.issues.filter((issue) => issue.level === 'warning').length;

  return {
    draft,
    hasErrors: errorCount > 0,
    errorCount,
    warningCount,
  };
}
