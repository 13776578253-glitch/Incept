import { addMarkdownLikeIssue } from '../errors';
import type { MarkdownLikeInline } from './types';

export function* matchMarkdownLikeInlineTokens(text: string) {
  // Math delimiters hug their content. A digit after the closing dollar would instead start a price.
  const pattern = /(\[[^\]]+\]\([^)]+\)|`[^`]+`|==[^=]+==|~~[^~]+~~)|(?<![\\$])\$(?![\s$])((?:\\[^\r\n]|[^\\$\r\n])+?)(?<!\s)\$(?![\d$])/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) yield match;
}

/**
 * 支持的内联语法：
 *   - [label](url)   / 链接
 *   - `code`         / 行内代码
 *   - ==text==       / 高亮（mark）
 *   - ~~text~~       / 删除线
 *   - $tex$          / 行内公式
 *   - 普通文本作为{ type: 'text' }
 */

// 解析 Markdown-like 文本中的内联语法，返回一个 MarkdownLikeInline 数组
export function parseMarkdownLikeInline(text: string): MarkdownLikeInline[] {
  const content: MarkdownLikeInline[] = [];
  let cursor = 0;

  for (const match of matchMarkdownLikeInlineTokens(text)) {
    if (match.index > cursor) {
      content.push({ type: 'text', text: text.slice(cursor, match.index) });
    }

    const token = match[0];

    if (match[2] !== undefined) {
      content.push({ type: 'inlineMath', tex: match[2] });
    } else if (token.startsWith('[')) {
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

export function parseMarkdownLikeMathContent(text: string): MarkdownLikeInline[] | undefined {
  if (!text.includes('$')) return undefined;
  const content = parseMarkdownLikeInline(text);
  return content.some((item) => item.type === 'inlineMath') ? content : undefined;
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
  let textOutsideMath = '';
  let cursor = 0;
  for (const token of matchMarkdownLikeInlineTokens(text)) {
    if (token[2] === undefined) continue;
    textOutsideMath += text.slice(cursor, token.index);
    cursor = token.index + token[0].length;
  }
  textOutsideMath += text.slice(cursor);
  const textOutsideSupportedTokens = textOutsideMath.replace(/(\[[^\]]+\]\([^)]+\)|`[^`]+`)/g, '');

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
