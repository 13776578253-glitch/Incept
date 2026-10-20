import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { finished } from 'node:stream/promises';

import { parseFile, parseStream } from 'music-metadata';

export type MusicAudioFormat = 'mp3' | 'wav' | 'flac';

// 真实格式 → 扩展名
export const musicAudioFormatExtensions = {
  mp3: '.mp3',
  wav: '.wav',
  flac: '.flac',
} as const;

export type UploadedAudioMetadata = {
  title: string | null;
  artist: string | null;
  durationSeconds: number | null;
};

export type UploadedAudioInspection =
  | ({ ok: true; format: MusicAudioFormat } & UploadedAudioMetadata)
  | { ok: false; error: string };

const headerBytes = 12;

// 真实格式 → music-metadata 的解析 MIME
const formatMimeTypes: Record<MusicAudioFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
};

export function sniffMusicAudioFormat(header: Buffer): MusicAudioFormat | null {
  // "fLaC"
  if (header.length >= 4 && header.subarray(0, 4).toString('latin1') === 'fLaC') {
    return 'flac';
  }

  // RIFF....WAVE
  if (
    header.length >= 12 &&
    header.subarray(0, 4).toString('latin1') === 'RIFF' &&
    header.subarray(8, 12).toString('latin1') === 'WAVE'
  ) {
    return 'wav';
  }

  // 带 ID3 标签的 MPEG 音频
  if (header.length >= 3 && header.subarray(0, 3).toString('latin1') === 'ID3') {
    return 'mp3';
  }

  // 裸 MPEG 帧同步（前 11 位为 1）
  if (header.length >= 2 && header[0] === 0xff && (header[1] & 0xe0) === 0xe0) {
    return 'mp3';
  }

  return null;
}

// 上传后的最终校验：签名命中三种格式之一，且解析得出音频流
export async function inspectUploadedAudio(storedPath: string): Promise<UploadedAudioInspection> {
  let header: Buffer;

  try {
    const handle = await fs.open(storedPath, 'r');

    try {
      const buffer = Buffer.alloc(headerBytes);
      const { bytesRead } = await handle.read(buffer, 0, headerBytes, 0);
      header = buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  } catch {
    return { ok: false, error: 'The uploaded file could not be read.' };
  }

  const format = sniffMusicAudioFormat(header);

  if (format === null) {
    return { ok: false, error: 'The file is not MP3, WAV or FLAC audio.' };
  }

  const stream = createReadStream(storedPath);
  try {
    // 显式给定 MIME：parseStream 不按扩展名猜解析器
    const metadata = await parseStream(stream, formatMimeTypes[format]);
    const sampleRate = metadata.format.sampleRate;

    // 解析出采样率才算真的有音频流
    if (typeof sampleRate !== 'number' || !Number.isFinite(sampleRate) || sampleRate <= 0) {
      return { ok: false, error: 'The file has no readable audio stream.' };
    }

    const title = metadata.common.title?.trim();
    const artist = metadata.common.artist?.trim();
    const duration = metadata.format.duration;

    return {
      ok: true,
      format,
      title: title ? title : null,
      artist: artist ? artist : null,
      durationSeconds:
        typeof duration === 'number' && Number.isFinite(duration) && duration > 0
          ? Math.round(duration)
          : null,
    };
  } catch {
    return { ok: false, error: 'The audio file could not be parsed; it may be corrupt.' };
  } finally {
    // Metadata parsing may stop before EOF; release the handle before atomic publication.
    const closed = finished(stream, { cleanup: true }).catch(() => undefined);
    stream.destroy();
    await closed;
  }
}

// 时长只在导入时读一次并落库
export async function readAudioDurationSeconds(sourcePath: string): Promise<number | null> {
  try {
    const metadata = await parseFile(sourcePath);
    const duration = metadata.format.duration;

    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
      return null;
    }

    return Math.round(duration);
  } catch {
    // 读不到时长不阻断导入：曲目照样能播，列表少一列信息
    return null;
  }
}
