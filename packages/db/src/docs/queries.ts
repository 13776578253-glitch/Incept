import { prisma } from '../client';
import type {
  DbDocsArticleRecord,
  DbDocsBody,
  DbDocsHomeArticleRecord,
  DbDocsHomeGroupRecord,
  DbDocsLocale,
  DbDocsNavGroup,
} from './types';

/**
 * 校验 bodyJson 是否为合法的文档正文对象。
 * 当前数据库约定结构为 { sections: [...] }。
 * 如果顶层或 sections 结构不对则直接抛错，防止脏数据传入 UI 层。
 */
function assertDocsBody(value: unknown): DbDocsBody {
  if (
    typeof value !== 'object' ||
    value === null ||
    !Array.isArray((value as { sections?: unknown }).sections)
  ) {
    throw new Error(
      'Invalid docs body_json: expected an object with a sections array.',
    );
  }

  return value as DbDocsBody;
}

/**
 * 校验 sidebarJson 是否包含合法的导航分组数组。
 * 允许 sidebarJson 为 null 或 undefined，表示没有侧边栏。
 * 如果存在但格式不对则抛错，确保 UI 层拿到的数据结构正确。
 */
function assertDocsNavGroups(value: unknown): DbDocsNavGroup[] | undefined {
  if (value == null) {
    return undefined;
  }

  if (!Array.isArray((value as { groups?: unknown }).groups)) {
    throw new Error('Invalid docs sidebar_json: expected a groups array.');
  }

  return (value as { groups: DbDocsNavGroup[] }).groups;
}

// 查询指定 locale 和 slug 的已发布文档，返回完整的文章记录
export async function findPublishedDocsArticleBySlug({
  locale,
  slug,
}: {
  locale: DbDocsLocale;
  slug: string;
}): Promise<DbDocsArticleRecord | null> {
  const row = await prisma.docsDocumentLocale.findFirst({
    where: {
      locale,
      slug,
      status: 'published',
    },

    select: {
      documentId: true,
      locale: true,
      slug: true,
      eyebrow: true,
      title: true,
      summary: true,
      status: true,
      publishedAt: true,
      bodyJson: true,
      sidebarJson: true,
      seoTitle: true,
      seoDescription: true,
      createdAt: true,
      updatedAt: true,
      document: {
        select: {
          kind: true,
          layoutMode: true,
          accessRole: true,
        },
      },
    },
  });

  if (!row) {
    return null;
  }

  // 数据库中直接存储 JSON 原始值 / 进行类型断言和校验，确保传递给 UI 层的数据结构正确
  return {
    documentId: row.documentId,
    kind: row.document.kind,
    layoutMode: row.document.layoutMode,
    accessRole: row.document.accessRole,
    locale: row.locale as DbDocsLocale,
    slug: row.slug,
    eyebrow: row.eyebrow,
    title: row.title,
    summary: row.summary,
    status: row.status,
    publishedAt: row.publishedAt,
    bodyJson: assertDocsBody(row.bodyJson),
    sidebarJson: { groups: assertDocsNavGroups(row.sidebarJson) ?? [] },
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// 查询指定 locale 的已发布文档列表，按年份分组，返回用于首页展示的数据结构
export async function listPublishedDocsForHome({
  locale,
}: {
  locale: DbDocsLocale;
}): Promise<DbDocsHomeGroupRecord[]> {
  const rows = await prisma.docsDocumentLocale.findMany({
    where: {
      locale,
      status: 'published',
    },

    orderBy: [
      {
        publishedAt: 'desc',
      },
    ],

    select: {
      documentId: true,
      locale: true,
      slug: true,
      eyebrow: true,
      title: true,
      summary: true,
      publishedAt: true,
      document: {
        select: {
          accessRole: true,
        },
      },
    },
  });

  // 按年份分组
  const grouped = new Map<string, DbDocsHomeArticleRecord[]>();

  // 遍历查询结果，构建分组数据结构
  for (const row of rows) {
    if (!row.publishedAt) {
      continue;
    }

    // 根据 publishedAt 的年份进行分组，构建 DbDocsHomeArticleRecord 结构
    const year = String(row.publishedAt.getFullYear());
    const articles = grouped.get(year) ?? [];

    articles.push({
      documentId: row.documentId,
      locale: row.locale as DbDocsLocale,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      publishedAt: row.publishedAt,
      requiredRole: row.document.accessRole,
      eyebrow: row.eyebrow,
      accessRole: row.document.accessRole,
    });

    grouped.set(year, articles);
  }

  // 将 Map 转换为数组，并按年份降序排序
  return [...grouped.entries()]
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([year, articles]) => ({ year, articles }));
}
