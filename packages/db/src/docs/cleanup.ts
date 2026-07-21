import { prisma } from '../client';

export const retainedDocsDocumentKeys = [
  'first-real-single',
  'auth-and-crawling-basics',
] as const;

export type DocsTestDataCleanupPreview = {
  retainedDocuments: Array<{
    documentId: number;
    documentKey: string | null;
    accessRole: string;
    locales: Array<{
      locale: string;
      slug: string;
      title: string;
    }>;
  }>;
  testDocuments: Array<{
    documentId: number;
    kind: string;
    accessRole: string;
    locales: Array<{
      locale: string;
      slug: string;
      title: string;
    }>;
  }>;
  testCollections: Array<{
    collectionId: number;
    locales: Array<{
      locale: string;
      slug: string;
      title: string;
    }>;
    itemCount: number;
  }>;
};

export async function previewDocsTestDataCleanup(): Promise<DocsTestDataCleanupPreview> {
  const [retainedDocuments, testDocuments, testCollections] = await Promise.all([
    prisma.docsDocument.findMany({
      where: {
        documentKey: { in: [...retainedDocsDocumentKeys] },
      },
      select: {
        id: true,
        documentKey: true,
        accessRole: true,
        locales: {
          select: {
            locale: true,
            slug: true,
            title: true,
          },
          orderBy: { locale: 'asc' },
        },
      },
      orderBy: { id: 'asc' },
    }),
    prisma.docsDocument.findMany({
      where: { documentKey: null },
      select: {
        id: true,
        kind: true,
        accessRole: true,
        locales: {
          select: {
            locale: true,
            slug: true,
            title: true,
          },
          orderBy: { locale: 'asc' },
        },
      },
      orderBy: { id: 'asc' },
    }),
    prisma.docsCollection.findMany({
      where: {
        locales: {
          some: { slug: 'document-shells' },
        },
      },
      select: {
        id: true,
        locales: {
          select: {
            locale: true,
            slug: true,
            title: true,
          },
          orderBy: { locale: 'asc' },
        },
        _count: {
          select: { items: true },
        },
      },
      orderBy: { id: 'asc' },
    }),
  ]);

  const foundDocumentKeys = new Set(
    retainedDocuments
      .map((document) => document.documentKey)
      .filter((documentKey): documentKey is string => Boolean(documentKey)),
  );
  const missingDocumentKeys = retainedDocsDocumentKeys.filter(
    (documentKey) => !foundDocumentKeys.has(documentKey),
  );

  if (missingDocumentKeys.length > 0) {
    throw new Error(
      `Refusing cleanup because retained document keys are missing: ${missingDocumentKeys.join(', ')}.`,
    );
  }

  return {
    retainedDocuments: retainedDocuments.map((document) => ({
      documentId: document.id,
      documentKey: document.documentKey,
      accessRole: document.accessRole,
      locales: document.locales,
    })),
    testDocuments: testDocuments.map((document) => ({
      documentId: document.id,
      kind: document.kind,
      accessRole: document.accessRole,
      locales: document.locales,
    })),
    testCollections: testCollections.map((collection) => ({
      collectionId: collection.id,
      locales: collection.locales,
      itemCount: collection._count.items,
    })),
  };
}

export async function cleanupDocsTestData() {
  const preview = await previewDocsTestDataCleanup();
  const testDocumentIds = preview.testDocuments.map((document) => document.documentId);
  const testCollectionIds = preview.testCollections.map((collection) => collection.collectionId);

  await prisma.$transaction(async (tx) => {
    await tx.docsDocument.updateMany({
      where: {
        documentKey: { in: [...retainedDocsDocumentKeys] },
      },
      data: { accessRole: 'pro' },
    });

    if (testCollectionIds.length > 0) {
      await tx.docsCollection.deleteMany({
        where: { id: { in: testCollectionIds } },
      });
    }

    if (testDocumentIds.length > 0) {
      await tx.docsDocument.deleteMany({
        where: { id: { in: testDocumentIds } },
      });
    }
  });

  return preview;
}
