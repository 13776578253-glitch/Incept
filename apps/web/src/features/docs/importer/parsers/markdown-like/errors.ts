import type { DocsImportValidationIssue } from '../../types';

/**
  missing_frontmatter — 缺少前置元数据 / Front Matter
  invalid_frontmatter — 无效前置元数据
  missing_frontmatter_field — 缺少必需的前置元数据字段
  unsupported_frontmatter_field — 前置元数据中包含不支持的字段
  unsupported_route_type — 不支持的路由类型
  unsupported_syntax — 不支持的语法
  unsupported_html — 不支持的 HTML
  unclosed_code_fence — 未闭合的代码围栏 / 代码块
  unclosed_callout — 未闭合的标注块 / Callout
  invalid_callout — 无效的标注块
  invalid_image — 无效的图片引用
  empty_section — 空的章节
  content_before_section — 章节定义之前存在内容
*/

// 定义 Markdown-like 解析问题的代码
export type MarkdownLikeParseIssueCode =
  | 'missing_frontmatter'
  | 'invalid_frontmatter'
  | 'missing_frontmatter_field'
  | 'unsupported_frontmatter_field'
  | 'unsupported_route_type'
  | 'unsupported_syntax'
  | 'unsupported_html'
  | 'unclosed_code_fence'
  | 'unclosed_callout'
  | 'invalid_callout'
  | 'invalid_image'
  | 'empty_section'
  | 'content_before_section';

export type MarkdownLikeParseIssue = {
  code: MarkdownLikeParseIssueCode;
  message: string;
  line: number;
};

export function addMarkdownLikeIssue(
  issues: MarkdownLikeParseIssue[],
  line: number,
  code: MarkdownLikeParseIssueCode,
  message: string,
) {
  issues.push({ code, line, message });
}

export function toImportIssue(issue: MarkdownLikeParseIssue): DocsImportValidationIssue {
  return {
    level: 'error',
    code: `markdown_like_${issue.code}`,
    message: issue.message,
    path: `source.line:${issue.line}`,
  };
}

export class MarkdownLikeParseError extends Error {
  readonly issues: MarkdownLikeParseIssue[];

  constructor(issues: MarkdownLikeParseIssue[]) {
    super('Markdown-like source contains parser errors.');
    this.name = 'MarkdownLikeParseError';
    this.issues = issues;
  }
}
