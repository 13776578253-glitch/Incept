import { addMarkdownLikeIssue } from '../../errors';
import { markdownLikeAllowedCodeVariants } from '../../syntax';
import { parseMarkdownLikeAttributes } from '../attributes';
import { ensureMarkdownLikeSection, makeMarkdownLikeBlockId } from '../state';
import type { MarkdownLikeParseState } from '../types';

// history: Code fences parse language, caption, and variants; Shiki owns highlighting and theme rendering.



export function parseMarkdownLikeCode(state: MarkdownLikeParseState, startIndex: number) {
  const open = state.lines[startIndex];

  // 提取语言标识符 / 第一个捕获组 和行尾剩余部分 / 可能包含属性
  const match = open.match(/^```([A-Za-z0-9_-]*)?(.*)$/);
  const language = match?.[1] || 'text';

  const attrs = parseMarkdownLikeAttributes(match?.[2] ?? '');
  const codeLines = [];
  let index = startIndex + 1;

  while (index < state.lines.length && state.lines[index].trim() !== '```') {
    codeLines.push(state.lines[index]);
    index += 1;
  }

  if (index >= state.lines.length) {
    addMarkdownLikeIssue(
      state.issues,
      startIndex + 1,
      'unclosed_code_fence',
      'Code fence must be closed with ```.',
    );
    return state.lines.length;
  }

  if (attrs.variant && !markdownLikeAllowedCodeVariants.has(attrs.variant)) {
    addMarkdownLikeIssue(
      state.issues,
      startIndex + 1,
      'unsupported_syntax',
      `Unsupported code variant "${attrs.variant}".`,
    );
  }

  const section = ensureMarkdownLikeSection(state, startIndex + 1);
  section.blocks.push({
    id: makeMarkdownLikeBlockId(state, section, 'code', attrs.caption ?? language),
    line: startIndex + 1,
    type: 'code',
    language,
    caption: attrs.caption,
    variant: attrs.variant === 'compact' ? 'compact' : 'block',
    code: codeLines.join('\n'),
  });

  return index + 1;
}
