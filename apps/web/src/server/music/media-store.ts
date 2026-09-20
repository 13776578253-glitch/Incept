import crypto from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

// 使用相对导入而不是 @/ 别名：本模块同时被 Next 和 scripts/ 下的导入 CLI 加载，而 CLI 在 packages/db 目录下运行，解析不到 apps/web 的路径映射
import { findRepoRoot } from '../../features/docs/importer/paths';

export const musicMediaPublicPath = '/_music-media';

// 镜像最大值 128 MB
export const musicMediaMaxBytes = 128 * 1024 * 1024;

// 扩展名统一转小写后成为文件名的一部分，因此"同内容不同扩展名"会被视为两个对象
// 这是刻意的取舍：文件名完全由内容摘要与扩展名决定，避免扩展名归一化带来的歧义
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
  repaired?: boolean;
  hash: string;
};

export function isMusicAudioExtension(extension: string): extension is MusicAudioExtension {
  return Object.prototype.hasOwnProperty.call(musicAudioFormats, extension.toLowerCase());
}

export function musicAudioMimeType(extension: string): string | null {
  const normalized = extension.toLowerCase();

  return isMusicAudioExtension(normalized) ? musicAudioFormats[normalized] : null;
}

// 镜像目录与文件名的唯一来源：清单导入（publishMusicMedia）与网页上传（storeMusicUpload）共用
export function musicMediaMirrorDirectory(): string {
  return path.join(findRepoRoot(), 'apps', 'web', 'public', '_music-media');
}

export function musicMediaFileName(hash: string, extension: string): string {
  return `${hash}${extension.toLowerCase()}`;
}

// 校验单个清单条目：解析、防符号链接逃逸、检查扩展名与体积
// 只 stat 不读内容，这样导入器可以在写任何东西之前把所有条目先验一遍
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

  // 用 realpath 之后的结果做包含性判断：字符串前缀比较挡不住指向根目录外的符号链接
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

  if (stats.size > musicMediaMaxBytes) {
    throw new Error(
      `Music file exceeds the ${Math.round(musicMediaMaxBytes / (1024 * 1024))} MB limit: ${relativeFile}`,
    );
  }

  return {
    sourcePath: realSourcePath,
    extension,
    mimeType: musicAudioFormats[extension],
    size: stats.size,
  };
}

// 内容寻址发布：文件名: sha256 + 小写扩展名
export async function publishMusicMedia({
  source,
  mode,
}: {
  source: MusicSourceInfo;
  mode: MusicMediaMode;
}): Promise<MusicMediaOperation> {
  const bytes = await fs.readFile(source.sourcePath);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const fileName = musicMediaFileName(hash, source.extension);
  const targetPath = path.join(musicMediaMirrorDirectory(), fileName);
  const targetUrl = `${musicMediaPublicPath}/${fileName}`;

  const operation: MusicMediaOperation = {
    ...source,
    size: bytes.byteLength,
    fileName,
    targetUrl,
    status: 'publish',
    hash,
  };

  // 存在不等于正确：文件名是内容哈希，因此必须重新校验字节。
  // 只检查存在会让损坏或被截断的文件被静默复用，而服务端会一直把这份坏文件发出去。
  const existingBytes = await fs.readFile(targetPath).catch(() => null);

  if (existingBytes !== null) {
    const existingHash = crypto.createHash('sha256').update(existingBytes).digest('hex');
    const isIntact = existingHash === hash && existingBytes.byteLength === bytes.byteLength;

    if (isIntact) {
      return { ...operation, status: 'reuse' };
    }

    if (mode === 'publish') {
      await fs.writeFile(targetPath, bytes);
    }

    return { ...operation, repaired: true };
  }

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

export type MusicUploadResult = {
  hash: string;
  fileName: string;
  targetUrl: string;
  size: number;
  mimeType: string;
  // 落在镜像里的路径，供上传后的标签解析使用
  storedPath: string;
  status: MusicMediaStatus;
};

// 网页上传：一个请求一个文件，请求体就是原始字节。
// 边写临时文件边算哈希与计数，超过上限立刻中断——不能把 128 MB 读进内存。
// 临时文件与目标同目录，因此最后的 rename 是原子的；失败一律删掉临时文件。
export async function storeMusicUpload(input: {
  stream: ReadableStream<Uint8Array>;
  filename: string;
  // 可注入，便于用临时目录测试
  directory?: string;
  // 可注入，便于测试超限路径；默认沿用镜像上限
  maxBytes?: number;
}): Promise<MusicUploadResult> {
  const extension = path.extname(input.filename).toLowerCase();
  const mimeType = musicAudioMimeType(extension);

  if (mimeType === null) {
    throw new Error(
      `Unsupported music file extension "${extension || '(none)'}". Allowed: ${Object.keys(musicAudioFormats).join(', ')}.`,
    );
  }

  const directory = input.directory ?? musicMediaMirrorDirectory();
  const maxBytes = input.maxBytes ?? musicMediaMaxBytes;
  await fs.mkdir(directory, { recursive: true });

  const tempPath = path.join(directory, `${crypto.randomUUID()}.upload.tmp`);
  const digest = crypto.createHash('sha256');
  let size = 0;

  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.byteLength;

      if (size > maxBytes) {
        callback(new Error(`The file exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`));
        return;
      }

      digest.update(chunk);
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(input.stream as unknown as NodeReadableStream<Uint8Array>),
      meter,
      createWriteStream(tempPath, { flags: 'wx' }),
    );
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }

  const hash = digest.digest('hex');
  const fileName = musicMediaFileName(hash, extension);
  const targetPath = path.join(directory, fileName);
  const targetUrl = `${musicMediaPublicPath}/${fileName}`;

  const existing = await fs.stat(targetPath).catch(() => null);

  // 文件名就是内容哈希：同尺寸即视为同一份字节，不再做第二次整文件哈希
  if (existing && existing.size === size) {
    await fs.rm(tempPath, { force: true });

    return { hash, fileName, targetUrl, size, mimeType, storedPath: targetPath, status: 'reuse' };
  }

  // 目标不存在，或存在但尺寸不符（截断/损坏）：用这次的字节替换它
  await fs.rm(targetPath, { force: true });
  await fs.rename(tempPath, targetPath);

  return { hash, fileName, targetUrl, size, mimeType, storedPath: targetPath, status: 'publish' };
}
