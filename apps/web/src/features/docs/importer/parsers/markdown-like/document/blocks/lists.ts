import {
  ensureMarkdownLikeSection,
  makeMarkdownLikeBlockId,
  makeMarkdownLikeChecklistItemId,
} from '../state';
import type { MarkdownLikeParseState } from '../types';

export function parseMarkdownLikeList(
  state: MarkdownLikeParseState,
  startIndex: number,
  ordered: boolean,
) {
  const section = ensureMarkdownLikeSection(state, startIndex + 1);
  const items: string[] = [];
  let index = startIndex;
  const pattern = ordered ? /^\s*\d+\.\s+(.+)$/ : /^\s*-\s+(.+)$/;

  while (index < state.lines.length) {
    const match = state.lines[index].match(pattern);

    if (!match || /^\s*-\s+\[[ xX]\]\s+/.test(state.lines[index])) {
      break;
    }

    items.push(match[1].trim());
    index += 1;
  }

  section.blocks.push({
    id: makeMarkdownLikeBlockId(state, section, 'list', items[0]),
    line: startIndex + 1,
    type: 'list',
    listStyle: ordered ? 'ordered' : 'unordered',
    variant: 'default',
    items,
  });

  return index;
}

export function parseMarkdownLikeChecklist(
  state: MarkdownLikeParseState,
  startIndex: number,
) {
  const section = ensureMarkdownLikeSection(state, startIndex + 1);
  const items = [];
  let index = startIndex;

  while (index < state.lines.length) {
    const match = state.lines[index].match(/^\s*-\s+\[([ xX])\]\s+(.+)$/);

    if (!match) {
      break;
    }

    items.push({
      id: makeMarkdownLikeChecklistItemId(state, section),
      checked: match[1].toLowerCase() === 'x',
      text: match[2].trim(),
    });
    index += 1;
  }

  section.blocks.push({
    id: makeMarkdownLikeBlockId(state, section, 'checklist', items[0]?.text),
    line: startIndex + 1,
    type: 'checklist',
    variant: 'default',
    items,
  });

  return index;
}
