import { addMarkdownLikeIssue } from '../../errors';
import { ensureMarkdownLikeSection, makeMarkdownLikeBlockId } from '../state';
import type { MarkdownLikeParseState } from '../types';

export function parseMarkdownLikeImage(
  state: MarkdownLikeParseState,
  line: string,
  lineNumber: number,
) {
  const match = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)$/);

  if (!match) {
    addMarkdownLikeIssue(
      state.issues,
      lineNumber,
      'invalid_image',
      'Image syntax must be ![alt](src "optional caption").',
    );
    return;
  }

  const [, alt, src, caption] = match;

  if (!alt.trim() || !src.trim()) {
    addMarkdownLikeIssue(
      state.issues,
      lineNumber,
      'invalid_image',
      'Image must provide non-empty alt text and src.',
    );
  }

  const section = ensureMarkdownLikeSection(state, lineNumber);
  section.blocks.push({
    id: makeMarkdownLikeBlockId(state, section, 'image', alt || src),
    line: lineNumber,
    type: 'image',
    src,
    alt,
    caption,
  });
}
