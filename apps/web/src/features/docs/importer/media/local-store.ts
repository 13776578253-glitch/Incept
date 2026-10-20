import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { getDocsMediaDirectory } from '../paths';
import type { DocsImportMediaMode, DocsImportMediaOperation } from './types';

const localMediaPublicPath = '/_docs-media';

export async function publishLocalDocsMedia({
  sourcePath,
  extension,
  mode,
}: {
  sourcePath: string;
  extension: string;
  mode: DocsImportMediaMode;
}): Promise<DocsImportMediaOperation> {
  const source = await fs.readFile(sourcePath);
  const hash = crypto.createHash('sha256').update(source).digest('hex');
  const fileName = `${hash}${extension.toLowerCase()}`;
  const targetPath = path.join(getDocsMediaDirectory(), fileName);
  const targetUrl = `${localMediaPublicPath}/${fileName}`;

  try {
    const existing = await fs.readFile(targetPath);
    if (crypto.createHash('sha256').update(existing).digest('hex') !== hash) throw new Error('Media requires repair.');
    return {
      sourcePath,
      targetUrl,
      status: 'reuse',
      size: source.byteLength,
    };
  } catch {
    if (mode === 'publish') {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      const temporary = `${targetPath}.${crypto.randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, source, { flag: 'wx' });
        await fs.rename(temporary, targetPath);
      } finally {
        await fs.rm(temporary, { force: true });
      }
    }

    return {
      sourcePath,
      targetUrl,
      status: 'publish',
      size: source.byteLength,
    };
  }
}
