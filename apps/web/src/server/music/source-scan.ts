import fs from 'node:fs/promises';
import path from 'node:path';

// 与 media-store 的白名单一致。这里刻意不导入 app 模块：清单相关的代码只处理路径与 JSON
// 不需要为此承担类型耦合，代价是这份三元素白名单要与之同步
export const MUSIC_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac'];

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

// 递归扫描内容根，返回相对根目录、正斜杠分隔并排好序的音频路径
// CLI 的生成器与设置页的管理界面共用这一份实现
export async function collectMusicAudioFiles(root: string): Promise<string[]> {
  return (await collect(root, root)).sort();
}
