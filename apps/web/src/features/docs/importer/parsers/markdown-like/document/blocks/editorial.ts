import { addMarkdownLikeIssue } from '../../errors';
import {
  markdownLikeAllowedCalloutTones,
  markdownLikeAllowedCalloutVariants,
  markdownLikeAllowedDividerVariants,
} from '../../syntax';
import { parseMarkdownLikeAttributes } from '../attributes';
import { ensureMarkdownLikeSection, makeMarkdownLikeBlockId } from '../state';
import type { MarkdownLikeParseState } from '../types';

export function parseMarkdownLikeQuote(state: MarkdownLikeParseState, startIndex: number) {
  const section = ensureMarkdownLikeSection(state, startIndex + 1);
  const lines = [];
  let index = startIndex;

  while (index < state.lines.length) {
    const match = state.lines[index].match(/^>\s?(.*)$/);

    if (!match) {
      break;
    }

    lines.push(match[1]);
    index += 1;
  }

  section.blocks.push({
    id: makeMarkdownLikeBlockId(state, section, 'quote', lines[0]),
    line: startIndex + 1,
    type: 'quote',
    text: lines.join('\n').trim(),
  });

  return index;
}

export function parseMarkdownLikeCallout(state: MarkdownLikeParseState, startIndex: number) {
  const open = state.lines[startIndex];
  const match = open.match(/^:::callout\s*(.*)$/);
  const attrs = parseMarkdownLikeAttributes(match?.[1] ?? '');
  const tone = attrs.tone ?? 'note';
  const variant = attrs.variant ?? 'default';
  const lines = [];
  let index = startIndex + 1;

  while (index < state.lines.length && state.lines[index].trim() !== ':::') {
    lines.push(state.lines[index]);
    index += 1;
  }

  if (index >= state.lines.length) {
    addMarkdownLikeIssue(
      state.issues,
      startIndex + 1,
      'unclosed_callout',
      'Callout must be closed with :::.',
    );
    return state.lines.length;
  }

  if (!markdownLikeAllowedCalloutTones.has(tone)) {
    addMarkdownLikeIssue(
      state.issues,
      startIndex + 1,
      'invalid_callout',
      `Unsupported callout tone "${tone}".`,
    );
  }

  if (!markdownLikeAllowedCalloutVariants.has(variant)) {
    addMarkdownLikeIssue(
      state.issues,
      startIndex + 1,
      'invalid_callout',
      `Unsupported callout variant "${variant}".`,
    );
  }

  const text = lines.join('\n').trim();

  if (!text) {
    addMarkdownLikeIssue(
      state.issues,
      startIndex + 1,
      'invalid_callout',
      'Callout must contain text.',
    );
  }

  const section = ensureMarkdownLikeSection(state, startIndex + 1);
  section.blocks.push({
    id: makeMarkdownLikeBlockId(state, section, 'callout', attrs.title ?? text),
    line: startIndex + 1,
    type: 'callout',
    tone:
      tone === 'tip' || tone === 'attention' || tone === 'warning' || tone === 'meta'
        ? tone
        : 'note',
    title: attrs.title ?? 'Note',
    text,
    variant: variant === 'soft' || variant === 'context' ? variant : 'default',
  });

  return index + 1;
}

export function parseMarkdownLikeDivider(
  state: MarkdownLikeParseState,
  line: string,
  lineNumber: number,
) {
  const attrsMatch = line.match(/^---\s*\{([^}]+)\}\s*$/);
  const attrs = attrsMatch ? parseMarkdownLikeAttributes(attrsMatch[1]) : {};

  if (attrs.variant && !markdownLikeAllowedDividerVariants.has(attrs.variant)) {
    addMarkdownLikeIssue(
      state.issues,
      lineNumber,
      'unsupported_syntax',
      `Unsupported divider variant "${attrs.variant}".`,
    );
  }

  const section = ensureMarkdownLikeSection(state, lineNumber);
  section.blocks.push({
    id: makeMarkdownLikeBlockId(state, section, 'divider'),
    line: lineNumber,
    type: 'divider',
    variant: attrs.variant === 'spacious' ? 'spacious' : 'default',
  });
}
