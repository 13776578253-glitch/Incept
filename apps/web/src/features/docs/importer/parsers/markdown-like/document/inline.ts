import { addMarkdownLikeIssue } from '../errors';
import type { MarkdownLikeInline } from './types';

/**
 * 支持的内联语法：
 *   - [label](url)   / 链接
 *   - `code`         / 行内代码
 *   - ==text==       / 高亮（mark）
 *   - ~~text~~       / 删除线
 *   - 普通文本作为{ type: 'text' }
 */

// 解析 Markdown-like 文本中的内联语法，返回一个 MarkdownLikeInline 数组
export function parseMarkdownLikeInline(text: string): MarkdownLikeInline[] {
  const content: MarkdownLikeInline[] = [];
  const pattern = /(\[[^\]]+\]\([^)]+\)|`[^`]+`|==[^=]+==|~~[^~]+~~)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      content.push({ type: 'text', text: text.slice(cursor, match.index) });
    }

    const token = match[0];

    if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

      if (linkMatch) {
        const href = linkMatch[2];
        content.push({
          type: 'link',
          label: linkMatch[1],
          href,
          external: /^https?:\/\//.test(href),
        });
      }
    } else if (token.startsWith('`')) {
      content.push({ type: 'inlineCode', code: token.slice(1, -1) });
    } else if (token.startsWith('==')) {
      content.push({ type: 'mark', text: token.slice(2, -2) });
    } else if (token.startsWith('~~')) {
      content.push({ type: 'delete', text: token.slice(2, -2) });
    }

    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    content.push({ type: 'text', text: text.slice(cursor) });
  }

  return content;
}

/**
 * 检测文本中是否出现了 v1 规范不支持的加粗、斜体语法，
 * 通过 addMarkdownLikeIssue 报告为 unsupported_syntax 问题
 *
 * @param issues  问题收集数组（通过副作用添加）
 * @param text    待检查的原始文本行
 * @param line    当前行号（用于错误定位）
 */
export function reportUnsupportedMarkdownLikeInlineSyntax(
  issues: Parameters<typeof addMarkdownLikeIssue>[0],
  text: string,
  line: number,
) {
  const textOutsideSupportedTokens = text.replace(/(\[[^\]]+\]\([^)]+\)|`[^`]+`)/g, '');

  if (/\*\*[^*]+\*\*/.test(textOutsideSupportedTokens)) {
    addMarkdownLikeIssue(
      issues,
      line,
      'unsupported_syntax',
      'Bold syntax **text** is not supported in markdown-like v1.',
    );
  }

  // 检查是否使用了斜体：下划线 _text_ 或 单星号 *text*
  // history: OWNER_ACCESS_SECRET 误判
  if (
    /(^|[^*_])_[^_\s][^_]*_([^*_]|$)/.test(textOutsideSupportedTokens) ||
    /(^|[^*])\*[^*\s][^*]*\*([^*]|$)/.test(textOutsideSupportedTokens)
  ) {
    addMarkdownLikeIssue(
      issues,
      line,
      'unsupported_syntax',
      'Italic syntax is not supported in markdown-like v1.',
    );
  }
}
