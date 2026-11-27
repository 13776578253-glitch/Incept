import { prisma } from '../client';
import type { DocAccessRole } from '../../generated/client/index.js';
import type { DbDocsLocale } from './types';

export type UpdatedDocsDocumentMetadata = {
  targetType: 'document';
  documentId: number;
  locale: DbDocsLocale;
  title: string;
  accessRole: DocAccessRole;
  updatedAt: Date;
};

export type UpdatedDocsCollectionMetadata = {
  targetType: 'collection';
  collectionId: number;
  locale: DbDocsLocale;
  title: string;
  accessRole: DocAccessRole;
  updatedDocumentIds: number[];
  updatedAt: Date;
};

export async function updateDocsDocumentMetadata({
  documentId,
  locale,
  title,
  accessRole,
}: {
  documentId: number;
  locale: DbDocsLocale;
  title?: string;
  accessRole?: DocAccessRole;
}): Promise<UpdatedDocsDocumentMetadata | null> {
  const trimmedTitle = title === undefined ? undefined : title.trim();
  if (trimmedTitle !== undefined && (trimmedTitle.length === 0 || trimmedTitle.length > 200)) {
    throw new Error('INVALID_DOCS_TITLE');
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.docsDocumentLocale.findUnique({
      where: {
        documentId_locale: {
          documentId,
          locale,
        },
      },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        document: {
          select: {
            id: true,
            accessRole: true,
            collectionItem: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    if (!existing) {
      return null;
    }

    let nextAccessRole = existing.document.accessRole;
    if (accessRole && accessRole !== existing.document.accessRole) {
      const updatedDoc = await tx.docsDocument.update({
        where: { id: documentId },
        data: { accessRole },
        select: { accessRole: true },
      });
      nextAccessRole = updatedDoc.accessRole;
    }

    let nextTitle = existing.title;
    let nextUpdatedAt = existing.updatedAt;
    if (trimmedTitle !== undefined && trimmedTitle !== existing.title) {
      const updatedLocale = await tx.docsDocumentLocale.update({
        where: { id: existing.id },
        data: { title: trimmedTitle },
        select: { title: true, updatedAt: true },
      });
      nextTitle = updatedLocale.title;
      nextUpdatedAt = updatedLocale.updatedAt;

      if (existing.document.collectionItem) {
        await tx.docsCollectionItemLocale.updateMany({
          where: {
            itemId: existing.document.collectionItem.id,
            locale,
          },
          data: {
            label: trimmedTitle,
          },
        });
      }
    } else if (accessRole && accessRole !== existing.document.accessRole) {
      const touchedLocale = await tx.docsDocumentLocale.update({
        where: { id: existing.id },
        data: { updatedAt: new Date() },
        select: { updatedAt: true },
      });
      nextUpdatedAt = touchedLocale.updatedAt;
    }

    return {
      targetType: 'document',
      documentId,
      locale,
      title: nextTitle,
      accessRole: nextAccessRole,
      updatedAt: nextUpdatedAt,
    };
  });
}

export async function updateDocsCollectionMetadata({
  collectionId,
  locale,
  title,
  accessRole,
  applyToArticles = false,
}: {
  collectionId: number;
  locale: DbDocsLocale;
  title?: string;
  accessRole?: DocAccessRole;
  applyToArticles?: boolean;
}): Promise<UpdatedDocsCollectionMetadata | null> {
  const trimmedTitle = title === undefined ? undefined : title.trim();
  if (trimmedTitle !== undefined && (trimmedTitle.length === 0 || trimmedTitle.length > 200)) {
    throw new Error('INVALID_DOCS_TITLE');
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.docsCollection.findUnique({
      where: { id: collectionId },
      select: {
        id: true,
        accessRole: true,
        updatedAt: true,
        locales: {
          where: { status: 'published' },
          select: {
            id: true,
            locale: true,
            title: true,
            updatedAt: true,
          },
        },
        items: {
          where: {
            isActive: true,
            documentId: { not: null },
          },
          select: {
            documentId: true,
          },
        },
      },
    });

    if (!existing) {
      return null;
    }

    const localeRow =
      existing.locales.find((row) => row.locale === locale) ??
      existing.locales.find((row) => row.locale === 'zh') ??
      existing.locales[0];

    if (!localeRow) {
      return null;
    }

    let nextAccessRole = existing.accessRole;
    let nextUpdatedAt = localeRow.updatedAt;
    if (accessRole && accessRole !== existing.accessRole) {
      const updatedCollection = await tx.docsCollection.update({
        where: { id: collectionId },
        data: { accessRole },
        select: { accessRole: true, updatedAt: true },
      });
      nextAccessRole = updatedCollection.accessRole;
      nextUpdatedAt = updatedCollection.updatedAt;
    }

    let nextTitle = localeRow.title;
    if (trimmedTitle !== undefined && trimmedTitle !== localeRow.title) {
      const updatedLocale = await tx.docsCollectionLocale.update({
        where: { id: localeRow.id },
        data: { title: trimmedTitle },
        select: { title: true, updatedAt: true },
      });
      nextTitle = updatedLocale.title;
      nextUpdatedAt = updatedLocale.updatedAt;
    }

    let updatedDocumentIds: number[] = [];
    if (applyToArticles && accessRole) {
      const documentIds = existing.items
        .map((item) => item.documentId)
        .filter((id): id is number => typeof id === 'number');
      if (documentIds.length > 0) {
        await tx.docsDocument.updateMany({
          where: { id: { in: documentIds } },
          data: { accessRole },
        });
        updatedDocumentIds = documentIds;
      }
    }

    return {
      targetType: 'collection',
      collectionId,
      locale: localeRow.locale as DbDocsLocale,
      title: nextTitle,
      accessRole: nextAccessRole,
      updatedDocumentIds,
      updatedAt: nextUpdatedAt,
    };
  });
}
