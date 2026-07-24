import type { DocsImportArticleSource } from '../../types';
import {
  toCollectionArticleDocsImportSource,
  toSingleArticleDocsImportSource,
} from './conversion';
import { parseMarkdownLikeDocument } from './document';
import type { MarkdownLikeDocument } from './document/types';
import { MarkdownLikeParseError } from './errors';

export function toMarkdownLikeDocsImportSource(
  document: MarkdownLikeDocument,
): DocsImportArticleSource {
  return document.frontmatter.routeType === 'collectionArticle'
    ? toCollectionArticleDocsImportSource(document)
    : toSingleArticleDocsImportSource(document);
}

export function parseMarkdownLikeDocsSource(raw: string): DocsImportArticleSource {
  // 解析 Markdown-like 文档源数据
  const result = parseMarkdownLikeDocument(raw);

  if (result.issues.length > 0) {
    throw new MarkdownLikeParseError(result.issues);
  }

  return toMarkdownLikeDocsImportSource(result.document);
}
