import fs from 'node:fs/promises';
import path from 'node:path';

import { musicAudioFormats } from '../domain/media';

// 音频扩展名白名单：由 domain/media 导出派生
// history: 原各自维护白名单以避免类型耦合，同包后统一由 domain/media 派生
export const MUSIC_AUDIO_EXTENSIONS: string[] = Object.keys(musicAudioFormats);

async function collect(root: string, directory: string): Promise<string[]> {
  const dirents = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const dirent of dirents) {
    const absolute = path.join(directory, dirent.name);

    if (dirent.isDirectory()) {
      files.push(...(await collect(root, absolute)));
      continue;
    }

    if (dirent.isFile() && MUSIC_AUDIO_EXTENSIONS.includes(path.extname(dirent.name).toLowerCase())) {
      // 清单里的路径一律用正斜杠，保证跨平台一致
      files.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  }

  return files;
}

// 递归扫描内容根，返回相对根目录、正斜杠分隔、已排序的音频路径；CLI 与设置页共用
export async function collectMusicAudioFiles(root: string): Promise<string[]> {
  return (await collect(root, root)).sort();
}
