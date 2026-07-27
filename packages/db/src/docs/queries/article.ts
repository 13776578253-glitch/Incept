import { prisma } from '../../client';
import type { DbDocsArticleRecord, DbDocsLocale } from '../types';
import { assertDocsBody, assertDocsSidebar } from './shared';

// 根据 slug 和 locale 查找已发布的文档文章记录
export async function findPublishedDocsArticleBySlug({
  locale,
  slug,
}: {
  locale: DbDocsLocale;
  slug: string;
}): Promise<DbDocsArticleRecord | null> {
  const row = await prisma.docsDocument.findFirst({
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
          slug,
          status: 'published',
        },
      },
    },
    select: {
      id: true,
      kind: true,
      layoutMode: true,
      accessRole: true,
      publicationEvents: {
        orderBy: { occurredAt: 'desc' },
        take: 1,
        select: { occurredAt: true },
      },
      locales: {
        where: {
          locale,
          slug,
          status: 'published',
        },
        take: 1,
        select: {
          locale: true,
          slug: true,
          eyebrow: true,
          title: true,
          summary: true,
          status: true,
          publishedAt: true,
          bodyJson: true,
          sidebarJson: true,
          seoTitle: true,
          seoDescription: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  const localeRow = row?.locales[0];

  if (!row || !localeRow) {
    return null;
  }

  return {
    documentId: row.id,
    kind: row.kind,
    layoutMode: row.layoutMode,
    accessRole: row.accessRole,
    locale: localeRow.locale as DbDocsLocale,
    slug: localeRow.slug,
    eyebrow: localeRow.eyebrow,
    title: localeRow.title,
    summary: localeRow.summary,
    status: localeRow.status,
    publishedAt: localeRow.publishedAt,
    lastEditedAt: row.publicationEvents[0]?.occurredAt ?? localeRow.publishedAt,
    bodyJson: assertDocsBody(localeRow.bodyJson),
    sidebarJson: assertDocsSidebar(localeRow.sidebarJson),
    seoTitle: localeRow.seoTitle,
    seoDescription: localeRow.seoDescription,
    createdAt: localeRow.createdAt,
    updatedAt: localeRow.updatedAt,
  };
}

// 查询不挂载到 Docs 路由的内部文章。调用方必须自行完成访问角色校验。
export async function findPublishedUnlistedDocsArticleByDocumentKey({
  locale,
  documentKey,
}: {
  locale: DbDocsLocale;
  documentKey: string;
}): Promise<DbDocsArticleRecord | null> {
  const row = await prisma.docsDocument.findFirst({
    where: {
      documentKey,
      isListed: false,
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
      kind: true,
      layoutMode: true,
      accessRole: true,
      publicationEvents: {
        orderBy: { occurredAt: 'desc' },
        take: 1,
        select: { occurredAt: true },
      },
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
          status: true,
          publishedAt: true,
          bodyJson: true,
          sidebarJson: true,
          seoTitle: true,
          seoDescription: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  const localeRow = row?.locales[0];

  if (!row || !localeRow) {
    return null;
  }

  return {
    documentId: row.id,
    kind: row.kind,
    layoutMode: row.layoutMode,
    accessRole: row.accessRole,
    locale: localeRow.locale as DbDocsLocale,
    slug: localeRow.slug,
    eyebrow: localeRow.eyebrow,
    title: localeRow.title,
    summary: localeRow.summary,
    status: localeRow.status,
    publishedAt: localeRow.publishedAt,
    lastEditedAt: row.publicationEvents[0]?.occurredAt ?? localeRow.publishedAt,
    bodyJson: assertDocsBody(localeRow.bodyJson),
    sidebarJson: assertDocsSidebar(localeRow.sidebarJson),
    seoTitle: localeRow.seoTitle,
    seoDescription: localeRow.seoDescription,
    createdAt: localeRow.createdAt,
    updatedAt: localeRow.updatedAt,
  };
}

// 根据 slug 和 locale 查找已发布的随笔记录。随笔只允许 kind=note，避免和 docs 正文互相串路由。
export async function findPublishedNoteBySlug({
  locale,
  slug,
}: {
  locale: DbDocsLocale;
  slug: string;
}): Promise<DbDocsArticleRecord | null> {
  const row = await prisma.docsDocument.findFirst({
    where: {
      isListed: true,
      kind: 'note',
      collectionItem: {
        is: null,
      },
      locales: {
        some: {
          locale,
          slug,
          status: 'published',
        },
      },
    },
    select: {
      id: true,
      kind: true,
      layoutMode: true,
      accessRole: true,
      publicationEvents: {
        orderBy: { occurredAt: 'desc' },
        take: 1,
        select: { occurredAt: true },
      },
      locales: {
        where: {
          locale,
          slug,
          status: 'published',
        },
        take: 1,
        select: {
          locale: true,
          slug: true,
          eyebrow: true,
          title: true,
          summary: true,
          status: true,
          publishedAt: true,
          bodyJson: true,
          sidebarJson: true,
          seoTitle: true,
          seoDescription: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  const localeRow = row?.locales[0];

  if (!row || !localeRow) {
    return null;
  }

  return {
    documentId: row.id,
    kind: row.kind,
    layoutMode: row.layoutMode,
    accessRole: row.accessRole,
    locale: localeRow.locale as DbDocsLocale,
    slug: localeRow.slug,
    eyebrow: localeRow.eyebrow,
    title: localeRow.title,
    summary: localeRow.summary,
    status: localeRow.status,
    publishedAt: localeRow.publishedAt,
    lastEditedAt: row.publicationEvents[0]?.occurredAt ?? localeRow.publishedAt,
    bodyJson: assertDocsBody(localeRow.bodyJson),
    sidebarJson: assertDocsSidebar(localeRow.sidebarJson),
    seoTitle: localeRow.seoTitle,
    seoDescription: localeRow.seoDescription,
    createdAt: localeRow.createdAt,
    updatedAt: localeRow.updatedAt,
  };
}
