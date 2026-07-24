import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { findRepoRoot } from '../paths';
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
  const targetPath = path.join(findRepoRoot(), 'apps', 'web', 'public', '_docs-media', fileName);
  const targetUrl = `${localMediaPublicPath}/${fileName}`;

  try {
    await fs.access(targetPath);
    return {
      sourcePath,
      targetUrl,
      status: 'reuse',
      size: source.byteLength,
    };
  } catch {
    if (mode === 'publish') {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, source, { flag: 'wx' }).catch(async (error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }
      });
    }

    return {
      sourcePath,
      targetUrl,
      status: 'publish',
      size: source.byteLength,
    };
  }
}
