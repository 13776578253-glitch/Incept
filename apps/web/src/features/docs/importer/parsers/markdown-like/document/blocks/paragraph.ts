import { addMarkdownLikeIssue } from '../../errors';
import { parseMarkdownLikeAttributes } from '../attributes';
import {
  parseMarkdownLikeInline,
  reportUnsupportedMarkdownLikeInlineSyntax,
} from '../inline';
import { ensureMarkdownLikeSection, makeMarkdownLikeBlockId } from '../state';
import type { MarkdownLikeParseState } from '../types';
import {
  markdownLikeAllowedParagraphSpacings,
  markdownLikeAllowedParagraphVariants,
} from '../../syntax';

export function parseMarkdownLikeParagraph(
  state: MarkdownLikeParseState,
  text: string,
  line: number,
) {
  const attrsMatch = text.match(/^\{paragraph\s+([^}]+)\}\s*(.*)$/);
  const attrs = attrsMatch ? parseMarkdownLikeAttributes(attrsMatch[1]) : {};
  const paragraphText = attrsMatch ? attrsMatch[2] : text;

  if (attrs.variant && !markdownLikeAllowedParagraphVariants.has(attrs.variant)) {
    addMarkdownLikeIssue(
      state.issues,
      line,
      'unsupported_syntax',
      `Unsupported paragraph variant "${attrs.variant}".`,
    );
  }

  if (attrs.spacing && !markdownLikeAllowedParagraphSpacings.has(attrs.spacing)) {
    addMarkdownLikeIssue(
      state.issues,
      line,
      'unsupported_syntax',
      `Unsupported paragraph spacing "${attrs.spacing}".`,
    );
  }

  const section = ensureMarkdownLikeSection(state, line);
  const content = parseMarkdownLikeInline(paragraphText);
  reportUnsupportedMarkdownLikeInlineSyntax(state.issues, paragraphText, line);

  section.blocks.push({
    id: makeMarkdownLikeBlockId(state, section, 'paragraph', paragraphText),
    line,
    type: 'paragraph',
    variant: attrs.variant === 'lead' || attrs.variant === 'muted' ? attrs.variant : 'default',
    spacing: attrs.spacing === 'relaxed' ? 'relaxed' : 'default',
    content,
  });
}
