import type { DocsAccessRole } from '@/features/docs/shared/types';

import type { DocsImportArticleSource, DocsImportKind } from '../../../types';
import type { MarkdownLikeDocument } from '../document/types';
import { toDocsArticleBody } from './single-article';

/**
 * 将 MarkdownLike 中间文档转换为集合文章（collectionArticle）
 *
 * @param document 由 parseMarkdownLikeDocument 解析得到的文档对象
 * @returns 符合 DocsImportArticleSource 类型的集合文章数据
 */
export function toCollectionArticleDocsImportSource(
  document: MarkdownLikeDocument,
): DocsImportArticleSource {
  const { frontmatter } = document;

  return {
    meta: {
      documentKey: frontmatter.documentKey,
      locale: frontmatter.locale as DocsImportArticleSource['meta']['locale'],
      routeType: 'collectionArticle',
      kind: (frontmatter.kind as DocsImportKind | undefined) ?? 'article',
      layoutMode: 'sidebar',
      accessRole: (frontmatter.accessRole as DocsAccessRole | undefined) ?? 'guest',

      slug: frontmatter.slug,
      title: frontmatter.title,
      summary: frontmatter.summary,
      eyebrow: frontmatter.eyebrow,
      seoTitle: frontmatter.seoTitle,
      seoDescription: frontmatter.seoDescription,
      publishedAt: frontmatter.publishedAt,

      // 集合特有的字段，用于将文章归属到某个集合下
      collectionKey: frontmatter.collectionKey,
      collectionSlug: frontmatter.collectionSlug,
      collectionTitle: frontmatter.collectionTitle,
      collectionSummary: frontmatter.collectionSummary,
      collectionEyebrow: frontmatter.collectionEyebrow,

      position: Number(frontmatter.position),
    },
    body: toDocsArticleBody(document),
  };
}
