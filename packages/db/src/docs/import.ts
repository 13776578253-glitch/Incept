import {
  DocAccessRole,
  DocKind,
  DocLayoutMode,
  DocsPublicationEventType,
  DocStatus,
} from '../../generated/client/index.js';
import type { Prisma } from '../../generated/client/index.js';
import { prisma } from '../client';
import type { DbDocsSection, DbDocsLocale } from './types';
import { calculateDocsReadingStats } from './reading-stats';

type DocsDbClient = Prisma.TransactionClient;
const defaultDb = prisma as unknown as DocsDbClient;

export type DocsImportRouteType = 'singleArticle' | 'collectionArticle';

export type DocsImportWriteMeta = {
  documentKey?: string;
  locale: DbDocsLocale;
  routeType: DocsImportRouteType;
  kind: 'article' | 'reference' | 'note';
  layoutMode: 'sidebar' | 'contentOnly';
  accessRole: 'guest' | 'pro' | 'private';
  isListed: boolean;
  slug: string;
  title: string;
  summary: string;
  eyebrow?: string;
  seoTitle?: string;
  seoDescription?: string;
  publishedAt: string;
  collectionKey?: string;
  collectionSlug?: string;
  collectionTitle?: string;
  collectionSummary?: string;
  collectionEyebrow?: string;
  position?: number;
  collectionNodeKey?: string;
  collectionParentNodeKey?: string;
};

export type DocsImportWriteSource = {
  meta: DocsImportWriteMeta;
  body: {
    sections: DbDocsSection[];
  };
};

export type DocsCollectionBatchChange = {
  key: string;
  type: 'article' | 'folder';
  status: 'created' | 'updated' | 'unchanged' | 'renamed' | 'removed';
};

export type DocsCollectionImportNode = {
  nodeKey: string;
  type: 'folder' | 'article';
  parentNodeKey?: string;
  position: number;
  label: string;
  locale: DbDocsLocale;
};

type DocsImportExistingTarget = {
  documentId: number;
  documentKey: string | null;
  slug: string;
  locale: DbDocsLocale;
};

async function getSystemUserId(db: DocsDbClient = defaultDb) {
  const systemUser = await db.user.upsert({
    where: { username: 'system' },
    update: { role: 'content-system' },
    create: {
      username: 'system',
      role: 'content-system',
    },
  });

  return systemUser.id;
}

async function findExistingLocaleTarget({
  locale,
  slug,
  db = defaultDb,
}: {
  locale: DbDocsLocale;
  slug: string;
  db?: DocsDbClient;
}): Promise<DocsImportExistingTarget | null> {
  const localeRow = await db.docsDocumentLocale.findUnique({
    where: {
      locale_slug: {
        locale,
        slug,
      },
    },
    select: {
      documentId: true,
      slug: true,
      locale: true,
      document: {
        select: {
          documentKey: true,
        },
      },
    },
  });

  if (!localeRow) {
    return null;
  }

  return {
    documentId: localeRow.documentId,
    documentKey: localeRow.document.documentKey,
    slug: localeRow.slug,
    locale: localeRow.locale as DbDocsLocale,
  };
}

async function findDocumentByKey(documentKey: string, db: DocsDbClient = defaultDb) {
  return db.docsDocument.findUnique({
    where: {
      documentKey,
    },
    select: {
      id: true,
      documentKey: true,
      locales: {
        select: {
          locale: true,
          slug: true,
        },
      },
    },
  });
}

async function assertLocaleSlugAvailable({
  locale,
  slug,
  expectedDocumentId,
  db = defaultDb,
}: {
  locale: DbDocsLocale;
  slug: string;
  expectedDocumentId?: number;
  db?: DocsDbClient;
}) {
  const existingLocale = await findExistingLocaleTarget({ locale, slug, db });

  if (existingLocale && existingLocale.documentId !== expectedDocumentId) {
    throw new Error(
      `The route ${locale}/${slug} is already used by another docs document.`,
    );
  }

  return existingLocale;
}

function toDocumentKind(kind: DocsImportWriteMeta['kind']) {
  return kind === 'reference'
    ? DocKind.reference
    : kind === 'note'
      ? DocKind.note
      : DocKind.article;
}

function toDocumentLayoutMode(layoutMode: DocsImportWriteMeta['layoutMode']) {
  return layoutMode === 'sidebar' ? DocLayoutMode.sidebar : DocLayoutMode.contentOnly;
}

