import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { MusicManifestDocument, PreviousMusicManifest } from './manifest-builder';

export function getMusicManifestPath(contentRoot: string): string {
  return path.join(contentRoot, 'music.json');
}

export function hashMusicManifest(raw: string): string {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

// 文件不存在返回 previous: null（由调用方决定怎么提示）；
// JSON 无效必须报错——把它当成"没有上一版清单"会静默丢掉手写的标题、顺序与归属
export async function readMusicManifestFile(
  contentRoot: string,
): Promise<{ previous: PreviousMusicManifest | null; hash: string }> {
  const manifestPath = getMusicManifestPath(contentRoot);
  const raw = await fs.readFile(manifestPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });

  if (raw === null) {
    return { previous: null, hash: '' };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${manifestPath} is not valid JSON. Fix or remove it before regenerating.`);
  }

  return { previous: parsed as PreviousMusicManifest, hash: hashMusicManifest(raw) };
}

// 与 CLI 生成器完全相同的写法：两空格缩进加一个结尾换行，保证 diff 稳定
export async function writeMusicManifestFile(
  contentRoot: string,
  document: MusicManifestDocument,
): Promise<{ hash: string }> {
  const raw = `${JSON.stringify(document, null, 2)}\n`;

  await fs.writeFile(getMusicManifestPath(contentRoot), raw, 'utf8');

  return { hash: hashMusicManifest(raw) };
}
