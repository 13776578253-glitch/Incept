import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';

import { parseStream } from 'music-metadata';

export type MusicAudioFormat = 'mp3' | 'wav' | 'flac';

// 真实格式对应的扩展名
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

// music-metadata 会先按扩展名猜解析器：文件名说 .mp3、内容是 WAV 时它读不出音频流
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

// 上传后的最终校验：签名必须命中三种格式之一，music-metadata 还必须能解析
// 解析成功但没有标签是允许的（title/artist 为 null，界面回退到文件名）；解析失败一律拒绝，不放进曲库
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

  try {
    // parseStream ：parseFile 只按扩展名挑解析器，文件名说 .mp3、内容是 WAV 时读不出音频流；告诉它用哪种解析器
    const metadata = await parseStream(createReadStream(storedPath), formatMimeTypes[format]);
    const sampleRate = metadata.format.sampleRate;

    // 解析出音频流（采样率）：只剩一个 ID3 头、或截断到只剩容器壳的文件，music-metadata 不报错但给不出采样率
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
  }
}
