import type {
  DbDocsArticleRecord,
  DbDocsHomeGroupRecord,
} from '@incept/db/docs';
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

// 定义主页分组的描述
const docsHomeGroupDescriptions: Record<string, string> = {
  '2026': 'Recent releases, interface studies, and gated working notes.',
  '2025': 'Earlier groundwork that shaped the current archive and navigation patterns.',
};

// 将数据库中的文章记录转换为前端使用的页面模型
export const docsHomeIntro: DocsHomeIntroModel = {
  eyebrow: 'Docs',
  title: 'Documentation, references, and gated drafts',
  description:
    'A calm entry point for released writing, structured reference articles, and restricted pieces that still need to remain structurally visible.',
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

// 将数据库中的文章记录转换为前端使用的文档页面模型
export function mapDocsArticleRecordToPageModel(
  record: DbDocsArticleRecord,
): DocsArticlePageModel {
  return {
    id: String(record.documentId),
    slug: record.slug,
    layoutMode: record.layoutMode as DocsLayoutMode,
    eyebrow: record.eyebrow ?? undefined,
    title: record.title,
    description: record.summary ?? undefined,
    outlineLabel: 'On this page',
    sidebarGroups: toDocsSidebarGroups(record.sidebarJson),
    outline: toDocsOutline(record.bodyJson),
    sections: toDocsSections(record.bodyJson),
  };
}

// 将数据库中的主页分组记录转换为前端使用的主页分组模型
export function mapDocsHomeGroupsToPageGroups(
  groups: DbDocsHomeGroupRecord[],
  viewerRole: DocsAccessRole,
  canAccessDocsArticle: (
    viewerRole: DocsAccessRole,
    requiredRole: DocsAccessRole,
  ) => boolean,
): DocsHomeGroupModel[] {
  return groups.map((group) => ({
    id: group.year,
    label: group.year,
    description: docsHomeGroupDescriptions[group.year],
    articles: group.articles.map((article) => ({
      id: `${article.documentId}-${article.locale}`,
      slug: article.slug,
      title: article.title,
      summary: article.summary ?? '',
      publishedAt: article.publishedAt.toISOString(),
      requiredRole: article.requiredRole,
      eyebrow: article.eyebrow ?? undefined,
      isAccessible: canAccessDocsArticle(viewerRole, article.requiredRole),
      href: canAccessDocsArticle(viewerRole, article.requiredRole)
        ? `/docs/${article.slug}`
        : undefined,
    })),
  }));
}
