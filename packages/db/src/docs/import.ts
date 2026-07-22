import {
  DocAccessRole,
  DocKind,
  DocLayoutMode,
  DocStatus,
} from '../../generated/client/index.js';
import { prisma } from '../client';
import type { DbDocsSection, DbDocsLocale } from './types';

export type DocsImportRouteType = 'singleArticle' | 'collectionArticle';

export type DocsImportWriteMeta = {
  documentKey?: string;
  locale: DbDocsLocale;
  routeType: DocsImportRouteType;
  kind: 'article' | 'reference' | 'note';
  layoutMode: 'sidebar' | 'contentOnly';
  accessRole: 'guest' | 'pro' | 'private';
  slug: string;
  title: string;
  summary: string;
  eyebrow?: string;
  seoTitle?: string;
  seoDescription?: string;
  publishedAt: string;
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

async function ensureCollection({
  source,
  systemUserId,
}: {
  source: DocsImportWriteSource;
  systemUserId: number;
}) {
  const collectionSlug = source.meta.collectionSlug;
  const collectionTitle = source.meta.collectionTitle;
  const publishedAt = toPublishedDate(source.meta.publishedAt);

  if (!collectionSlug || !collectionTitle) {
    throw new Error('Collection articles require collectionSlug and collectionTitle.');
  }

  const existingLocale = await prisma.docsCollectionLocale.findUnique({
    where: {
      locale_slug: {
        locale: source.meta.locale,
        slug: collectionSlug,
      },
    },
    select: {
      collectionId: true,
    },
  });

  if (existingLocale) {
    const existingCollection = await prisma.docsCollection.findUnique({
      where: { id: existingLocale.collectionId },
      select: {
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
      },
    });
    const requiredAccessRole = toDocumentAccessRole(source.meta.accessRole);

    if (
      !existingCollection ||
      existingCollection.accessRole !== requiredAccessRole ||
      existingCollection.items.some(
        (item) => item.document.accessRole !== requiredAccessRole,
      )
    ) {
      throw new Error(
        `All articles in collection "${collectionSlug}" must use accessRole "${source.meta.accessRole}".`,
      );
    }

    await prisma.docsCollection.update({
      where: { id: existingLocale.collectionId },
      data: {
        accessRole: requiredAccessRole,
        createdById: systemUserId,
        locales: {
          upsert: {
            where: {
              collectionId_locale: {
                collectionId: existingLocale.collectionId,
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

    return existingLocale.collectionId;
  }

  const createdCollection = await prisma.docsCollection.create({
    data: {
      accessRole: toDocumentAccessRole(source.meta.accessRole),
      createdById: systemUserId,
      locales: {
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
    select: {
      id: true,
    },
  });

  return createdCollection.id;
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
      createdById: systemUserId,
      locales: {
        create: localeWriteData,
      },
    },
    select: {
      id: true,
    },
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

  return {
    documentId,
    collectionId,
    replaced: Boolean(existingTarget),
  };
}
