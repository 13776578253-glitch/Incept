import { addMarkdownLikeIssue } from '../../errors';
import { parseMarkdownLikeAttributes } from '../attributes';
import { ensureMarkdownLikeSection, makeMarkdownLikeBlockId } from '../state';
import type { MarkdownLikeParseState } from '../types';

const minHtmlBlockHeight = 120;
const maxHtmlBlockHeight = 1200;

function parseHtmlBlockHeight(
  rawHeight: string | undefined,
  state: MarkdownLikeParseState,
  lineNumber: number,
): number | undefined {
  if (rawHeight === undefined) {
    return undefined;
  }

  const normalized = rawHeight.trim().replace(/px$/i, '');
  if (!/^\d+$/.test(normalized)) {
    addMarkdownLikeIssue(
      state.issues,
      lineNumber,
      'invalid_html',
      `HTML block height must be an integer between ${minHtmlBlockHeight} and ${maxHtmlBlockHeight}.`,
    );
    return undefined;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < minHtmlBlockHeight || parsed > maxHtmlBlockHeight) {
    addMarkdownLikeIssue(
      state.issues,
      lineNumber,
      'invalid_html',
      `HTML block height must be between ${minHtmlBlockHeight} and ${maxHtmlBlockHeight}.`,
    );
    return undefined;
  }

  return parsed;
}

export function parseMarkdownLikeHtml(
  state: MarkdownLikeParseState,
  startIndex: number,
  startLineNumber: number,
): number {
  const open = state.lines[startIndex].trim();
  const match = open.match(/^:::html(?:\s+(.*))?$/);
  const rawMeta = (match?.[1] ?? '').trim();
  const isSelfClosing = rawMeta === ':::' || /\s:::$/.test(rawMeta);
  const attrSource = isSelfClosing
    ? rawMeta.replace(/(?:^|\s):::$/, '').trim()
    : rawMeta;
  const attrs = parseMarkdownLikeAttributes(attrSource);
  const height = parseHtmlBlockHeight(attrs.height, state, startLineNumber);
  const src = attrs.src?.trim();

  let bodyLines: string[] = [];
  let nextIndex = startIndex + 1;

  if (!isSelfClosing) {
    const collected: string[] = [];
    let index = startIndex + 1;

    while (index < state.lines.length && state.lines[index].trim() !== ':::') {
      collected.push(state.lines[index]);
      index += 1;
    }

    if (index >= state.lines.length) {
      addMarkdownLikeIssue(
        state.issues,
        startLineNumber,
        'unclosed_html',
        'HTML block must be closed with :::.',
      );
      return state.lines.length;
    }

    bodyLines = collected;
    nextIndex = index + 1;
  }

  const html = bodyLines.join('\n').trim();

  if (!src && !html) {
    addMarkdownLikeIssue(
      state.issues,
      startLineNumber,
      'invalid_html',
      'HTML block must contain inline HTML or a src attribute.',
    );
  } else if (src && html) {
    addMarkdownLikeIssue(
      state.issues,
      startLineNumber,
      'invalid_html',
      'HTML block cannot specify both src and inline HTML body.',
    );
  }

  const section = ensureMarkdownLikeSection(state, startLineNumber);
  section.blocks.push({
    id: makeMarkdownLikeBlockId(state, section, 'html', attrs.title ?? src ?? 'html'),
    line: startLineNumber,
    type: 'html',
    html,
    ...(attrs.title ? { title: attrs.title } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(attrs.caption ? { caption: attrs.caption } : {}),
    ...(src ? { sourceFile: src } : {}),
  });

  return nextIndex;
}
