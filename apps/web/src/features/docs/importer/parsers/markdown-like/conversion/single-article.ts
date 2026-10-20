import type { DocsContentBlockModel } from '@/features/docs/block-system/schema';
import type { DocsAccessRole, DocsLayoutMode } from '@/features/docs/shared/types';
import type { DocsImportArticleSource, DocsImportKind } from '../../../types';
import type { MarkdownLikeBlock, MarkdownLikeDocument } from '../document/types';

/** Preserve the shared block shape while dropping parser-only source locations. */
function toDocsContentBlock(block: MarkdownLikeBlock): DocsContentBlockModel {
  const { line, ...content } = block;
  void line;
  return content;
}

export function toDocsArticleBody(document: MarkdownLikeDocument): DocsImportArticleSource['body'] {
  return {
    sections: document.sections.map((section) => ({
      id: section.id,
      title: section.title,
      blocks: section.blocks.map(toDocsContentBlock),
    })),
  };
}

export function toSingleArticleDocsImportSource(document: MarkdownLikeDocument): DocsImportArticleSource {
  const { frontmatter } = document;

  return {
    meta: {
      documentKey: frontmatter.documentKey,
      locale: frontmatter.locale as DocsImportArticleSource['meta']['locale'],
      routeType: 'singleArticle',
      kind: (frontmatter.kind as DocsImportKind | undefined) ?? 'article',
      layoutMode: (frontmatter.layoutMode as DocsLayoutMode | undefined) ?? 'contentOnly',
      accessRole: (frontmatter.accessRole as DocsAccessRole | undefined) ?? 'guest',
      isListed: frontmatter.isListed !== 'false',
      slug: frontmatter.slug,
      title: frontmatter.title,
      summary: frontmatter.summary,
      eyebrow: frontmatter.eyebrow,
      seoTitle: frontmatter.seoTitle,
      seoDescription: frontmatter.seoDescription,
      publishedAt: frontmatter.publishedAt,
    },
    body: toDocsArticleBody(document),
  };
}
