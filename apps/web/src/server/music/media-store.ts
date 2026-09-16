import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// 这里刻意用相对导入而不是 @/ 别名：本模块同时被 Next 和 scripts/ 下的导入 CLI 加载，
// 而 CLI 在 packages/db 目录下运行，解析不到 apps/web 的路径映射。
import { findRepoRoot } from '../../features/docs/importer/paths';

export const musicMediaPublicPath = '/_music-media';

// 音频与图片不是一个量级：无损单曲可以到 100 MB 以上，所以上限比 docs 镜像的 10 MB 宽松得多。
const maxAudioBytes = 128 * 1024 * 1024;

// 扩展名统一转小写后成为文件名的一部分，因此"同内容不同扩展名"会被视为两个对象。
// 这是刻意的取舍：文件名完全由内容摘要与扩展名决定，避免扩展名归一化带来的歧义。
const musicAudioFormats = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
} as const;

type MusicAudioExtension = keyof typeof musicAudioFormats;

export type MusicMediaMode = 'publish' | 'dry-run';
export type MusicMediaStatus = 'publish' | 'reuse';

export type MusicSourceInfo = {
  sourcePath: string;
  extension: MusicAudioExtension;
  mimeType: string;
  size: number;
};

export type MusicMediaOperation = MusicSourceInfo & {
  fileName: string;
  targetUrl: string;
  status: MusicMediaStatus;
  hash: string;
};

export function isMusicAudioExtension(extension: string): extension is MusicAudioExtension {
  return Object.prototype.hasOwnProperty.call(musicAudioFormats, extension.toLowerCase());
}

// 校验单个清单条目：解析、防符号链接逃逸、检查扩展名与体积。
// 只 stat 不读内容，这样导入器可以在写任何东西之前把所有条目先验一遍。
export async function inspectMusicSource(
  contentRoot: string,
  relativeFile: string,
): Promise<MusicSourceInfo> {
  const candidate = path.resolve(contentRoot, relativeFile);

  let realSourcePath: string;

  try {
    realSourcePath = await fs.realpath(candidate);
  } catch {
    throw new Error(`Music file not found under MUSIC_CONTENT_ROOT: ${relativeFile}`);
  }

  // 用 realpath 之后的结果做包含性判断：字符串前缀比较挡不住指向根目录外的符号链接。
  const relativeToRoot = path.relative(contentRoot, realSourcePath);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Music file must live inside MUSIC_CONTENT_ROOT: ${relativeFile}`);
  }

  const extension = path.extname(realSourcePath).toLowerCase();

  if (!isMusicAudioExtension(extension)) {
    throw new Error(
      `Unsupported music file extension "${extension || '(none)'}": ${relativeFile}. Allowed: ${Object.keys(musicAudioFormats).join(', ')}.`,
    );
  }

  const stats = await fs.stat(realSourcePath);

  if (!stats.isFile()) {
    throw new Error(`Music source must be a regular file: ${relativeFile}`);
  }

  if (stats.size > maxAudioBytes) {
    throw new Error(
      `Music file exceeds the ${Math.round(maxAudioBytes / (1024 * 1024))} MB limit: ${relativeFile}`,
    );
  }

  return {
    sourcePath: realSourcePath,
    extension,
    mimeType: musicAudioFormats[extension],
    size: stats.size,
  };
}

// 内容寻址发布：文件名 = sha256 + 小写扩展名。
// 已存在即复用，不重写；dry-run 只报告将要发布什么。
export async function publishMusicMedia({
  source,
  mode,
}: {
  source: MusicSourceInfo;
  mode: MusicMediaMode;
}): Promise<MusicMediaOperation> {
  const bytes = await fs.readFile(source.sourcePath);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const fileName = `${hash}${source.extension}`;
  const targetPath = path.join(findRepoRoot(), 'apps', 'web', 'public', '_music-media', fileName);
  const targetUrl = `${musicMediaPublicPath}/${fileName}`;

  const operation: MusicMediaOperation = {
    ...source,
    size: bytes.byteLength,
    fileName,
    targetUrl,
    status: 'publish',
    hash,
  };

  try {
    await fs.access(targetPath);

    return { ...operation, status: 'reuse' };
  } catch {
    if (mode === 'publish') {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, bytes, { flag: 'wx' }).catch(async (error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }
      });
    }

    return operation;
  }
}
