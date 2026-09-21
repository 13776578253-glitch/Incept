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

// history：扩展名统一转小写后成为文件名的一部分
const musicAudioFormats = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
} as const;

export type MusicAudioExtension = keyof typeof musicAudioFormats;

export type MusicMediaMode = 'publish' | 'dry-run';
export type MusicMediaStatus = 'publish' | 'reuse';

// 目标文件是不是就是本次这份字节：文件名本身就是内容哈希，但仍然重新读一遍再算一次哈希。
// 只比尺寸的话，外部把文件换成"尺寸相同的错误内容"时会被判成完好，服务端会一直把坏文件发出去。
async function readMusicMediaHash(targetPath: string): Promise<string | null> {
  const existing = await fs.readFile(targetPath).catch(() => null);

  return existing === null ? null : crypto.createHash('sha256').update(existing).digest('hex');
}

const musicPublishAttempts = 3;

// 把临时文件放到最终位置。两个并发上传同一份内容时，这个"先删再改名"会和对方的改名打架
// （Windows 上 rename 覆盖已存在的文件直接 EPERM）：失败后重新哈希目标，已经是同一份就当对方赢了、按复用收场，否则再试一次。
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

// 白名单的文案只有一份：上传路由要在读请求体之前就拒绝，store 里保留同一道检查作为兜底
export function musicAudioExtensionError(extension: string): string {
  return `Unsupported music file extension "${extension || '(none)'}". Allowed: ${Object.keys(musicAudioFormats).join(', ')}.`;
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

  // history：重新校验字节，只检查存在会让损坏或被截断的文件被静默复用，而服务端会一直把这份坏文件发出去
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

// history：删除镜像里的一个文件：只接受镜像目录下的裸文件名，任何路径成分都拒绝 / 内容寻址 文件名就是哈希，因此这里负责"文件能不能删"，由调用方先确认没有行再引用它
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

// 网页上传：一个请求一个文件，请求体就是原始字节
// 边写临时文件边算哈希与计数，超过上限立刻中断——不能把 128 MB 读进内存
// 临时文件与目标同目录，因此最后的 rename 是原子的；失败一律删掉临时文件
export async function storeMusicUpload(input: {
  stream: ReadableStream<Uint8Array>;
  filename: string;
  // 可注入，便于用临时目录测试
  directory?: string;
  // 可注入，便于测试超限路径；默认沿用镜像上限
  maxBytes?: number;
  // 落盘前的最终校验：拿到临时文件后确认它真的是音频，并返回真实格式。
  // 抛错时临时文件会被删掉，垃圾文件绝不进入镜像目录；返回的扩展名用于命名与 MIME，因此"按真实格式存储"
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

// 整个上传体读进内存：整体解密/解析的输入（NCM）/普通音频流式落盘
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

// 存一份已经在内存里解密好的音频：与 storeMusicUpload 共用同一套内容寻址语义（目标重新哈希后一致才复用，否则先写临时文件再原子改名）
// validate 在发布之前跑，和普通上传的 resolveExtension 同一套"先验后发"：解码结果只有魔数对、解析不出音频流时，镜像里不会留下任何东西
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
