import { expect, it } from 'vitest';
import {
  importDocsCollectionDirectory,
  type DocsImportWriteSource,
} from '@incept/db/docs';

type DocsCollectionImportNode = Parameters<typeof importDocsCollectionDirectory>[0]['nodes'][number];

type CollectionItemRow = {
  id: number;
  collectionId: number;
  documentId: number | null;
  parentId: number | null;
  type: 'folder' | 'article';
  nodeKey: string;
  isActive: boolean;
  position: number;
};

type DocumentRow = {
  id: number;
  documentKey: string | null;
  kind: 'article' | 'reference' | 'note';
  layoutMode: 'sidebar' | 'contentOnly';
  accessRole: 'guest' | 'pro' | 'private';
  isListed: boolean;
  locales: Array<{
    documentId: number;
    locale: 'en' | 'zh';
    slug: string;
    title: string;
    summary: string | null;
    eyebrow: string | null;
    publishedAt: Date | null;
    bodyJson: unknown;
    seoTitle: string | null;
    seoDescription: string | null;
  }>;
};

function makeSource(
  documentKey: string,
  slug: string,
  position: number,
  nodeKey = `article-${documentKey}`,
): DocsImportWriteSource {
  return {
    meta: {
      documentKey,
      locale: 'zh',
      routeType: 'collectionArticle',
      kind: 'article',
      layoutMode: 'sidebar',
      accessRole: 'private',
      isListed: true,
      slug,
      title: `Title ${slug}`,
      summary: `Summary ${slug}`,
      publishedAt: '2026-11-15T00:00:00.000Z',
      collectionKey: 'nlp-text-classification',
      collectionSlug: 'nlp-text-classification',
      collectionTitle: 'NLP Study Notes',
      position,
      collectionNodeKey: nodeKey,
    },
    body: { sections: [] },
  };
}