function toDocumentAccessRole(accessRole: DocsImportWriteMeta['accessRole']) {
  return accessRole === 'pro'
    ? DocAccessRole.pro
    : accessRole === 'private'
      ? DocAccessRole.private
      : DocAccessRole.guest;
}

function toPublishedDate(publishedAt: string) {
  const parsed = new Date(publishedAt);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid publishedAt value: "${publishedAt}"`);
  }

  return parsed;
}

function buildSidebarJson(meta: DocsImportWriteMeta) {
  if (meta.layoutMode !== 'sidebar' || meta.routeType !== 'singleArticle') {
    return { groups: [] };
  }

  return {
    groups: [
      {
        id: `article-${meta.slug}`,
        label: meta.title,
        defaultOpen: true,
        items: [],
      },
    ],
  };
}

function buildLocaleWriteData(
  source: DocsImportWriteSource,
  publishedAt = toPublishedDate(source.meta.publishedAt),
) {
  return {
    locale: source.meta.locale,
    slug: source.meta.slug,
    eyebrow: source.meta.eyebrow ?? null,
    title: source.meta.title,
    summary: source.meta.summary,
    status: DocStatus.published,
    publishedAt,
    bodyJson: source.body,
    sidebarJson: buildSidebarJson(source.meta),
    seoTitle: source.meta.seoTitle ?? null,
    seoDescription: source.meta.seoDescription ?? null,
  };
}

// 创建文档发布事件
async function createDocsPublicationEvent({
  documentId,
  type,
  source,
  db = defaultDb,
}: {
  documentId: number;
  type: DocsPublicationEventType;
  source: DocsImportWriteSource;
  db?: DocsDbClient;
}) {
  const readingStats = calculateDocsReadingStats({
    title: source.meta.title,
    summary: source.meta.summary,
    body: source.body,
  });

  await db.docsPublicationEvent.create({
    data: {
      documentId,
      type,
      locale: source.meta.locale,
      occurredAt:
        type === DocsPublicationEventType.published
          ? toPublishedDate(source.meta.publishedAt)
          : new Date(),
      writingUnits: readingStats.writingUnits,
    },
  });
}

const collectionImportSelect = {
  id: true,
  collectionKey: true,
  accessRole: true,
  items: {
    where: { isActive: true },
    select: {
      document: {
        select: {
          accessRole: true,
        },
      },
    },
  },
} as const;

async function findCollectionByKey(collectionKey: string, db: DocsDbClient = defaultDb) {
  return db.docsCollection.findUnique({
    where: { collectionKey },
    select: collectionImportSelect,
  });
}

async function findCollectionByLocaleSlug({
  locale,
  slug,
  db = defaultDb,
}: {
  locale: DbDocsLocale;
  slug: string;
  db?: DocsDbClient;
}) {
  const localeRow = await db.docsCollectionLocale.findUnique({
    where: {
      locale_slug: {
        locale,
        slug,
      },
    },
    select: {
      collection: {
        select: collectionImportSelect,
      },
    },
  });

  return localeRow?.collection ?? null;
}

function assertCollectionAccessRole({
  collection,
  source,
}: {
  collection: Awaited<ReturnType<typeof findCollectionByKey>>;
  source: DocsImportWriteSource;
}) {
  if (!collection) {
    return;
  }

  const requiredAccessRole = toDocumentAccessRole(source.meta.accessRole);

  if (
    collection.accessRole !== requiredAccessRole ||
    collection.items.some(
      (item) => item.document && item.document.accessRole !== requiredAccessRole,
    )
  ) {
    throw new Error(
      `All articles in collection "${source.meta.collectionSlug}" must use accessRole "${source.meta.accessRole}".`,
    );
  }
}

async function ensureCollection({
  source,
  systemUserId,
  db = defaultDb,
}: {
  source: DocsImportWriteSource;
  systemUserId: number;
  db?: DocsDbClient;
}) {
  const collectionSlug = source.meta.collectionSlug;
  const collectionTitle = source.meta.collectionTitle;
  const collectionKey = source.meta.collectionKey;
  const publishedAt = toPublishedDate(source.meta.publishedAt);

  if (!collectionSlug || !collectionTitle) {
    throw new Error('Collection articles require collectionSlug and collectionTitle.');
  }

  const localeCollection = await findCollectionByLocaleSlug({
    locale: source.meta.locale,
    slug: collectionSlug,
    db,
  });
  const keyedCollection = collectionKey ? await findCollectionByKey(collectionKey, db) : null;

  let collection = keyedCollection ?? localeCollection;

  if (collectionKey && keyedCollection && localeCollection && keyedCollection.id !== localeCollection.id) {
    throw new Error(
      `The collection route ${source.meta.locale}/${collectionSlug} is already used by another collection.`,
    );
  }

  if (collectionKey && !keyedCollection && localeCollection?.collectionKey) {
    throw new Error(
      `The collection route ${source.meta.locale}/${collectionSlug} is already linked to collectionKey "${localeCollection.collectionKey}".`,
    );
  }

  if (!collectionKey && localeCollection?.collectionKey) {
    throw new Error(
      `Collection "${collectionSlug}" requires its existing collectionKey "${localeCollection.collectionKey}".`,
    );
  }

  if (collectionKey && collection && !collection.collectionKey) {
    collection = await db.docsCollection.update({
      where: { id: collection.id },
      data: { collectionKey },
      select: collectionImportSelect,
    });
  }

  if (!collection) {
    collection = await db.docsCollection.create({
      data: {
        collectionKey,
        accessRole: toDocumentAccessRole(source.meta.accessRole),
        createdById: systemUserId,
      },
      select: collectionImportSelect,
    });
  }

  assertCollectionAccessRole({ collection, source });

  const existingCollectionLocale = await db.docsCollectionLocale.findUnique({
    where: {
      collectionId_locale: {
        collectionId: collection.id,
        locale: source.meta.locale,
      },
    },
    select: { publishedAt: true },
  });

  await db.docsCollection.update({
    where: { id: collection.id },
    data: {
      accessRole: toDocumentAccessRole(source.meta.accessRole),
      createdById: systemUserId,
      locales: {
        upsert: {
          where: {
            collectionId_locale: {
              collectionId: collection.id,
              locale: source.meta.locale,
            },
          },
          update: {
            slug: collectionSlug,
            eyebrow: source.meta.collectionEyebrow ?? null,
            title: collectionTitle,
            summary: source.meta.collectionSummary ?? null,
            status: DocStatus.published,
            // A collection's homepage position represents its first publication,
            // not the most recent article replacement within the collection.
            publishedAt: existingCollectionLocale?.publishedAt ?? publishedAt,
          },
          create: {
            locale: source.meta.locale,
            slug: collectionSlug,
            eyebrow: source.meta.collectionEyebrow ?? null,
            title: collectionTitle,
            summary: source.meta.collectionSummary ?? null,
            status: DocStatus.published,
            publishedAt,
          },
        },
      },
    },
  });

  return collection.id;
}

export async function importDocsArticleDraft({
  source,
  replace,
}: {
  source: DocsImportWriteSource;
  replace: boolean;
}) {
  if (source.meta.routeType === 'collectionArticle') {
    return upsertDocsCollectionArticle({ source, replace });
  }

  return upsertDocsSingleArticle({ source, replace });
}

export async function upsertDocsSingleArticle({
  source,
  replace,
}: {
  source: DocsImportWriteSource;
  replace: boolean;
}) {
  const systemUserId = await getSystemUserId();
  const existingDocumentByKey = source.meta.documentKey
    ? await findDocumentByKey(source.meta.documentKey)
    : null;
  const existingTarget = await findExistingLocaleTarget({
    locale: source.meta.locale,
    slug: source.meta.slug,
  });
  const targetDocumentId = existingDocumentByKey?.id ?? existingTarget?.documentId;
  const existingSameLocaleForKey = existingDocumentByKey?.locales.find(
    (localeRow) => localeRow.locale === source.meta.locale,
  );
  const isReplacingExistingLocale = Boolean(
    targetDocumentId &&
      replace &&
      (existingSameLocaleForKey || existingTarget?.documentId === targetDocumentId),
  );

  if (source.meta.documentKey && existingTarget && existingTarget.documentId !== targetDocumentId) {
    throw new Error(
      `The route ${source.meta.locale}/${source.meta.slug} is already used by another docs document.`,
    );
  }

  if (source.meta.documentKey && existingDocumentByKey) {
    if (existingSameLocaleForKey && !replace) {
      throw new Error(
        `A locale already exists for documentKey "${source.meta.documentKey}" and locale "${source.meta.locale}". Re-run with replace to overwrite it.`,
      );
    }

    await assertLocaleSlugAvailable({
      locale: source.meta.locale,
      slug: source.meta.slug,
      expectedDocumentId: existingDocumentByKey.id,
    });
  }

  if (!existingDocumentByKey && existingTarget && !replace) {
    throw new Error(
      `An article already exists for ${source.meta.locale}/${source.meta.slug}. Re-run with replace to overwrite it.`,
    );
  }

  const existingLocale = targetDocumentId
    ? await prisma.docsDocumentLocale.findUnique({
        where: {
          documentId_locale: {
            documentId: targetDocumentId,
            locale: source.meta.locale,
          },
        },
        select: { publishedAt: true },
      })
    : null;
  const localeWriteData = buildLocaleWriteData(
    source,
    existingLocale?.publishedAt ?? toPublishedDate(source.meta.publishedAt),
  );

  if (targetDocumentId) {
    const document = await prisma.docsDocument.update({
      where: { id: targetDocumentId },
      data: {
        documentKey: source.meta.documentKey,
        kind: toDocumentKind(source.meta.kind),
        layoutMode: toDocumentLayoutMode(source.meta.layoutMode),
        accessRole: toDocumentAccessRole(source.meta.accessRole),
        isListed: source.meta.isListed,
        createdById: systemUserId,
        locales: {
          deleteMany: {
            locale: source.meta.locale,
          },
          create: localeWriteData,
        },
      },
      select: {
        id: true,
      },
    });

    if (isReplacingExistingLocale) {
      await createDocsPublicationEvent({
        documentId: document.id,
        type: DocsPublicationEventType.replaced,
        source,
      });
    }

    return {
      documentId: document.id,
      replaced: true,
    };
  }

  const document = await prisma.docsDocument.create({
    data: {
      documentKey: source.meta.documentKey,
      kind: toDocumentKind(source.meta.kind),
      layoutMode: toDocumentLayoutMode(source.meta.layoutMode),
      accessRole: toDocumentAccessRole(source.meta.accessRole),
      isListed: source.meta.isListed,
      createdById: systemUserId,
      locales: {
        create: localeWriteData,
      },
    },
    select: {
      id: true,
    },
  });

  await createDocsPublicationEvent({
    documentId: document.id,
    type: DocsPublicationEventType.published,
    source,
  });

  return {
    documentId: document.id,
    replaced: false,
  };
}

export async function upsertDocsCollectionArticle({
  source,
  replace,
  db = defaultDb,
}: {
  source: DocsImportWriteSource;
  replace: boolean;
  db?: DocsDbClient;
}) {
  const position = source.meta.position;

  if (typeof position !== 'number') {
    throw new Error('Collection article imports require a numeric position.');
  }

  const systemUserId = await getSystemUserId(db);
  const collectionId = await ensureCollection({
    source,
    systemUserId,
    db,
  });
  const collectionNodeKey = source.meta.collectionNodeKey ??
    `article-${source.meta.documentKey ?? source.meta.slug}`;
  const parentNode = source.meta.collectionParentNodeKey
    ? await db.docsCollectionItem.findFirst({
        where: {
          collectionId,
          nodeKey: source.meta.collectionParentNodeKey,
          type: 'folder',
        },
        select: { id: true },
      })
    : null;

  if (source.meta.collectionParentNodeKey && !parentNode) {
    throw new Error(
      `Collection parent node "${source.meta.collectionParentNodeKey}" was not found.`,
    );
  }
  const existingDocumentByKey = source.meta.documentKey
    ? await findDocumentByKey(source.meta.documentKey, db)
    : null;

  const conflictingPosition = await db.docsCollectionItem.findFirst({
    where: { collectionId, parentId: parentNode?.id ?? null, position },
    select: {
      documentId: true,
    },
  });

  const existingTarget = await findExistingLocaleTarget({
    locale: source.meta.locale,
    slug: source.meta.slug,
    db,
  });
  const targetDocumentId = existingDocumentByKey?.id ?? existingTarget?.documentId;
  const existingSameLocaleForKey = existingDocumentByKey?.locales.find(
    (localeRow) => localeRow.locale === source.meta.locale,
  );
  const isReplacingExistingLocale = Boolean(
    targetDocumentId &&
      replace &&
      (existingSameLocaleForKey || existingTarget?.documentId === targetDocumentId),
  );
  const hasAnotherLocaleForDocumentKey = Boolean(
    source.meta.documentKey &&
      existingDocumentByKey?.locales.some((localeRow) => localeRow.locale !== source.meta.locale),
  );

  const existingCollectionItem = targetDocumentId
    ? await db.docsCollectionItem.findUnique({
        where: { documentId: targetDocumentId },
        select: {
          collectionId: true,
          position: true,
        },
      })
    : null;

  if (source.meta.documentKey && existingTarget && existingTarget.documentId !== targetDocumentId) {
    throw new Error(
      `The route ${source.meta.locale}/${source.meta.slug} is already used by another docs document.`,
    );
  }

  if (source.meta.documentKey && existingDocumentByKey) {
    if (existingSameLocaleForKey && !replace) {
      throw new Error(
        `A locale already exists for documentKey "${source.meta.documentKey}" and locale "${source.meta.locale}". Re-run with replace to overwrite it.`,
      );
    }

    await assertLocaleSlugAvailable({
      locale: source.meta.locale,
      slug: source.meta.slug,
      expectedDocumentId: existingDocumentByKey.id,
      db,
    });
  }

  if (conflictingPosition && conflictingPosition.documentId !== targetDocumentId) {
    throw new Error(
      `The collection position ${position} is already used by another article in "${source.meta.collectionSlug}".`,
    );
  }

  if (existingCollectionItem && existingCollectionItem.collectionId !== collectionId) {
    throw new Error(
      `Document "${source.meta.documentKey ?? source.meta.slug}" already belongs to another collection.`,
    );
  }

  if (
    hasAnotherLocaleForDocumentKey &&
    existingCollectionItem &&
    existingCollectionItem.position !== position
  ) {
    throw new Error(
      `All locale variants of documentKey "${source.meta.documentKey}" must use collection position ${existingCollectionItem.position}.`,
    );
  }

  const existingLocale = targetDocumentId
    ? await db.docsDocumentLocale.findUnique({
        where: {
          documentId_locale: {
            documentId: targetDocumentId,
            locale: source.meta.locale,
          },
        },
        select: { publishedAt: true },
      })
    : null;
  const localeWriteData = buildLocaleWriteData(
    source,
    existingLocale?.publishedAt ?? toPublishedDate(source.meta.publishedAt),
  );

  let documentId: number;

  if (targetDocumentId) {
    const localeAlreadyExists = source.meta.documentKey
      ? Boolean(existingSameLocaleForKey)
      : Boolean(existingTarget);

    if (localeAlreadyExists && !replace) {
      throw new Error(
        source.meta.documentKey
          ? `A locale already exists for documentKey "${source.meta.documentKey}" and locale "${source.meta.locale}". Re-run with replace to overwrite it.`
          : `An article already exists for ${source.meta.locale}/${source.meta.slug}. Re-run with replace to overwrite it.`,
      );
    }

    const updated = await db.docsDocument.update({
      where: { id: targetDocumentId },
      data: {
        documentKey: source.meta.documentKey,
        kind: toDocumentKind(source.meta.kind),
        layoutMode: toDocumentLayoutMode(source.meta.layoutMode),
        accessRole: toDocumentAccessRole(source.meta.accessRole),
        isListed: source.meta.isListed,
        createdById: systemUserId,
        locales: {
          deleteMany: {
            locale: source.meta.locale,
          },
          create: localeWriteData,
        },
      },
      select: {
        id: true,
      },
    });

    documentId = updated.id;
  } else {
    const created = await db.docsDocument.create({
      data: {
        documentKey: source.meta.documentKey,
        kind: toDocumentKind(source.meta.kind),
      layoutMode: toDocumentLayoutMode(source.meta.layoutMode),
      accessRole: toDocumentAccessRole(source.meta.accessRole),
      isListed: source.meta.isListed,
        createdById: systemUserId,
        locales: {
          create: localeWriteData,
        },
      },
      select: {
        id: true,
      },
    });

    documentId = created.id;
  }

  await db.docsCollectionItem.upsert({
    where: {
      documentId,
    },
    update: {
      collectionId,
      type: 'article',
      nodeKey: collectionNodeKey,
      parentId: parentNode?.id ?? null,
      position,
      isActive: true,
    },
    create: {
      collectionId,
      documentId,
      type: 'article',
      nodeKey: collectionNodeKey,
      parentId: parentNode?.id ?? null,
      position,
      isActive: true,
    },
  });

  if (!targetDocumentId) {
    await createDocsPublicationEvent({
      documentId,
      type: DocsPublicationEventType.published,
      source,
      db,
    });
  } else if (isReplacingExistingLocale) {
    await createDocsPublicationEvent({
      documentId,
      type: DocsPublicationEventType.replaced,
      source,
      db,
    });
  }

  return {
    documentId,
    collectionId,
    replaced: Boolean(existingTarget),
  };
}

export async function upsertDocsCollectionFolder({
  source,
  nodeKey,
  parentNodeKey,
  label,
  position,
  db = defaultDb,
}: {
  source: DocsImportWriteSource;
  nodeKey: string;
  parentNodeKey?: string;
  label: string;
  position: number;
  db?: DocsDbClient;
}) {
  const systemUserId = await getSystemUserId(db);
  const collectionId = await ensureCollection({ source, systemUserId, db });
  const parent = parentNodeKey
    ? await db.docsCollectionItem.findFirst({
        where: { collectionId, nodeKey: parentNodeKey, type: 'folder' },
        select: { id: true },
      })
    : null;

  if (parentNodeKey && !parent) {
    throw new Error(`Collection parent folder "${parentNodeKey}" was not found.`);
  }

  const existingByKey = await db.docsCollectionItem.findFirst({
    where: { collectionId, nodeKey },
    select: { id: true, type: true, documentId: true, position: true, parentId: true, locales: { where: { locale: source.meta.locale }, take: 1, select: { label: true } } },
  });

  const existingByPosition = existingByKey
    ? null
    : await db.docsCollectionItem.findFirst({
        where: {
          collectionId,
          parentId: parent?.id ?? null,
          position,
          type: 'folder',
          isActive: true,
        },
        select: { id: true, type: true, documentId: true, position: true, parentId: true, nodeKey: true, locales: { where: { locale: source.meta.locale }, take: 1, select: { label: true } } },
      });
  const existing = existingByKey ?? existingByPosition;

  if (existing?.type === 'article' || existing?.documentId) {
    throw new Error(`Collection node "${nodeKey}" is already an article.`);
  }

  const item = existing
    ? await db.docsCollectionItem.update({
        where: { id: existing.id },
        data: {
          type: 'folder',
          nodeKey,
          position,
          parentId: parent?.id ?? null,
          isActive: true,
        },
        select: { id: true },
      })
    : await db.docsCollectionItem.create({
        data: {
          collectionId,
          type: 'folder',
          nodeKey,
          position,
          parentId: parent?.id ?? null,
          isActive: true,
        },
        select: { id: true },
      });

  const existingLocale = await db.docsCollectionItemLocale.findFirst({
    where: { itemId: item.id, locale: source.meta.locale },
    select: { id: true },
  });

  if (existingLocale) {
    await db.docsCollectionItemLocale.update({
      where: { id: existingLocale.id },
      data: { label },
    });
  } else {
    await db.docsCollectionItemLocale.create({
      data: {
        itemId: item.id,
        locale: source.meta.locale,
        label,
      },
    });
  }

  return {
    collectionId,
    itemId: item.id,
    status: !existing
      ? 'created'
      : existingByPosition && existingByPosition.nodeKey !== nodeKey
        ? 'renamed'
        : existing.position === position && existing.parentId === (parent?.id ?? null) && existing.locales[0]?.label === label
          ? 'unchanged'
          : 'updated',
  } satisfies { collectionId: number; itemId: number; status: DocsCollectionBatchChange['status'] };
}

export async function previewDocsCollectionDirectory({
  sources,
  nodes,
  replace,
}: {
  sources: DocsImportWriteSource[];
  nodes: DocsCollectionImportNode[];
  replace: boolean;
}): Promise<DocsCollectionBatchChange[]> {
  const firstSource = sources[0];

  if (!firstSource?.meta.collectionKey) {
    return [
      ...nodes.map((node) => ({
        key: node.nodeKey,
        type: node.type,
        status: 'created' as const,
      })),
      ...sources.map((source) => ({
        key: source.meta.documentKey ?? source.meta.slug,
        type: 'article' as const,
        status: 'created' as const,
      })),
    ];
  }

  const collection = await prisma.docsCollection.findUnique({
    where: { collectionKey: firstSource.meta.collectionKey },
    select: {
      id: true,
      items: {
        where: { isActive: true },
        select: {
          id: true,
          nodeKey: true,
          type: true,
          parentId: true,
          position: true,
          locales: {
            where: { locale: firstSource.meta.locale },
            take: 1,
            select: { label: true },
          },
          document: {
            select: {
              id: true,
              documentKey: true,
              kind: true,
              layoutMode: true,
              accessRole: true,
              isListed: true,
              locales: {
                where: { locale: firstSource.meta.locale },
                take: 1,
                select: {
                  slug: true,
                  title: true,
                  summary: true,
                  eyebrow: true,
                  publishedAt: true,
                  bodyJson: true,
                  seoTitle: true,
                  seoDescription: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!collection) {
    return [
      ...nodes.map((node) => ({ key: node.nodeKey, type: node.type, status: 'created' as const })),
      ...sources.map((source) => ({ key: source.meta.documentKey ?? source.meta.slug, type: 'article' as const, status: 'created' as const })),
    ];
  }

  const byNodeKey = new Map(collection.items.map((item) => [item.nodeKey, item]));
  const byDocumentKey = new Map(
    collection.items
      .filter((item) => item.document?.documentKey)
      .map((item) => [item.document?.documentKey as string, item]),
  );
  const consumed = new Set<number>();
  const changes: DocsCollectionBatchChange[] = [];

  for (const node of nodes) {
    const parentId = node.parentNodeKey ? byNodeKey.get(node.parentNodeKey)?.id ?? null : null;
    const current = byNodeKey.get(node.nodeKey) ?? collection.items.find(
      (item) => item.type === node.type && item.parentId === parentId && item.position === node.position,
    );

    if (!current) {
      changes.push({ key: node.nodeKey, type: node.type, status: 'created' });
      continue;
    }

    consumed.add(current.id);
    if (node.type === 'folder') {
      const currentLabel = current.locales[0]?.label;
      changes.push({
        key: node.nodeKey,
        type: node.type,
        status: current.nodeKey !== node.nodeKey
          ? 'renamed'
          : currentLabel === node.label && current.parentId === parentId && current.position === node.position
            ? 'unchanged'
            : 'updated',
      });
      continue;
    }

    const source = sources.find((candidate) => candidate.meta.collectionNodeKey === node.nodeKey);
    const document = source?.meta.documentKey ? byDocumentKey.get(source.meta.documentKey)?.document : current.document;
    if (!source || !document?.locales[0]) {
      changes.push({ key: node.nodeKey, type: node.type, status: 'updated' });
      continue;
    }

    const locale = document.locales[0];
    const unchanged = document.documentKey === (source.meta.documentKey ?? null) &&
      document.kind === toDocumentKind(source.meta.kind) &&
      document.layoutMode === toDocumentLayoutMode(source.meta.layoutMode) &&
      document.accessRole === toDocumentAccessRole(source.meta.accessRole) &&
      document.isListed === source.meta.isListed &&
      locale.slug === source.meta.slug &&
      locale.title === source.meta.title &&
      locale.summary === source.meta.summary &&
      locale.eyebrow === (source.meta.eyebrow ?? null) &&
      locale.seoTitle === (source.meta.seoTitle ?? null) &&
      locale.seoDescription === (source.meta.seoDescription ?? null) &&
      JSON.stringify(locale.bodyJson) === JSON.stringify(source.body) &&
      current.parentId === parentId &&
      current.position === source.meta.position;

    changes.push({
      key: source.meta.documentKey ?? source.meta.slug,
      type: 'article',
      // TODO: Both branches of the replace check resolve to 'updated'; collapse this once the renamed and removed statuses are final.
      status: unchanged ? 'unchanged' : replace ? 'updated' : 'updated',
    });
  }

  if (replace) {
    for (const item of collection.items) {
      if (!consumed.has(item.id)) {
        changes.push({
          key: item.nodeKey,
          type: item.type,
          status: 'removed',
        });
      }
    }
  }

  return changes;
}

export async function importDocsCollectionDirectory({
  sources,
  nodes,
  replace,
}: {
  sources: DocsImportWriteSource[];
  nodes: DocsCollectionImportNode[];
  replace: boolean;
}) {
  if (sources.length === 0 || sources.some((source) => source.meta.routeType !== 'collectionArticle')) {
    throw new Error('Collection directory imports require at least one collectionArticle source.');
  }

  return prisma.$transaction(async (db) => {
    const firstSource = sources[0];
    const systemUserId = await getSystemUserId(db);
    const collectionId = await ensureCollection({
      source: firstSource,
      systemUserId,
      db,
    });
    const changes: DocsCollectionBatchChange[] = [];
    const documentIds: number[] = [];

    for (const folder of nodes.filter((node) => node.type === 'folder')) {
      const result = await upsertDocsCollectionFolder({
        source: sources.find((candidate) => candidate.meta.locale === folder.locale) ?? firstSource,
        nodeKey: folder.nodeKey,
        parentNodeKey: folder.parentNodeKey,
        label: folder.label,
        position: folder.position,
        db,
      });
      changes.push({ key: folder.nodeKey, type: 'folder', status: result.status });
    }

    for (const source of sources) {
      const parentNode = source.meta.collectionParentNodeKey
        ? await db.docsCollectionItem.findFirst({
            where: {
              collectionId,
              nodeKey: source.meta.collectionParentNodeKey,
              type: 'folder',
              isActive: true,
            },
            select: { id: true },
          })
        : null;
      const existingDocument = source.meta.documentKey
        ? await findDocumentByKey(source.meta.documentKey, db)
        : await findExistingLocaleTarget({
            locale: source.meta.locale,
            slug: source.meta.slug,
            db,
          });
      const existingDocumentId = existingDocument
        ? 'id' in existingDocument
          ? existingDocument.id
          : existingDocument.documentId
        : undefined;
      const existingItem = existingDocumentId
        ? await db.docsCollectionItem.findUnique({
            where: { documentId: existingDocumentId },
            select: { collectionId: true, nodeKey: true, parentId: true, position: true, isActive: true },
          })
        : null;
      const localeRow = existingDocumentId
        ? await db.docsDocumentLocale.findUnique({
            where: { documentId_locale: { documentId: existingDocumentId, locale: source.meta.locale } },
            select: { title: true, summary: true, eyebrow: true, slug: true, publishedAt: true, bodyJson: true, seoTitle: true, seoDescription: true },
          })
        : null;
      const existingDocumentDetails = existingDocumentId
        ? await db.docsDocument.findUnique({
            where: { id: existingDocumentId },
            select: { documentKey: true, kind: true, layoutMode: true, accessRole: true, isListed: true },
          })
        : null;
      const unchanged = Boolean(
        existingDocumentDetails &&
          localeRow &&
          existingItem?.collectionId === collectionId &&
          existingItem.isActive &&
          existingItem.nodeKey === (source.meta.collectionNodeKey ?? `article-${source.meta.documentKey ?? source.meta.slug}`) &&
          existingItem.parentId === (parentNode?.id ?? null) &&
          existingItem.position === source.meta.position &&
          existingDocumentDetails.documentKey === (source.meta.documentKey ?? null) &&
          existingDocumentDetails.kind === toDocumentKind(source.meta.kind) &&
          existingDocumentDetails.layoutMode === toDocumentLayoutMode(source.meta.layoutMode) &&
          existingDocumentDetails.accessRole === toDocumentAccessRole(source.meta.accessRole) &&
          existingDocumentDetails.isListed === source.meta.isListed &&
          localeRow.slug === source.meta.slug &&
          localeRow.title === source.meta.title &&
          localeRow.summary === source.meta.summary &&
          localeRow.eyebrow === (source.meta.eyebrow ?? null) &&
          localeRow.seoTitle === (source.meta.seoTitle ?? null) &&
          localeRow.seoDescription === (source.meta.seoDescription ?? null) &&
          JSON.stringify(localeRow.bodyJson) === JSON.stringify(source.body),
      );

      if (unchanged) {
        documentIds.push(existingDocumentId as number);
        changes.push({ key: source.meta.documentKey ?? source.meta.slug, type: 'article', status: 'unchanged' });
        continue;
      }

      const result = await upsertDocsCollectionArticle({ source, replace, db });
      documentIds.push(result.documentId);
      changes.push({
        key: source.meta.documentKey ?? source.meta.slug,
        type: 'article',
        status: result.replaced ? 'updated' : 'created',
      });
    }

    if (replace) {
      // TODO: nodeKey is shared across locales, so a single-locale --replace that shrinks the tree also deactivates nodes the other locale still needs; scope this removal per locale before acceptance.
      const desiredNodeKeys = new Set(nodes.map((node) => node.nodeKey));
      const activeItems = await db.docsCollectionItem.findMany({
        where: { collectionId, isActive: true },
        select: { id: true, nodeKey: true, parentId: true, type: true },
      });
      const removedIds = new Set(
        activeItems
          .filter((item) => !desiredNodeKeys.has(item.nodeKey))
          .map((item) => item.id),
      );

      let changed = true;
      while (changed) {
        changed = false;
        for (const item of activeItems) {
          if (item.parentId && removedIds.has(item.parentId) && !removedIds.has(item.id)) {
            removedIds.add(item.id);
            changed = true;
          }
        }
      }

      if (removedIds.size > 0) {
        await db.docsCollectionItem.updateMany({
          where: { id: { in: [...removedIds] } },
          data: { isActive: false },
        });
        for (const item of activeItems) {
          if (removedIds.has(item.id)) {
            changes.push({ key: item.nodeKey, type: item.type, status: 'removed' });
          }
        }
      }
    }

    return {
      collectionId,
      documentIds,
      count: documentIds.length,
      changes,
    };
  });
}
