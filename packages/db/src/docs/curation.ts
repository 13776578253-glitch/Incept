import { Prisma } from '../../generated/client/index.js';
import { prisma } from '../client';
import type {
  DbDocsHomeCurationEntryRecord,
  DbDocsLocale,
} from './types';

function pickPreferredLocaleRow<
  T extends {
    locale: string;
    slug: string;
    title: string;
    publishedAt: Date | null;
  },
>(rows: T[]): T | undefined {
  return rows.find((row) => row.locale === 'zh') ?? rows.find((row) => row.locale === 'en') ?? rows[0];
}

function collectPublishedLocales(
  rows: Array<{ locale: string; publishedAt: Date | null }>,
): DbDocsLocale[] {
  const locales = new Set<DbDocsLocale>();
  for (const row of rows) {
    if (row.publishedAt && (row.locale === 'zh' || row.locale === 'en')) {
      locales.add(row.locale);
    }
  }
  return [...locales].sort((left, right) => (left === 'zh' ? -1 : right === 'zh' ? 1 : 0));
}

function getLatestPublishedAt(
  rows: Array<{ publishedAt: Date | null }>,
): Date | null {
  let latest: Date | null = null;
  for (const row of rows) {
    if (row.publishedAt && (!latest || row.publishedAt.getTime() > latest.getTime())) {
      latest = row.publishedAt;
    }
  }
  return latest;
}

export async function listDocsHomeCurationEntries(): Promise<DbDocsHomeCurationEntryRecord[]> {
  const [documentRows, collectionRows] = await Promise.all([
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
            status: 'published',
          },
        },
      },
      select: {
        id: true,
        accessRole: true,
        isCurated: true,
        locales: {
          where: {
            status: 'published',
          },
          select: {
            locale: true,
            slug: true,
            title: true,
            publishedAt: true,
          },
        },
      },
    }),
    prisma.docsCollection.findMany({
      where: {
        locales: {
          some: {
            status: 'published',
          },
        },
      },
      select: {
        id: true,
        accessRole: true,
        isCurated: true,
        locales: {
          where: {
            status: 'published',
          },
          select: {
            locale: true,
            slug: true,
            title: true,
            publishedAt: true,
          },
        },
        items: {
          where: {
            isActive: true,
          },
          select: {
            document: {
              select: {
                locales: {
                  where: {
                    status: 'published',
                  },
                  select: {
                    locale: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const singleEntries = documentRows.flatMap<DbDocsHomeCurationEntryRecord>((row) => {
    const publishedLocales = row.locales.filter((localeRow) => Boolean(localeRow.publishedAt));
    const displayLocale = pickPreferredLocaleRow(publishedLocales);
    const latestPublishedAt = getLatestPublishedAt(publishedLocales);

    if (!displayLocale || !latestPublishedAt) {
      return [];
    }

    return [
      {
        entryType: 'singleArticle',
        targetId: row.id,
        title: displayLocale.title,
        slug: displayLocale.slug,
        locales: collectPublishedLocales(publishedLocales),
        accessRole: row.accessRole,
        isCurated: row.isCurated,
        publishedAt: latestPublishedAt,
      },
    ];
  });

  const collectionEntries = collectionRows.flatMap<DbDocsHomeCurationEntryRecord>((row) => {
    const publishedLocales = row.locales.filter((localeRow) => Boolean(localeRow.publishedAt));
    const hasPublishedArticle = row.items.some((item) => (item.document?.locales.length ?? 0) > 0);
    const displayLocale = pickPreferredLocaleRow(publishedLocales);
    const latestPublishedAt = getLatestPublishedAt(publishedLocales);

    if (!hasPublishedArticle || !displayLocale || !latestPublishedAt) {
      return [];
    }

    return [
      {
        entryType: 'collection',
        targetId: row.id,
        title: displayLocale.title,
        slug: displayLocale.slug,
        locales: collectPublishedLocales(publishedLocales),
        accessRole: row.accessRole,
        isCurated: row.isCurated,
        publishedAt: latestPublishedAt,
      },
    ];
  });

  return [...singleEntries, ...collectionEntries].sort(
    (left, right) => right.publishedAt.getTime() - left.publishedAt.getTime(),
  );
}

export async function setDocsHomeEntryCurated({
  entryType,
  targetId,
  isCurated,
}: {
  entryType: 'singleArticle' | 'collection';
  targetId: number;
  isCurated: boolean;
}): Promise<{
  entryType: 'singleArticle' | 'collection';
  targetId: number;
  isCurated: boolean;
} | null> {
  try {
    if (entryType === 'collection') {
      const updated = await prisma.docsCollection.update({
        where: { id: targetId },
        data: { isCurated },
        select: { id: true, isCurated: true },
      });

      return {
        entryType: 'collection',
        targetId: updated.id,
        isCurated: updated.isCurated,
      };
    }

    const updated = await prisma.docsDocument.update({
      where: { id: targetId },
      data: { isCurated },
      select: { id: true, isCurated: true },
    });

    return {
      entryType: 'singleArticle',
      targetId: updated.id,
      isCurated: updated.isCurated,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return null;
    }
    throw error;
  }
}
