import { DocStatus } from '../../generated/client/index.js';
import { prisma } from '../client';
import { calculateDocsReadingStats } from './reading-stats';
import type { DbDocsBody } from './types';

export type DocsWritingActivityEntry = {
  documentId: number;
  occurredAt: Date;
  writingUnits: number;
};

export async function listDocsWritingActivityEntries(): Promise<DocsWritingActivityEntry[]> {
  const documents = await prisma.docsDocument.findMany({
    where: {
      locales: {
        some: {
          status: DocStatus.published,
          publishedAt: { not: null },
        },
      },
    },
    select: {
      id: true,
      locales: {
        where: {
          status: DocStatus.published,
          publishedAt: { not: null },
        },
        orderBy: { locale: 'asc' },
        select: {
          locale: true,
          title: true,
          summary: true,
          publishedAt: true,
          bodyJson: true,
        },
      },
      publicationEvents: {
        select: {
          locale: true,
          occurredAt: true,
          writingUnits: true,
        },
      },
    },
  });

  return documents.flatMap((document) => {
    const canonicalLocale =
      document.locales.find((locale) => locale.locale === 'zh') ?? document.locales[0];

    if (!canonicalLocale?.publishedAt) {
      return [];
    }

    const unitsForLocale = (locale: typeof canonicalLocale) =>
      calculateDocsReadingStats({
        title: locale.title,
        summary: locale.summary,
        body: locale.bodyJson as unknown as DbDocsBody,
      }).writingUnits;

    if (!document.publicationEvents.length) {
      return [{
        documentId: document.id,
        occurredAt: canonicalLocale.publishedAt,
        writingUnits: unitsForLocale(canonicalLocale),
      }];
    }

    return document.publicationEvents.map((event) => {
      const eventLocale = document.locales.find((locale) => locale.locale === event.locale) ?? canonicalLocale;

      return {
        documentId: document.id,
        occurredAt: event.occurredAt,
        writingUnits: event.writingUnits || unitsForLocale(eventLocale),
      };
    });
  });
}
