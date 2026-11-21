import { addMarkdownLikeIssue } from '../../errors';
import { matchMarkdownLikeInlineTokens, parseMarkdownLikeInline, reportUnsupportedMarkdownLikeInlineSyntax } from '../inline';
import { ensureMarkdownLikeSection, makeMarkdownLikeBlockId } from '../state';
import type { MarkdownLikeParseState } from '../types';

export function isMarkdownLikeTableRow(line: string) {
  return /^\|.*\|$/.test(line.trim());
}

function splitTableRow(line: string) {
  const text = line.trim().slice(1, -1);
  const tokens = matchMarkdownLikeInlineTokens(text);
  let token = tokens.next().value;
  const cells: string[] = [];
  let cell = '';

  for (let index = 0; index < text.length; index += 1) {
    if (token && token.index === index) {
      cell += token[0];
      index += token[0].length - 1;
      token = tokens.next().value;
    } else if (text[index] === '\\' && (text[index + 1] === '\\' || text[index + 1] === '|')) {
      cell += text[index + 1];
      index += 1;
    } else if (text[index] === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += text[index];
    }
  }

  cells.push(cell.trim());
  return cells;
}

export function parseMarkdownLikeTable(
  state: MarkdownLikeParseState,
  startIndex: number,
  lineNumber: number,
) {
  let endIndex = startIndex + 1;
  while (endIndex < state.lines.length && isMarkdownLikeTableRow(state.lines[endIndex])) endIndex += 1;

  const header = splitTableRow(state.lines[startIndex]);
  const separator = endIndex > startIndex + 1 ? splitTableRow(state.lines[startIndex + 1]) : [];
  if (separator.length !== header.length || !separator.every((cell) => /^:?-{3,}:?$/.test(cell))) {
    const errorLine = separator.length > 0 ? lineNumber + 1 : lineNumber;
    addMarkdownLikeIssue(state.issues, errorLine, 'invalid_table', 'A table needs a separator row with at least three hyphens per column and the same column count as its header.');
    return endIndex;
  }

  function parseRow(cells: string[], sourceLine: number) {
    return cells.map((cell) => {
      reportUnsupportedMarkdownLikeInlineSyntax(state.issues, cell, sourceLine);
      return parseMarkdownLikeInline(cell);
    });
  }

  const rows = [];
  for (let index = startIndex + 2; index < endIndex; index += 1) {
    const cells = splitTableRow(state.lines[index]);
    const sourceLine = lineNumber + index - startIndex;
    if (cells.length !== header.length) {
      addMarkdownLikeIssue(state.issues, sourceLine, 'invalid_table', 'Expected ' + header.length + ' table cells, found ' + cells.length + '.');
      continue;
    }
    rows.push(parseRow(cells, sourceLine));
  }

  const section = ensureMarkdownLikeSection(state, lineNumber);
  section.blocks.push({
    id: makeMarkdownLikeBlockId(state, section, 'table', header.join(' ')),
    line: lineNumber,
    type: 'table',
    header: parseRow(header, lineNumber),
    rows,
    align: separator.map((cell) => {
      if (cell.startsWith(':')) return cell.endsWith(':') ? 'center' : 'left';
      return cell.endsWith(':') ? 'right' : null;
    }),
  });
  return endIndex;
}
