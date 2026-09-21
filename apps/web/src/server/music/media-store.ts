import crypto from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

// 相对导入：本模块也被 scripts/ 下的 CLI 加载，它解析不到 @/ 别名
import { findRepoRoot } from '../../features/docs/importer/paths';

export const musicMediaPublicPath = '/_music-media';

// 镜像最大值 128 MB
export const musicMediaMaxBytes = 128 * 1024 * 1024;

// 白名单：扩展名 → MIME；小写扩展名同时是镜像文件名的后缀
const musicAudioFormats = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
} as const;

export type MusicAudioExtension = keyof typeof musicAudioFormats;

export type MusicMediaMode = 'publish' | 'dry-run';
export type MusicMediaStatus = 'publish' | 'reuse';

// 复用前重新哈希目标：哈希一致才算同一份字节，尺寸相同不算
async function readMusicMediaHash(targetPath: string): Promise<string | null> {
  const existing = await fs.readFile(targetPath).catch(() => null);

  return existing === null ? null : crypto.createHash('sha256').update(existing).digest('hex');
}

const musicPublishAttempts = 3;

// 发布临时文件：改名冲突就重新哈希目标，已是同一份就按复用收场
async function publishMusicTempFile(input: {
  tempPath: string;
  targetPath: string;
  hash: string;
}): Promise<MusicMediaStatus> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rm(input.targetPath, { force: true });
      await fs.rename(input.tempPath, input.targetPath);

      return 'publish';
    } catch (error) {
      if ((await readMusicMediaHash(input.targetPath)) === input.hash) {
        await fs.rm(input.tempPath, { force: true });

        return 'reuse';
      }

      if (attempt >= musicPublishAttempts) {
        // 彻底失败也要把临时文件收走：错误交给调用方，镜像目录里不留垃圾
        await fs.rm(input.tempPath, { force: true });
        throw error;
      }
    }
  }
}

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

// 扩展名被拒时的文案，上传路由与 store 共用
export function musicAudioExtensionError(extension: string): string {
  return `Unsupported music file extension "${extension || '(none)'}". Allowed: ${Object.keys(musicAudioFormats).join(', ')}.`;
}

// 镜像目录的唯一来源：清单导入与网页上传共用
export function musicMediaMirrorDirectory(): string {
  return path.join(findRepoRoot(), 'apps', 'web', 'public', '_music-media');
}

export function musicMediaFileName(hash: string, extension: string): string {
  return `${hash}${extension.toLowerCase()}`;
}

// 校验单个清单条目：解析、防符号链接逃逸、检查扩展名与体积
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

  // 用 realpath 的结果做包含性判断：字符串前缀挡不住指向根目录外的符号链接
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

  // 目标已存在就重新校验：不一致直接覆盖重写
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

