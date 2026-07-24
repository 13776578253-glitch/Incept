import fs from 'node:fs/promises';
import path from 'node:path';

export async function getDocsContentRoot() {
  const configuredRoot = process.env.DOCS_CONTENT_ROOT?.trim();

  if (!configuredRoot) {
    throw new Error(
      'DOCS_CONTENT_ROOT is required for Markdown-like imports. Set it to the absolute directory containing your articles and media.',
    );
  }

  const absoluteRoot = path.resolve(configuredRoot);

  try {
    const stats = await fs.stat(absoluteRoot);
    if (!stats.isDirectory()) {
      throw new Error('not a directory');
    }
    return fs.realpath(absoluteRoot);
  } catch {
    throw new Error(`DOCS_CONTENT_ROOT must point to an existing directory: ${absoluteRoot}`);
  }
}
