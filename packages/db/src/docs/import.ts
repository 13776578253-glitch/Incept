import {
  DocAccessRole,
  DocKind,
  DocLayoutMode,
  DocsPublicationEventType,
  DocStatus,
} from '../../generated/client/index.js';
import { prisma } from '../client';
import type { DbDocsSection, DbDocsLocale } from './types';
import { calculateDocsReadingStats } from './reading-stats';

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
};

export type DocsImportWriteSource = {
  meta: DocsImportWriteMeta;
  body: {
    sections: DbDocsSection[];
  };
};

type DocsImportExistingTarget = {
  documentId: number;
  documentKey: string | null;
  slug: string;
  locale: DbDocsLocale;
};

async function getSystemUserId() {
  const systemUser = await prisma.user.upsert({
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
}: {
  locale: DbDocsLocale;
  slug: string;
}): Promise<DocsImportExistingTarget | null> {
  const localeRow = await prisma.docsDocumentLocale.findUnique({
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

async function findDocumentByKey(documentKey: string) {
  return prisma.docsDocument.findUnique({
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
}: {
  locale: DbDocsLocale;
  slug: string;
  expectedDocumentId?: number;
}) {
  const existingLocale = await findExistingLocaleTarget({ locale, slug });

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

function buildLocaleWriteData(source: DocsImportWriteSource) {
  return {
    locale: source.meta.locale,
    slug: source.meta.slug,
    eyebrow: source.meta.eyebrow ?? null,
    title: source.meta.title,
    summary: source.meta.summary,
    status: DocStatus.published,
    publishedAt: toPublishedDate(source.meta.publishedAt),
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
}: {
  documentId: number;
  type: DocsPublicationEventType;
  source: DocsImportWriteSource;
}) {
  const readingStats = calculateDocsReadingStats({
    title: source.meta.title,
    summary: source.meta.summary,
    body: source.body,
  });

  await prisma.docsPublicationEvent.create({
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
    select: {
      document: {
        select: {
          accessRole: true,
        },
      },
    },
  },
} as const;

async function findCollectionByKey(collectionKey: string) {
  return prisma.docsCollection.findUnique({
    where: { collectionKey },
    select: collectionImportSelect,
  });
}

async function findCollectionByLocaleSlug({
  locale,
  slug,
}: {
  locale: DbDocsLocale;
  slug: string;
}) {
  const localeRow = await prisma.docsCollectionLocale.findUnique({
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
    collection.items.some((item) => item.document.accessRole !== requiredAccessRole)
  ) {
    throw new Error(
      `All articles in collection "${source.meta.collectionSlug}" must use accessRole "${source.meta.accessRole}".`,
    );
  }
}

async function ensureCollection({
  source,
  systemUserId,
}: {
  source: DocsImportWriteSource;
  systemUserId: number;
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
  });
  const keyedCollection = collectionKey ? await findCollectionByKey(collectionKey) : null;

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
    collection = await prisma.docsCollection.update({
      where: { id: collection.id },
      data: { collectionKey },
      select: collectionImportSelect,
    });
  }

  if (!collection) {
    collection = await prisma.docsCollection.create({
      data: {
        collectionKey,
        accessRole: toDocumentAccessRole(source.meta.accessRole),
        createdById: systemUserId,
      },
      select: collectionImportSelect,
    });
  }

  assertCollectionAccessRole({ collection, source });

  await prisma.docsCollection.update({
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
            publishedAt,
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

  const localeWriteData = buildLocaleWriteData(source);

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
}: {
  source: DocsImportWriteSource;
  replace: boolean;
}) {
  const position = source.meta.position;

  if (typeof position !== 'number') {
    throw new Error('Collection article imports require a numeric position.');
  }

  const systemUserId = await getSystemUserId();
  const collectionId = await ensureCollection({
    source,
    systemUserId,
  });
  const existingDocumentByKey = source.meta.documentKey
    ? await findDocumentByKey(source.meta.documentKey)
    : null;

  const conflictingPosition = await prisma.docsCollectionItem.findUnique({
    where: {
      collectionId_position: {
        collectionId,
        position,
      },
    },
    select: {
      documentId: true,
    },
  });

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
  const hasAnotherLocaleForDocumentKey = Boolean(
    source.meta.documentKey &&
      existingDocumentByKey?.locales.some((localeRow) => localeRow.locale !== source.meta.locale),
  );

  const existingCollectionItem = targetDocumentId
    ? await prisma.docsCollectionItem.findUnique({
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

  const localeWriteData = buildLocaleWriteData(source);

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

    const updated = await prisma.docsDocument.update({
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
    const created = await prisma.docsDocument.create({
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

  await prisma.docsCollectionItem.upsert({
    where: {
      documentId,
    },
    update: {
      collectionId,
      position,
    },
    create: {
      collectionId,
      documentId,
      position,
    },
  });

  if (!targetDocumentId) {
    await createDocsPublicationEvent({
      documentId,
      type: DocsPublicationEventType.published,
      source,
    });
  } else if (isReplacingExistingLocale) {
    await createDocsPublicationEvent({
      documentId,
      type: DocsPublicationEventType.replaced,
      source,
    });
  }

  return {
    documentId,
    collectionId,
    replaced: Boolean(existingTarget),
  };
}