// 删除镜像里的一个文件：只接受裸文件名，任何路径成分都拒绝
// 目录可注入，便于用临时目录测试；生产调用走默认镜像目录（清理入口）
export async function removeMusicMediaByUrl(url: string, directory?: string): Promise<boolean> {
  const prefix = `${musicMediaPublicPath}/`;
  const fileName = url.startsWith(prefix) ? url.slice(prefix.length) : '';

  if (fileName === '' || fileName !== path.basename(fileName)) {
    return false;
  }

  const mirror = directory ?? musicMediaMirrorDirectory();
  const targetPath = path.join(mirror, fileName);
  const relative = path.relative(mirror, targetPath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return false;
  }

  const existing = await fs.stat(targetPath).catch(() => null);

  if (existing === null) {
    return false;
  }

  await fs.rm(targetPath, { force: true });

  return true;
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

// 网页上传：边写临时文件边算哈希与计数，超限立刻中断；临时文件与目标同目录，改名是原子的
export async function storeMusicUpload(input: {
  stream: ReadableStream<Uint8Array>;
  filename: string;
  // 可注入，便于用临时目录测试
  directory?: string;
  // 可注入，便于测试超限路径；默认沿用镜像上限
  maxBytes?: number;
  // 落盘前的最终校验：返回真实格式，抛错时临时文件被删掉
  resolveExtension?: (tempPath: string) => Promise<MusicAudioExtension>;
}): Promise<MusicUploadResult> {
  const extension = path.extname(input.filename).toLowerCase();

  if (!isMusicAudioExtension(extension)) {
    throw new Error(musicAudioExtensionError(extension));
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

  let storedExtension: MusicAudioExtension = extension;

  if (input.resolveExtension) {
    try {
      storedExtension = await input.resolveExtension(tempPath);
    } catch (error) {
      await fs.rm(tempPath, { force: true });
      throw error;
    }
  }

  const hash = digest.digest('hex');
  const fileName = musicMediaFileName(hash, storedExtension);
  const targetPath = path.join(directory, fileName);
  const targetUrl = `${musicMediaPublicPath}/${fileName}`;
  const mimeType = musicAudioFormats[storedExtension];

  if ((await readMusicMediaHash(targetPath)) === hash) {
    await fs.rm(tempPath, { force: true });

    return { hash, fileName, targetUrl, size, mimeType, storedPath: targetPath, status: 'reuse' };
  }

  const status = await publishMusicTempFile({ tempPath, targetPath, hash });

  return { hash, fileName, targetUrl, size, mimeType, storedPath: targetPath, status };
}

// 整块读进内存：NCM 解密需要完整字节
export async function readMusicUploadBytes(input: {
  stream: ReadableStream<Uint8Array>;
  maxBytes?: number;
}): Promise<Buffer> {
  const maxBytes = input.maxBytes ?? musicMediaMaxBytes;
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of Readable.fromWeb(
    input.stream as unknown as NodeReadableStream<Uint8Array>,
  )) {
    const buffer = Buffer.from(chunk as Uint8Array);
    size += buffer.byteLength;

    if (size > maxBytes) {
      throw new Error(`The file exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`);
    }

    chunks.push(buffer);
  }

  if (size === 0) {
    throw new Error('The request carried no file.');
  }

  return Buffer.concat(chunks);
}

// 存已解密好的音频：内容寻址语义与 storeMusicUpload 相同，validate 在发布前跑
export async function storeMusicAudioBytes(input: {
  bytes: Buffer;
  extension: string;
  directory?: string;
  validate?: (tempPath: string) => Promise<void>;
}): Promise<MusicUploadResult> {
  const extension = input.extension.toLowerCase();

  if (!isMusicAudioExtension(extension)) {
    throw new Error(musicAudioExtensionError(extension));
  }

  const mimeType = musicAudioFormats[extension];
  const directory = input.directory ?? musicMediaMirrorDirectory();
  await fs.mkdir(directory, { recursive: true });

  const hash = crypto.createHash('sha256').update(input.bytes).digest('hex');
  const fileName = musicMediaFileName(hash, extension);
  const targetPath = path.join(directory, fileName);
  const targetUrl = `${musicMediaPublicPath}/${fileName}`;
  const size = input.bytes.byteLength;
  const tempPath = path.join(directory, `${crypto.randomUUID()}.upload.tmp`);

  try {
    await fs.writeFile(tempPath, input.bytes, { flag: 'wx' });
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }

  if (input.validate) {
    try {
      await input.validate(tempPath);
    } catch (error) {
      await fs.rm(tempPath, { force: true });
      throw error;
    }
  }

  if ((await readMusicMediaHash(targetPath)) === hash) {
    await fs.rm(tempPath, { force: true });

    return { hash, fileName, targetUrl, size, mimeType, storedPath: targetPath, status: 'reuse' };
  }

  const status = await publishMusicTempFile({ tempPath, targetPath, hash });

  return { hash, fileName, targetUrl, size, mimeType, storedPath: targetPath, status };
}
