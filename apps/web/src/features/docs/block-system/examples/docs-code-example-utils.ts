// history: Shiki now owns syntax highlighting, themes, and language rendering.
// This retained Style Lab helper intentionally only normalizes example source strings.
// Deferred: introduce typed language-specific example builders only when a real editor or AI preview consumes them.

export function dedentCode(source: string): string {
  const normalized = source.replace(/\r\n/g, '\n');
  const trimmed = normalized.replace(/^\n+|\n+$/g, '');

  const lines = trimmed.split('\n');
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^ */)?.[0].length ?? 0);

  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;

  return lines.map((line) => line.slice(minIndent)).join('\n');
}

export function buildCodeExample(lines: string[]): string {
  return dedentCode(lines.join('\n'));
}
