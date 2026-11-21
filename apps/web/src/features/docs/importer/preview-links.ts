import type { DbDocsInlineContent, DbDocsSectionBlock } from '@incept/db/docs';
import type { DocsArticlePageModel } from '../shared/types';
import type { DocsImportNormalizedSource } from './types';

function collectionArticlePath({ meta }: DocsImportNormalizedSource) {
  if (meta.routeType === 'collectionArticle' && meta.collectionSlug) {
    return `/${meta.locale}/docs/series/${meta.collectionSlug}/${meta.slug}`;
  }
}

export function resolveDocsImportPreviewLinks(
  page: DocsArticlePageModel,
  source: DocsImportNormalizedSource,
  batchSources: DocsImportNormalizedSource[],
): DocsArticlePageModel {
  const articlePath = collectionArticlePath(source);
  if (!articlePath) return page;

  // Resolve article-relative links from the published route, since the draft URL has a different path.
  const base = new URL(articlePath, 'https://incept.invalid');
  const batchArticles = new Map(batchSources.map((article) => [collectionArticlePath(article), article.meta.slug]));

  function resolveHref(href: string) {
    if (href.startsWith('#') || href.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(href)) {
      return href;
    }
    const target = URL.parse(href, base);
    if (!target || target.origin !== base.origin || target.pathname.startsWith('//')) return href;

    const slug = batchArticles.get(target.pathname);
    if (slug) {
      target.searchParams.set('article', slug);
      return `${target.search}${target.hash}`;
    }
    return href.startsWith('/') ? href : `${target.pathname}${target.search}${target.hash}`;
  }

  function mapInline(content: DbDocsInlineContent[]) {
    return content.map((item) => item.type === 'link' && !item.external
      ? { ...item, href: resolveHref(item.href) }
      : item);
  }

  function mapBlock(block: DbDocsSectionBlock): DbDocsSectionBlock {
    switch (block.type) {
      case 'paragraph':
      case 'heading':
      case 'quote':
        return block.content ? { ...block, content: mapInline(block.content) } : block;
      case 'list':
        return { ...block, items: block.items.map((item) => typeof item === 'string' ? item : mapInline(item)) };
      case 'table':
        return { ...block, header: block.header.map(mapInline), rows: block.rows.map((row) => row.map(mapInline)) };
      default:
        return block;
    }
  }

  return {
    ...page,
    sections: page.sections.map((section) => ({ ...section, blocks: section.blocks.map(mapBlock) })),
  };
}
