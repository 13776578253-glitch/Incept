import { prisma } from '../client';
import type {
  DbDocsLibraryEntryRecord,
  DbDocsLibraryStatsRecord,
  DbDocsLocale,
} from './types';

function buildFinalRoute({
  locale,
  slug,
  routeType,
  collectionSlug,
}: {
  locale: DbDocsLocale;
  slug: string;
  routeType: DbDocsLibraryEntryRecord['routeType'];
  collectionSlug?: string;
}) {
  if (routeType === 'collectionArticle') {
    return `/${locale}/docs/series/${collectionSlug ?? 'unknown-collection'}/${slug}`;
  }

  return `/${locale}/docs/${slug}`;
}

function getPublishedCollectionLocaleRow({
  locale,
  rows,
}: {
  locale: DbDocsLocale;
  rows: Array<{
    locale: string;
    slug: string;
    title: string;
  }>;
}) {
  return rows.find((row) => row.locale === locale) ?? rows[0];
}

// 查询当前已发布的 docs library 条目，用于 workspace 内的发布状态总览
export async function listDocsLibraryEntries({
  locale,
}: {
  locale?: DbDocsLocale;
} = {}): Promise<DbDocsLibraryEntryRecord[]> {
  const rows = await prisma.docsDocumentLocale.findMany({
    where: {
      status: 'published',
      ...(locale ? { locale } : {}),
    },
    orderBy: {
      updatedAt: 'desc',
    },
    select: {
      documentId: true,
      locale: true,
      slug: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      document: {
        select: {
          kind: true,
          layoutMode: true,
          accessRole: true,
          collectionItem: {
            select: {
              position: true,
              collection: {
                select: {
                  id: true,
                  locales: {
                    where: {
                      status: 'published',
                    },
                    select: {
                      locale: true,
                      slug: true,
                      title: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  return rows.map((row) => {
    const collectionItem = row.document.collectionItem;
    const routeType = collectionItem
      ? 'collectionArticle'
      : 'singleArticle';
    const collectionLocaleRow = collectionItem
      ? getPublishedCollectionLocaleRow({
          locale: row.locale as DbDocsLocale,
          rows: collectionItem.collection.locales,
        })
      : undefined;

    return {
      documentId: row.documentId,
      locale: row.locale as DbDocsLocale,
      title: row.title,
      slug: row.slug,
      routeType,
      kind: row.document.kind,
      layoutMode: row.document.layoutMode,
      accessRole: row.document.accessRole,
      collectionId: collectionItem?.collection.id,
      collectionSlug: collectionLocaleRow?.slug,
      collectionTitle: collectionLocaleRow?.title,
      position: collectionItem?.position,
      finalRoute: buildFinalRoute({
        locale: row.locale as DbDocsLocale,
        slug: row.slug,
        routeType,
        collectionSlug: collectionLocaleRow?.slug,
      }),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });
}

// 查询 docs library 总览页顶部所需的统计信息
export async function getDocsLibraryStats({
  locale,
}: {
  locale?: DbDocsLocale;
} = {}): Promise<DbDocsLibraryStatsRecord> {
  const updatedSince = new Date();
  updatedSince.setDate(updatedSince.getDate() - 30);

  const localeWhere = locale ? { locale } : {};

  const [
    totalArticles,
    standaloneArticleCount,
    collectionArticleCount,
    collectionCount,
    recentlyUpdatedCount,
  ] = await Promise.all([
    prisma.docsDocumentLocale.count({
      where: {
        status: 'published',
        ...localeWhere,
      },
    }),
    prisma.docsDocumentLocale.count({
      where: {
        status: 'published',
        ...localeWhere,
        document: {
          collectionItem: {
            is: null,
          },
        },
      },
    }),
    prisma.docsDocumentLocale.count({
      where: {
        status: 'published',
        ...localeWhere,
        document: {
          collectionItem: {
            isNot: null,
          },
        },
      },
    }),
    prisma.docsCollection.count({
      where: {
        locales: {
          some: {
            status: 'published',
            ...(locale ? { locale } : {}),
          },
        },
      },
    }),
    prisma.docsDocumentLocale.count({
      where: {
        status: 'published',
        ...localeWhere,
        updatedAt: {
          gte: updatedSince,
        },
      },
    }),
  ]);

  return {
    totalArticles,
    standaloneArticleCount,
    collectionArticleCount,
    collectionCount,
    recentlyUpdatedCount,
  };
}
