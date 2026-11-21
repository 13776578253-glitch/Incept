import { addMarkdownLikeIssue } from '../../errors';
import { ensureMarkdownLikeSection, makeMarkdownLikeBlockId } from '../state';
import type { MarkdownLikeParseState } from '../types';

export function parseMarkdownLikeEquation(
  state: MarkdownLikeParseState,
  startIndex: number,
  lineNumber: number,
) {
  let endIndex = startIndex + 1;
  while (endIndex < state.lines.length && state.lines[endIndex].trim() !== '$$') endIndex += 1;
  if (endIndex === state.lines.length) {
    addMarkdownLikeIssue(state.issues, lineNumber, 'unclosed_equation', 'An equation must close with $$ on its own line.');
    return state.lines.length;
  }

  const lines = state.lines.slice(startIndex + 1, endIndex);
  while (lines.length > 0 && !lines.at(-1)?.trim()) lines.pop();

  const tag = lines.at(-1)?.trim().match(/^\\tag\{([A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*)\}$/);
  const number = tag?.[1];
  const numberLine = lineNumber + lines.length;
  if (number) lines.pop();

  const otherTagIndex = lines.findIndex((line) => /(?<!\\)(?:\\\\)*\\tag\b/.test(line.split(/(?<!\\)%/, 1)[0]));
  if (otherTagIndex !== -1) {
    addMarkdownLikeIssue(
      state.issues,
      lineNumber + 1 + otherTagIndex,
      'invalid_equation',
      'Put a single \\tag{number} on the last line. Use letters, digits, dots, or hyphens in the number.',
    );
  }

  const tex = lines.join('\n').trim();
  if (!tex) {
    addMarkdownLikeIssue(state.issues, lineNumber, 'invalid_equation', 'An equation must contain LaTeX.');
  }

  const section = ensureMarkdownLikeSection(state, lineNumber);
  const generatedId = makeMarkdownLikeBlockId(state, section, 'equation');
  const id = number ? 'eq-' + number.toLowerCase() : generatedId;
  if (number && state.equationIds.has(id)) {
    addMarkdownLikeIssue(state.issues, numberLine, 'duplicate_equation_number', 'Equation number "' + number + '" is already in use.');
  }
  if (number) state.equationIds.add(id);

  section.blocks.push({ id, line: lineNumber, type: 'equation', tex, number });
  return endIndex + 1;
}