function createFakeDb(initial: {
  items: CollectionItemRow[];
  documents: DocumentRow[];
}) {
  let nextItemId = 100;
  let nextDocId = 200;
  const items = initial.items.map((item) => ({ ...item }));
  const documents = initial.documents.map((doc) => ({
    ...doc,
    locales: doc.locales.map((locale) => ({ ...locale })),
  }));
  const collections = [
    {
      id: 7,
      collectionKey: 'nlp-text-classification',
      accessRole: 'private' as const,
      locales: [
        {
          id: 1,
          collectionId: 7,
          locale: 'zh',
          slug: 'nlp-text-classification',
          title: 'NLP Study Notes',
          summary: null,
          eyebrow: null,
          status: 'published',
          publishedAt: new Date(),
          seoTitle: null,
          seoDescription: null,
        },
      ],
    },
  ];

  const db = {
    user: {
      upsert: async () => ({ id: 1, username: 'system' }),
    },
    docsCollection: {
      findUnique: async ({ where }: { where: { collectionKey?: string; id?: number } }) => {
        const col = collections.find((candidate) =>
          where.collectionKey
            ? candidate.collectionKey === where.collectionKey
            : candidate.id === where.id,
        );
        if (!col) return null;
        return {
          ...col,
          items: items
            .filter((item) => item.collectionId === col.id && item.isActive)
            .map((item) => ({
              ...item,
              document: documents.find((doc) => doc.id === item.documentId) ?? null,
            })),
        };
      },
      update: async ({ where }: { where: { id: number } }) => ({ id: where.id }),
    },
    docsCollectionLocale: {
      findUnique: async ({
        where,
      }: {
        where: { locale_slug?: { locale: string; slug: string }; collectionId_locale?: { collectionId: number; locale: string } };
      }) => {
        for (const col of collections) {
          const hit = col.locales.find((localeRow) =>
            where.locale_slug
              ? localeRow.locale === where.locale_slug.locale &&
                localeRow.slug === where.locale_slug.slug
              : localeRow.collectionId === where.collectionId_locale?.collectionId &&
                localeRow.locale === where.collectionId_locale?.locale,
          );
          if (hit) return { ...hit, collection: col };
        }
        return null;
      },
    },
    docsDocument: {
      findUnique: async ({
        where,
      }: {
        where: { id?: number; documentKey?: string };
      }) => {
        const doc = documents.find((candidate) =>
          where.id !== undefined
            ? candidate.id === where.id
            : candidate.documentKey === where.documentKey,
        );
        return doc ? { ...doc } : null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: number };
        data: {
          locales?: {
            deleteMany?: { locale: string };
            create?: Omit<DocumentRow['locales'][number], 'documentId'>;
          };
        };
      }) => {
        const doc = documents.find((candidate) => candidate.id === where.id);
        if (!doc) throw new Error('Document not found');
        if (data.locales?.deleteMany) {
          doc.locales = doc.locales.filter(
            (localeRow) => localeRow.locale !== data.locales?.deleteMany?.locale,
          );
        }
        if (data.locales?.create) {
          doc.locales.push({ ...data.locales.create, documentId: doc.id });
        }
        return { id: doc.id };
      },
      create: async ({ data }: { data: { documentKey?: string; locales?: { create?: Omit<DocumentRow['locales'][number], 'documentId'> } } }) => {
        const id = nextDocId++;
        const doc: DocumentRow = {
          id,
          documentKey: data.documentKey ?? null,
          kind: 'article',
          layoutMode: 'sidebar',
          accessRole: 'private',
          isListed: true,
          locales: data.locales?.create ? [{ ...data.locales.create, documentId: id }] : [],
        };
        documents.push(doc);
        return { id };
      },
    },
    docsDocumentLocale: {
      findUnique: async ({
        where,
      }: {
        where: {
          locale_slug?: { locale: string; slug: string };
          documentId_locale?: { documentId: number; locale: string };
        };
      }) => {
        for (const doc of documents) {
          const hit = doc.locales.find((localeRow) =>
            where.locale_slug
              ? localeRow.locale === where.locale_slug.locale &&
                localeRow.slug === where.locale_slug.slug
              : localeRow.documentId === where.documentId_locale?.documentId &&
                localeRow.locale === where.documentId_locale?.locale,
          );
          if (hit) return { ...hit, document: doc };
        }
        return null;
      },
    },
    docsPublicationEvent: {
      create: async () => ({ id: 1 }),
    },
    docsCollectionItem: {
      findMany: async ({
        where,
      }: {
        where: { collectionId: number; isActive?: boolean };
      }) =>
        items.filter(
          (item) =>
            item.collectionId === where.collectionId &&
            (where.isActive === undefined || item.isActive === where.isActive),
        ),
      findFirst: async ({
        where,
      }: {
        where: {
          collectionId: number;
          parentId?: number | null;
          position?: number;
          isActive?: boolean;
          nodeKey?: string;
          type?: 'folder' | 'article';
        };
      }) =>
        items.find(
          (item) =>
            item.collectionId === where.collectionId &&
            (where.parentId === undefined || item.parentId === where.parentId) &&
            (where.position === undefined || item.position === where.position) &&
            (where.isActive === undefined || item.isActive === where.isActive) &&
            (where.nodeKey === undefined || item.nodeKey === where.nodeKey) &&
            (where.type === undefined || item.type === where.type),
        ) ?? null,
      findUnique: async ({ where }: { where: { documentId: number } }) =>
        items.find((item) => item.documentId === where.documentId) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: { in: number[] } };
        data: Partial<CollectionItemRow>;
      }) => {
        let count = 0;
        for (const item of items) {
          if (where.id.in.includes(item.id)) {
            Object.assign(item, data);
            count += 1;
          }
        }
        return { count };
      },
      upsert: async ({
        where,
        update,
        create,
      }: {
        where: { documentId: number };
        update: Partial<CollectionItemRow>;
        create: Omit<CollectionItemRow, 'id'>;
      }) => {
        const existing = items.find((item) => item.documentId === where.documentId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const created = { id: nextItemId++, ...create };
        items.push(created);
        return created;
      },
    },
  };

  return { db: db as unknown as Parameters<typeof importDocsCollectionDirectory>[0]['db'], items };
}

