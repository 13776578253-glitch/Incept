import type { DocsImportValidationIssue } from '../../types';

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
