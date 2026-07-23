import type { DocsImportArticleSource } from '../../types';
import {
  toCollectionArticleDocsImportSource,
  toSingleArticleDocsImportSource,
} from './conversion';
import { parseMarkdownLikeDocument } from './document';
import { MarkdownLikeParseError } from './errors';

export function parseMarkdownLikeDocsSource(raw: string): DocsImportArticleSource {
  // 解析 Markdown-like 文档源数据
  const result = parseMarkdownLikeDocument(raw);

  if (result.issues.length > 0) {
    throw new MarkdownLikeParseError(result.issues);
  }

  return result.document.frontmatter.routeType === 'collectionArticle'
    ? toCollectionArticleDocsImportSource(result.document)
    : toSingleArticleDocsImportSource(result.document);
}
