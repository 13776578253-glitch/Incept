import type { DocsImportArticleSource } from '../../types';
import { toSingleArticleDocsImportSource } from './conversion';
import { parseMarkdownLikeDocument } from './document';
import { MarkdownLikeParseError } from './errors';

export function parseMarkdownLikeDocsSource(raw: string): DocsImportArticleSource {
  // 解析 Markdown-like 文档源数据
  const result = parseMarkdownLikeDocument(raw);

  if (result.issues.length > 0) {
    throw new MarkdownLikeParseError(result.issues);
  }

  // 将解析后的 Markdown-like 文档对象转换为单篇文章的导入源对象
  // TODO: 未来可能支持多篇文章的导入源对象，届时需要修改此处的转换逻辑
  return toSingleArticleDocsImportSource(result.document);
}
