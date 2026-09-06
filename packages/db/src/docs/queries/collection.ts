import { prisma } from '../../client';
import type {
  DbDocsCollectionArticleListItem,
  DbDocsCollectionNavigationNode,
  DbDocsCollectionRecord,
  DbDocsLocale,
} from '../types';
import { assertDocsBody } from './shared';

// 数据库查询结果转换
function toCollectionArticleListItems(
  items: Array<{
    document: {
      id: number;
      accessRole: DbDocsCollectionArticleListItem['accessRole'];
      locales: Array<{
        locale: string;
        slug: string;
        title: string;
        summary: string | null;
        publishedAt: Date | null;
      }>;
    } | null;
  }>,
): DbDocsCollectionArticleListItem[] {
  return items.flatMap((item) => {
    if (!item.document) {
      return [];
    }

    const localeRow = item.document.locales[0];

    if (!localeRow) {
      return [];
    }

    return [
      {
        documentId: item.document.id,
        accessRole: item.document.accessRole,
        locale: localeRow.locale as DbDocsLocale,
        slug: localeRow.slug,
        title: localeRow.title,
        summary: localeRow.summary,
        publishedAt: localeRow.publishedAt,
      },
    ];
  });
}

function toCollectionNavigation(
  items: Array<{
    id: number;
    parentId: number | null;
    nodeKey: string;
    type: 'article' | 'folder';
    position: number;
    locales: Array<{ label: string }>;
    document: {
      id: number;
      accessRole: DbDocsCollectionArticleListItem['accessRole'];
      locales: Array<{ slug: string; title: string }>;
    } | null;
  }>,
  articleSlug: string,
): DbDocsCollectionNavigationNode[] {
  const nodes = items.flatMap((item) => {
    const articleLocale = item.document?.locales[0];

    if (item.type === 'article' && !articleLocale) {
      return [];
    }

    return [{
      id: item.id,
      nodeKey: item.nodeKey,
      type: item.type,
      position: item.position,
      label: item.locales[0]?.label ?? articleLocale?.title ?? item.nodeKey,
      documentId: item.document?.id,
      accessRole: item.document?.accessRole,
      slug: articleLocale?.slug,
      title: articleLocale?.title,
      active: articleLocale?.slug === articleSlug,
      children: [] as DbDocsCollectionNavigationNode[],
      parentId: item.parentId,
    }];
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const roots: DbDocsCollectionNavigationNode[] = [];

  for (const node of nodes) {
    const parent = node.parentId === null ? undefined : byId.get(node.parentId);
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodeList: DbDocsCollectionNavigationNode[]) => {
    nodeList.sort((left, right) => left.position - right.position);
    nodeList.forEach((node) => sortNodes(node.children));
  };

  sortNodes(roots);
  return roots;
}

// 根据 collectionSlug 和 articleSlug 查找
export async function findPublishedDocsCollectionArticleBySlugs({
  locale,
  collectionSlug,
  articleSlug,
}: {
  locale: DbDocsLocale;
  collectionSlug: string;
  articleSlug: string;
}): Promise<DbDocsCollectionRecord | null> {
  const row = await prisma.docsCollection.findFirst({
    where: {
      locales: {
        some: {
          locale,
          slug: collectionSlug,
          status: 'published',
        },
      },
      items: {
        some: {
          document: {
            locales: {
              some: {
                locale,
                slug: articleSlug,
                status: 'published',
              },
            },
          },
        },
      },
    },
    select: {
      id: true,
      accessRole: true,
      locales: {
        where: {
          locale,
          slug: collectionSlug,
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
          seoTitle: true,
          seoDescription: true,
        },
      },
      items: {
        where: { isActive: true },
        orderBy: {
          position: 'asc',
        },
        select: {
          id: true,
          parentId: true,
          type: true,
          nodeKey: true,
          position: true,
          locales: {
            where: { locale },
            take: 1,
            select: { label: true },
          },
          document: {
            select: {
              id: true,
              accessRole: true,
              kind: true,
              layoutMode: true,
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
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const collectionLocale = row?.locales[0];

  if (!row || !collectionLocale) {
    return null;
  }

  const collectionItems = toCollectionArticleListItems(row.items);
  const currentItem = row.items.find(
    (item) => item.document?.locales[0]?.slug === articleSlug,
  );
  const currentDocument = currentItem?.document;
  const currentLocale = currentDocument?.locales[0];

  if (!currentItem || !currentDocument || !currentLocale) {
    return null;
  }

  return {
    collectionId: row.id,
    locale: collectionLocale.locale as DbDocsLocale,
    collectionSlug: collectionLocale.slug,
    collectionTitle: collectionLocale.title,
    collectionSummary: collectionLocale.summary,
    collectionEyebrow: collectionLocale.eyebrow,
    collectionStatus: collectionLocale.status,
    collectionPublishedAt: collectionLocale.publishedAt,
    collectionAccessRole: row.accessRole,
    articleDocumentId: currentDocument.id,
    articleAccessRole: currentDocument.accessRole,
    articleSlug: currentLocale.slug,
    articleTitle: currentLocale.title,
    articleSummary: currentLocale.summary,
    articleEyebrow: currentLocale.eyebrow,
    articlePublishedAt: currentLocale.publishedAt,
    articleLastEditedAt:
      currentDocument.publicationEvents[0]?.occurredAt ?? currentLocale.publishedAt,
    articleBodyJson: assertDocsBody(currentLocale.bodyJson),
    articleStatus: currentLocale.status,
    articleKind: currentDocument.kind,
    articleLayoutMode: currentDocument.layoutMode,
    collectionItems,
    collectionNavigation: toCollectionNavigation(row.items, articleSlug),
    seoTitle: collectionLocale.seoTitle,
    seoDescription: collectionLocale.seoDescription,
    createdAt: currentLocale.createdAt,
    updatedAt: currentLocale.updatedAt,
  };
}
