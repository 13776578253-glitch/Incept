import { prisma } from '../client';
import type {
  DbDocsArticleRecord,
  DbDocsBody,
  DbDocsCollectionArticleListItem,
  DbDocsCollectionRecord,
  DbDocsHomeCollectionRecord,
  DbDocsHomeArticleRecord,
  DbDocsHomeEntryRecord,
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

  const collectionMembershipRows = await prisma.$queryRawUnsafe<
    Array<{ documentId: number }>
  >(
    'SELECT "documentId" FROM "docs_collection_items" WHERE "documentId" = $1',
    row.documentId,
  );

  if (collectionMembershipRows.length > 0) {
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

export async function findPublishedDocsCollectionArticleBySlugs({
  locale,
  collectionSlug,
  articleSlug,
}: {
  locale: DbDocsLocale;
  collectionSlug: string;
  articleSlug: string;
}): Promise<DbDocsCollectionRecord | null> {
  const baseRows = await prisma.$queryRawUnsafe<
    Array<{
      collectionId: number;
      locale: string;
      collectionSlug: string;
      collectionEyebrow: string | null;
      collectionTitle: string;
      collectionSummary: string | null;
      collectionStatus: string;
      collectionPublishedAt: Date | null;
      collectionAccessRole: string;
      seoTitle: string | null;
      seoDescription: string | null;
      articleDocumentId: number;
      articleSlug: string;
      articleTitle: string;
      articleSummary: string | null;
      articleEyebrow: string | null;
      articlePublishedAt: Date | null;
      articleBodyJson: unknown;
      articleStatus: string;
      articleKind: string;
      articleLayoutMode: string;
      createdAt: Date;
      updatedAt: Date;
    }>
  >(
    `
      SELECT
        cl."collectionId" AS "collectionId",
        cl."locale" AS "locale",
        cl."slug" AS "collectionSlug",
        cl."eyebrow" AS "collectionEyebrow",
        cl."title" AS "collectionTitle",
        cl."summary" AS "collectionSummary",
        cl."status" AS "collectionStatus",
        cl."publishedAt" AS "collectionPublishedAt",
        c."accessRole" AS "collectionAccessRole",
        cl."seoTitle" AS "seoTitle",
        cl."seoDescription" AS "seoDescription",
        d."id" AS "articleDocumentId",
        dl."slug" AS "articleSlug",
        dl."title" AS "articleTitle",
        dl."summary" AS "articleSummary",
        dl."eyebrow" AS "articleEyebrow",
        dl."publishedAt" AS "articlePublishedAt",
        dl."bodyJson" AS "articleBodyJson",
        dl."status" AS "articleStatus",
        d."kind" AS "articleKind",
        d."layoutMode" AS "articleLayoutMode",
        dl."createdAt" AS "createdAt",
        dl."updatedAt" AS "updatedAt"
      FROM "docs_collection_locales" cl
      INNER JOIN "docs_collections" c ON c."id" = cl."collectionId"
      INNER JOIN "docs_collection_items" ci ON ci."collectionId" = c."id"
      INNER JOIN "docs_documents" d ON d."id" = ci."documentId"
      INNER JOIN "docs_document_locales" dl
        ON dl."documentId" = d."id"
       AND dl."locale" = $1
       AND dl."status" = 'published'
      WHERE cl."locale" = $1
        AND cl."slug" = $2
        AND cl."status" = 'published'
        AND dl."slug" = $3
      LIMIT 1
    `,
    locale,
    collectionSlug,
    articleSlug,
  );

  const row = baseRows[0];

  if (!row) {
    return null;
  }

  const collectionItems = await prisma.$queryRawUnsafe<DbDocsCollectionArticleListItem[]>(
    `
      SELECT
        d."id" AS "documentId",
        dl."locale" AS "locale",
        dl."slug" AS "slug",
        dl."title" AS "title",
        dl."summary" AS "summary",
        dl."publishedAt" AS "publishedAt"
      FROM "docs_collection_locales" cl
      INNER JOIN "docs_collection_items" ci ON ci."collectionId" = cl."collectionId"
      INNER JOIN "docs_documents" d ON d."id" = ci."documentId"
      INNER JOIN "docs_document_locales" dl
        ON dl."documentId" = d."id"
       AND dl."locale" = $1
       AND dl."status" = 'published'
      WHERE cl."locale" = $1
        AND cl."slug" = $2
        AND cl."status" = 'published'
      ORDER BY ci."position" ASC
    `,
    locale,
    collectionSlug,
  );

  return {
    collectionId: row.collectionId,
    locale: row.locale as DbDocsLocale,
    collectionSlug: row.collectionSlug,
    collectionTitle: row.collectionTitle,
    collectionSummary: row.collectionSummary,
    collectionEyebrow: row.collectionEyebrow,
    collectionStatus: row.collectionStatus as DbDocsCollectionRecord['collectionStatus'],
    collectionPublishedAt: row.collectionPublishedAt,
    collectionAccessRole: row.collectionAccessRole as DbDocsCollectionRecord['collectionAccessRole'],
    articleDocumentId: row.articleDocumentId,
    articleSlug: row.articleSlug,
    articleTitle: row.articleTitle,
    articleSummary: row.articleSummary,
    articleEyebrow: row.articleEyebrow,
    articlePublishedAt: row.articlePublishedAt,
    articleBodyJson: assertDocsBody(row.articleBodyJson),
    articleStatus: row.articleStatus as DbDocsCollectionRecord['articleStatus'],
    articleKind: row.articleKind as DbDocsCollectionRecord['articleKind'],
    articleLayoutMode: row.articleLayoutMode as DbDocsCollectionRecord['articleLayoutMode'],
    collectionItems,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// 查询指定 locale 的已发布文档列表，按年份分组，返回用于首页展示的数据结构
export async function listPublishedDocsHomeEntries({
  locale,
}: {
  locale: DbDocsLocale;
}): Promise<DbDocsHomeGroupRecord[]> {
  const standaloneRows = await prisma.docsDocumentLocale.findMany({
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
  const collectionItemRows = await prisma.$queryRawUnsafe<Array<{ documentId: number }>>(
    'SELECT "documentId" FROM "docs_collection_items"',
  );
  const collectionDocumentIds = new Set(collectionItemRows.map((row) => row.documentId));

  const collectionRows = await prisma.$queryRawUnsafe<
    Array<{
      collectionId: number;
      locale: string;
      collectionSlug: string;
      eyebrow: string | null;
      title: string;
      summary: string | null;
      status: string;
      publishedAt: Date | null;
      accessRole: string;
      firstArticleSlug: string | null;
    }>
  >(
    `
      SELECT
        cl."collectionId" AS "collectionId",
        cl."locale" AS "locale",
        cl."slug" AS "collectionSlug",
        cl."eyebrow" AS "eyebrow",
        cl."title" AS "title",
        cl."summary" AS "summary",
        cl."status" AS "status",
        cl."publishedAt" AS "publishedAt",
        c."accessRole" AS "accessRole",
        (
          SELECT dl."slug"
          FROM "docs_collection_items" ci2
          INNER JOIN "docs_document_locales" dl
            ON dl."documentId" = ci2."documentId"
           AND dl."locale" = $1
           AND dl."status" = 'published'
          WHERE ci2."collectionId" = c."id"
          ORDER BY ci2."position" ASC
          LIMIT 1
        ) AS "firstArticleSlug"
      FROM "docs_collection_locales" cl
      INNER JOIN "docs_collections" c ON c."id" = cl."collectionId"
      WHERE cl."locale" = $1
        AND cl."status" = 'published'
      ORDER BY cl."publishedAt" DESC
    `,
    locale,
  );

  // 按年份分组
  const grouped = new Map<string, DbDocsHomeEntryRecord[]>();

  // 遍历查询结果，构建分组数据结构
  for (const row of standaloneRows) {
    if (!row.publishedAt) {
      continue;
    }

    if (collectionDocumentIds.has(row.documentId)) {
      continue;
    }

    // 根据 publishedAt 的年份进行分组，构建 DbDocsHomeArticleRecord 结构
    const year = String(row.publishedAt.getFullYear());
    const entries = grouped.get(year) ?? [];

    entries.push({
      entryType: 'singleArticle',
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

    grouped.set(year, entries);
  }

  for (const row of collectionRows) {
    if (!row.publishedAt) {
      continue;
    }

    const firstArticleSlug = row.firstArticleSlug;

    if (!firstArticleSlug) {
      continue;
    }

    const year = String(row.publishedAt.getFullYear());
    const entries = grouped.get(year) ?? [];

    entries.push({
      entryType: 'collection',
      collectionId: row.collectionId,
      locale: row.locale as DbDocsLocale,
      collectionSlug: row.collectionSlug,
      title: row.title,
      summary: row.summary,
      publishedAt: row.publishedAt,
      requiredRole: row.accessRole as DbDocsHomeCollectionRecord['requiredRole'],
      eyebrow: row.eyebrow,
      accessRole: row.accessRole as DbDocsHomeCollectionRecord['accessRole'],
      firstArticleSlug,
    });

    grouped.set(year, entries);
  }

  // 将 Map 转换为数组，并按年份降序排序
  return [...grouped.entries()]
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([year, entries]) => ({
      year,
      entries: entries.sort((a, b) => {
        const aDate = a.publishedAt.getTime();
        const bDate = b.publishedAt.getTime();
        return bDate - aDate;
      }),
    }));
}
