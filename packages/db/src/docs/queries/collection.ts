import { prisma } from '../../client';
import type {
  DbDocsCollectionArticleListItem,
  DbDocsCollectionRecord,
  DbDocsLocale,
} from '../types';
import { assertDocsBody } from './shared';

// 将数据库查询结果转换为文档集合文章列表项记录
function toCollectionArticleListItems(
  items: Array<{
    document: {
      id: number;
      locales: Array<{
        locale: string;
        slug: string;
        title: string;
        summary: string | null;
        publishedAt: Date | null;
      }>;
    };
  }>,
): DbDocsCollectionArticleListItem[] {
  return items.flatMap((item) => {
    const localeRow = item.document.locales[0];

    if (!localeRow) {
      return [];
    }

    return [
      {
        documentId: item.document.id,
        locale: localeRow.locale as DbDocsLocale,
        slug: localeRow.slug,
        title: localeRow.title,
        summary: localeRow.summary,
        publishedAt: localeRow.publishedAt,
      },
    ];
  });
}

// 根据 collectionSlug 和 articleSlug 查找已发布的文档集合文章记录
export async function findPublishedDocsCollectionArticleBySlugs({
  locale,
  collectionSlug,
  articleSlug,
}: {
  locale: DbDocsLocale;
  collectionSlug: string;
  articleSlug: string;
}): Promise<DbDocsCollectionRecord | null> {
  const row = await prisma.docsCollection.findFirst({
    where: {
      locales: {
        some: {
          locale,
          slug: collectionSlug,
          status: 'published',
        },
      },
      items: {
        some: {
          document: {
            locales: {
              some: {
                locale,
                slug: articleSlug,
                status: 'published',
              },
            },
          },
        },
      },
    },
    select: {
      id: true,
      accessRole: true,
      locales: {
        where: {
          locale,
          slug: collectionSlug,
          status: 'published',
        },
        take: 1,
        select: {
          locale: true,
          slug: true,
          eyebrow: true,
          title: true,
          summary: true,
          status: true,
          publishedAt: true,
          seoTitle: true,
          seoDescription: true,
        },
      },
      items: {
        orderBy: {
          position: 'asc',
        },
        select: {
          document: {
            select: {
              id: true,
              kind: true,
              layoutMode: true,
              locales: {
                where: {
                  locale,
                  status: 'published',
                },
                take: 1,
                select: {
                  locale: true,
                  slug: true,
                  eyebrow: true,
                  title: true,
                  summary: true,
                  status: true,
                  publishedAt: true,
                  bodyJson: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const collectionLocale = row?.locales[0];

  if (!row || !collectionLocale) {
    return null;
  }

  const collectionItems = toCollectionArticleListItems(row.items);
  const currentItem = row.items.find(
    (item) => item.document.locales[0]?.slug === articleSlug,
  );
  const currentLocale = currentItem?.document.locales[0];

  if (!currentItem || !currentLocale) {
    return null;
  }

  return {
    collectionId: row.id,
    locale: collectionLocale.locale as DbDocsLocale,
    collectionSlug: collectionLocale.slug,
    collectionTitle: collectionLocale.title,
    collectionSummary: collectionLocale.summary,
    collectionEyebrow: collectionLocale.eyebrow,
    collectionStatus: collectionLocale.status,
    collectionPublishedAt: collectionLocale.publishedAt,
    collectionAccessRole: row.accessRole,
    articleDocumentId: currentItem.document.id,
    articleSlug: currentLocale.slug,
    articleTitle: currentLocale.title,
    articleSummary: currentLocale.summary,
    articleEyebrow: currentLocale.eyebrow,
    articlePublishedAt: currentLocale.publishedAt,
    articleBodyJson: assertDocsBody(currentLocale.bodyJson),
    articleStatus: currentLocale.status,
    articleKind: currentItem.document.kind,
    articleLayoutMode: currentItem.document.layoutMode,
    collectionItems,
    seoTitle: collectionLocale.seoTitle,
    seoDescription: collectionLocale.seoDescription,
    createdAt: currentLocale.createdAt,
    updatedAt: currentLocale.updatedAt,
  };
}
