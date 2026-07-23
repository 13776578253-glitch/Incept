export function parseMarkdownLikeAttributes(raw: string) {
  const attrs: Record<string, string> = {};
  const attrPattern = /([A-Za-z][A-Za-z0-9_-]*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;

  let match: RegExpExecArray | null;

  while ((match = attrPattern.exec(raw)) !== null) {
    attrs[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
  }

  return attrs;
}
