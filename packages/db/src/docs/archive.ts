import { DocStatus } from '../../generated/client/index.js';
import { prisma } from '../client';
import type { DbDocsLocale } from './types';

export type DocsArchiveArticleLocaleResult = {
  documentId: number;
  locale: DbDocsLocale;
  slug: string;
  title: string;
  previousStatus: string;
  archived: boolean;
  alreadyArchived: boolean;
};

export async function findDocsArticleLocaleForArchive({
  locale,
  slug,
}: {
  locale: DbDocsLocale;
  slug: string;
}) {
  return prisma.docsDocumentLocale.findUnique({
    where: {
      locale_slug: {
        locale,
        slug,
      },
    },
    select: {
      id: true,
      documentId: true,
      locale: true,
      slug: true,
      title: true,
      status: true,
      updatedAt: true,
    },
  });
}

export async function archiveDocsArticleLocale({
  locale,
  slug,
}: {
  locale: DbDocsLocale;
  slug: string;
}): Promise<DocsArchiveArticleLocaleResult> {
  const existing = await findDocsArticleLocaleForArchive({ locale, slug });

  if (!existing) {
    throw new Error(`No docs article locale was found for ${locale}/${slug}.`);
  }

  if (existing.status === DocStatus.archived) {
    return {
      documentId: existing.documentId,
      locale: existing.locale as DbDocsLocale,
      slug: existing.slug,
      title: existing.title,
      previousStatus: existing.status,
      archived: true,
      alreadyArchived: true,
    };
  }

  const archived = await prisma.docsDocumentLocale.update({
    where: {
      id: existing.id,
    },
    data: {
      status: DocStatus.archived,
    },
    select: {
      documentId: true,
      locale: true,
      slug: true,
      title: true,
    },
  });

  return {
    documentId: archived.documentId,
    locale: archived.locale as DbDocsLocale,
    slug: archived.slug,
    title: archived.title,
    previousStatus: existing.status,
    archived: true,
    alreadyArchived: false,
  };
}
