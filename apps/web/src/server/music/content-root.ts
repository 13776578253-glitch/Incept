import fs from 'node:fs/promises';
import path from 'node:path';

// 音乐内容根目录必须位于仓库之外：仓库只保存发布结果（站点 URL + 镜像），不保存音频原件
// 与 DOCS_CONTENT_ROOT 同一套约定，返回 realpath 之后的路径，便于后续做包含性判断
export async function getMusicContentRoot() {
  const configuredRoot = process.env.MUSIC_CONTENT_ROOT?.trim();

  if (!configuredRoot) {
    throw new Error(
      'MUSIC_CONTENT_ROOT is required for music imports. Set it to the absolute directory containing music.json and your audio files.',
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
    throw new Error(`MUSIC_CONTENT_ROOT must point to an existing directory: ${absoluteRoot}`);
  }
}
