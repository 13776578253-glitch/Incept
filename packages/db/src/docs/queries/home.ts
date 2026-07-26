import { prisma } from '../../client';
import type {
  DbDocsHomeCollectionRecord,
  DbDocsHomeEntryRecord,
  DbDocsLocale,
} from '../types';
import { comparePublishedAtDesc } from './shared';

// 将数据库查询结果转换为首页文档集合记录
function toHomeCollectionRecord({
  locale,
  row,
}: {
  locale: DbDocsLocale;
  row: {
    id: number;
    accessRole: DbDocsHomeCollectionRecord['accessRole'];
    locales: Array<{
      locale: string;
      slug: string;
      eyebrow: string | null;
      title: string;
      summary: string | null;
      publishedAt: Date | null;
    }>;
    items: Array<{
      document: {
        accessRole: DbDocsHomeCollectionRecord['firstArticleAccessRole'];
        locales: Array<{
          slug: string;
        }>;
      };
    }>;
  };
}): DbDocsHomeEntryRecord | null {
  const localeRow = row.locales[0];

  if (!localeRow?.publishedAt) {
    return null;
  }

  const firstArticle = row.items.find((item) => item.document.locales[0]?.slug);
  const firstArticleSlug = firstArticle?.document.locales[0]?.slug;

  if (!firstArticleSlug) {
    return null;
  }

  return {
    entryType: 'collection',
    collectionId: row.id,
    locale,
    collectionSlug: localeRow.slug,
    title: localeRow.title,
    summary: localeRow.summary,
    publishedAt: localeRow.publishedAt,
    requiredRole: row.accessRole,
    eyebrow: localeRow.eyebrow,
    accessRole: row.accessRole,
    firstArticleSlug,
    firstArticleAccessRole: firstArticle.document.accessRole,
  };
}

// 查询指定 locale 的已发布文档主页条目，包括单篇文章和集合，并转换为前端使用的主页条目记录
export async function listPublishedDocsHomeEntries({
  locale,
}: {
  locale: DbDocsLocale;
}): Promise<DbDocsHomeEntryRecord[]> {
  const [standaloneRows, collectionRows] = await Promise.all([
    prisma.docsDocument.findMany({
      where: {
        isListed: true,
        kind: {
          not: 'note',
        },
        collectionItem: {
          is: null,
        },
        locales: {
          some: {
            locale,
            status: 'published',
          },
        },
      },
      select: {
        id: true,
        accessRole: true,
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
            publishedAt: true,
          },
        },
      },
    }),
    prisma.docsCollection.findMany({
      where: {
        locales: {
          some: {
            locale,
            status: 'published',
          },
        },
      },
      select: {
        id: true,
        accessRole: true,
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
            publishedAt: true,
          },
        },
        items: {
          orderBy: {
            position: 'asc',
          },
          select: {
            document: {
              select: {
                accessRole: true,
                locales: {
                  where: {
                    locale,
                    status: 'published',
                  },
                  take: 1,
                  select: {
                    slug: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const standaloneEntries = standaloneRows.flatMap((row) => {
    const localeRow = row.locales[0];

    if (!localeRow?.publishedAt) {
      return [];
    }

    return [
      {
        entryType: 'singleArticle' as const,
        documentId: row.id,
        locale: localeRow.locale as DbDocsLocale,
        slug: localeRow.slug,
        title: localeRow.title,
        summary: localeRow.summary,
        publishedAt: localeRow.publishedAt,
        requiredRole: row.accessRole,
        eyebrow: localeRow.eyebrow,
        accessRole: row.accessRole,
      },
    ];
  });

  const collectionEntries = collectionRows.flatMap((row) => {
    const entry = toHomeCollectionRecord({ locale, row });
    return entry ? [entry] : [];
  });

  return [...standaloneEntries, ...collectionEntries].sort(comparePublishedAtDesc);
}

// 查询指定 locale 的已发布随笔条目。随笔复用 docs 内容结构，但通过 DocKind.note 与正式 docs 分开。
export async function listPublishedNotesHomeEntries({
  locale,
}: {
  locale: DbDocsLocale;
}): Promise<DbDocsHomeEntryRecord[]> {
  const rows = await prisma.docsDocument.findMany({
    where: {
      isListed: true,
      kind: 'note',
      collectionItem: {
        is: null,
      },
      locales: {
        some: {
          locale,
          status: 'published',
        },
      },
    },
    select: {
      id: true,
      accessRole: true,
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
          publishedAt: true,
        },
      },
    },
  });

  return rows
    .flatMap((row) => {
      const localeRow = row.locales[0];

      if (!localeRow?.publishedAt) {
        return [];
      }

      return [
        {
          entryType: 'singleArticle' as const,
          documentId: row.id,
          locale: localeRow.locale as DbDocsLocale,
          slug: localeRow.slug,
          title: localeRow.title,
          summary: localeRow.summary,
          publishedAt: localeRow.publishedAt,
          requiredRole: row.accessRole,
          eyebrow: localeRow.eyebrow,
          accessRole: row.accessRole,
        },
      ];
    })
    .sort(comparePublishedAtDesc);
}