it('moves an article from a removed folder to root position 1 during replace import', async () => {
  const { db, items } = createFakeDb({
    items: [
      {
        id: 32,
        collectionId: 7,
        documentId: null,
        parentId: null,
        type: 'folder',
        nodeKey: 'folder-root-01',
        isActive: true,
        position: 1,
      },
      {
        id: 33,
        collectionId: 7,
        documentId: 39,
        parentId: 32,
        type: 'article',
        nodeKey: 'article-nlp-m0-ml-math-foundations',
        isActive: true,
        position: 1,
      },
    ],
    documents: [
      {
        id: 39,
        documentKey: 'nlp-m0-ml-math-foundations',
        kind: 'article',
        layoutMode: 'sidebar',
        accessRole: 'private',
        isListed: true,
        locales: [
          {
            documentId: 39,
            locale: 'zh',
            slug: 'ml-math-foundations',
            title: 'Old Title',
            summary: 'Old Summary',
            eyebrow: null,
            publishedAt: new Date('2026-11-15T00:00:00.000Z'),
            bodyJson: { sections: [{ id: 'old' }] },
            seoTitle: null,
            seoDescription: null,
          },
        ],
      },
    ],
  });

  const nodes: DocsCollectionImportNode[] = [
    {
      nodeKey: 'article-nlp-m0-ml-math-foundations',
      type: 'article',
      position: 1,
      label: 'ml-math-foundations.docs.md',
      locale: 'zh',
    },
  ];
  const result = await importDocsCollectionDirectory({
    sources: [makeSource('nlp-m0-ml-math-foundations', 'ml-math-foundations', 1)],
    nodes,
    replace: true,
    db,
  });

  expect(result.changes).toEqual([
    { key: 'nlp-m0-ml-math-foundations', type: 'article', status: 'updated' },
    { key: 'folder-root-01', type: 'folder', status: 'removed' },
  ]);
  expect(items.find((item) => item.id === 32)?.isActive).toBe(false);
  expect(items.find((item) => item.id === 33)).toMatchObject({
    parentId: null,
    position: 1,
    isActive: true,
  });
});

it('swaps sibling article positions cleanly inside directory import', async () => {
  const { db, items } = createFakeDb({
    items: [
      {
        id: 1,
        collectionId: 7,
        documentId: 10,
        parentId: null,
        type: 'article',
        nodeKey: 'article-doc-a',
        isActive: true,
        position: 1,
      },
      {
        id: 2,
        collectionId: 7,
        documentId: 11,
        parentId: null,
        type: 'article',
        nodeKey: 'article-doc-b',
        isActive: true,
        position: 2,
      },
    ],
    documents: [
      {
        id: 10,
        documentKey: 'doc-a',
        kind: 'article',
        layoutMode: 'sidebar',
        accessRole: 'private',
        isListed: true,
        locales: [
          {
            documentId: 10,
            locale: 'zh',
            slug: 'doc-a',
            title: 'Title doc-a',
            summary: 'Summary doc-a',
            eyebrow: null,
            publishedAt: new Date('2026-11-15T00:00:00.000Z'),
            bodyJson: { sections: [] },
            seoTitle: null,
            seoDescription: null,
          },
        ],
      },
      {
        id: 11,
        documentKey: 'doc-b',
        kind: 'article',
        layoutMode: 'sidebar',
        accessRole: 'private',
        isListed: true,
        locales: [
          {
            documentId: 11,
            locale: 'zh',
            slug: 'doc-b',
            title: 'Title doc-b',
            summary: 'Summary doc-b',
            eyebrow: null,
            publishedAt: new Date('2026-11-15T00:00:00.000Z'),
            bodyJson: { sections: [] },
            seoTitle: null,
            seoDescription: null,
          },
        ],
      },
    ],
  });

  const nodes: DocsCollectionImportNode[] = [
    { nodeKey: 'article-doc-b', type: 'article', position: 1, label: 'b', locale: 'zh' },
    { nodeKey: 'article-doc-a', type: 'article', position: 2, label: 'a', locale: 'zh' },
  ];
  await importDocsCollectionDirectory({
    sources: [
      makeSource('doc-b', 'doc-b', 1),
      makeSource('doc-a', 'doc-a', 2),
    ],
    nodes,
    replace: true,
    db,
  });

  expect(items.find((item) => item.id === 1)?.position).toBe(2);
  expect(items.find((item) => item.id === 2)?.position).toBe(1);
});
