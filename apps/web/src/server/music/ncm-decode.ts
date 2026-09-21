import { createDecipheriv } from 'node:crypto';

// history：NCM（网易云加密容器）解码：移植自本机 ncm-converter 的同名实现，只保留上传链路需要的那部分——内存里解出原始音频与内嵌的标题/歌手
// 容器结构：CTENFDAM 魔数 → key 块（XOR 0x64 后 AES-128-ECB）→ 元数据块（XOR 0x63、base64 后 AES-128-ECB） → 9 字节（CRC32 + 5 字节保留）→ 封面块 → 其余是加密音频
const ncmMagic = 'CTENFDAM';
const keyPrefix = 'neteasecloudmusic';
const metaPrefix = "163 key(Don't modify):";
const metaJsonPrefix = 'music:';

// 两个固定的 AES-128 包装密钥，与容器格式本身一样是公开常量
const coreKey = Buffer.from('687a4852416d736f356b496e62617857', 'hex');
const metaKey = Buffer.from('2331346c6a6b5f215c5d2630553c2728', 'hex');

export type NcmAudioFormat = 'mp3' | 'flac';

export type NcmAudio = {
  // 解密后的原始音频字节，可以直接写盘
  audio: Buffer;
  // 由音频头部判定的真实格式：容器不转码，源是 mp3 就是 mp3
  format: NcmAudioFormat;
  title: string | null;
  artists: string[];
};

export type NcmErrorCode = 'NOT_NCM' | 'TRUNCATED' | 'KEY_DECRYPT_FAILED' | 'AUDIO_DECRYPT_FAILED';

export class NcmDecodeError extends Error {
  readonly code: NcmErrorCode;

  constructor(code: NcmErrorCode, message: string) {
    super(message);
    this.name = 'NcmDecodeError';
    this.code = code;
  }
}

export function isNcmDecodeError(error: unknown): error is NcmDecodeError {
  return error instanceof NcmDecodeError;
}

export function isNcmFileName(filename: string): boolean {
  return filename.toLowerCase().endsWith('.ncm');
}

export function decodeNcmAudio(input: Buffer): NcmAudio {
  const parsed = parseNcm(input);

  // 容器里可能同时留下 去过 padding 和 原样 两份密钥，逐个试到能认出音频为止
  for (const key of parsed.rc4Keys) {
    const audio = decryptAudio(parsed.encryptedAudio, buildKeyBox(key));
    const format = detectAudioFormat(audio);

    if (format !== null) {
      return { audio, format, title: parsed.title, artists: parsed.artists };
    }
  }

  throw new NcmDecodeError(
    'AUDIO_DECRYPT_FAILED',
    'The decrypted audio is neither mp3 nor flac; the file is probably damaged.',
  );
}

type ParsedNcm = {
  rc4Keys: Buffer[];
  title: string | null;
  artists: string[];
  encryptedAudio: Buffer;
};

function parseNcm(data: Buffer): ParsedNcm {
  if (data.length < 16 || data.subarray(0, 8).toString('latin1') !== ncmMagic) {
    throw new NcmDecodeError('NOT_NCM', 'The file does not start with the NCM magic header.');
  }

  let offset = 10;

  const readBlock = (label: string): Buffer => {
    if (offset + 4 > data.length) {
      throw new NcmDecodeError('TRUNCATED', `Unexpected end of file while reading the ${label} length.`);
    }

    const length = data.readUInt32LE(offset);
    offset += 4;

    if (offset + length > data.length) {
      throw new NcmDecodeError('TRUNCATED', `Unexpected end of file while reading the ${label} block.`);
    }

    const block = data.subarray(offset, offset + length);
    offset += length;

    return block;
  };

  const keyBlock = readBlock('key');
  const metaBlock = readBlock('metadata');

  offset += 9; // CRC32（4 字节）加 5 字节保留位

  const cover = readBlock('cover image');
  const encryptedAudio = data.subarray(offset);

  if (encryptedAudio.length === 0) {
    throw new NcmDecodeError('TRUNCATED', 'The file contains no audio payload.');
  }

  const metadata = parseMetadata(metaBlock);

  return {
    rc4Keys: extractRc4Keys(keyBlock),
    title: metadata.title,
    artists: metadata.artists,
    encryptedAudio,
  };
}

function extractRc4Keys(keyBlock: Buffer): Buffer[] {
  const scrambled = Buffer.from(keyBlock);

  for (let index = 0; index < scrambled.length; index += 1) {
    scrambled[index] ^= 0x64;
  }

  let plain: Buffer;

  try {
    plain = aes128EcbDecrypt(coreKey, scrambled);
  } catch (cause) {
    throw new NcmDecodeError('KEY_DECRYPT_FAILED', `The embedded key block could not be decrypted: ${String(cause)}`);
  }

  if (plain.subarray(0, keyPrefix.length).toString('latin1') !== keyPrefix) {
    throw new NcmDecodeError('KEY_DECRYPT_FAILED', 'The decrypted key block is missing its prefix.');
  }

  const unpadded = pkcs7Unpad(plain);
  const candidates = unpadded.length === plain.length ? [plain] : [unpadded, plain];

  return candidates.map((candidate) => candidate.subarray(keyPrefix.length));
}

function parseMetadata(metaBlock: Buffer): { title: string | null; artists: string[]; album: string | null } {
  const empty = { title: null, artists: [] as string[], album: null };

  if (metaBlock.length === 0) return empty;

  try {
    const scrambled = Buffer.from(metaBlock);

    for (let index = 0; index < scrambled.length; index += 1) {
      scrambled[index] ^= 0x63;
    }

    if (scrambled.subarray(0, metaPrefix.length).toString('latin1') !== metaPrefix) {
      return empty;
    }

    const binary = Buffer.from(scrambled.subarray(metaPrefix.length).toString('latin1'), 'base64');
    const alignedLength = Math.floor(binary.length / 16) * 16;

    if (alignedLength === 0) return empty;

    const plain = pkcs7Unpad(aes128EcbDecrypt(metaKey, binary.subarray(0, alignedLength)));
    const json = plain.subarray(metaJsonPrefix.length).toString('utf8');
    const record = JSON.parse(json) as Record<string, unknown>;

    // NetEase 写成 [[名字, id], ...]；只取名字，顺序原样保留
    const artists = Array.isArray(record.artist)
      ? record.artist
          .map((entry) => (Array.isArray(entry) && typeof entry[0] === 'string' ? entry[0] : null))
          .filter((name): name is string => name !== null && name.trim() !== '')
      : [];

    const title = typeof record.musicName === 'string' ? record.musicName.trim() : '';

    return {
      title: title === '' ? null : title,
      artists,
      album: typeof record.album === 'string' && record.album.trim() !== '' ? record.album.trim() : null,
    };
  } catch {
    // 元数据块坏了不影响音频：标题回退到标签或文件名
    return empty;
  }
}

function detectAudioFormat(data: Buffer): NcmAudioFormat | null {
  // "fLaC"
  if (data.length >= 4 && data[0] === 0x66 && data[1] === 0x4c && data[2] === 0x61 && data[3] === 0x43) {
    return 'flac';
  }

  // 带 ID3 标签的 MPEG 音频
  if (data.length >= 3 && data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) {
    return 'mp3';
  }

  // 裸 MPEG 帧同步（前 11 位为 1）
  if (data.length >= 2 && data[0] === 0xff && (data[1] & 0xe0) === 0xe0) {
    return 'mp3';
  }

  return null;
}

function aes128EcbDecrypt(key: Buffer, data: Buffer): Buffer {
  if (data.length === 0 || data.length % 16 !== 0) {
    throw new Error(`AES-128-ECB needs a non-empty multiple of 16 bytes, received ${data.length}`);
  }

  const decipher = createDecipheriv('aes-128-ecb', key, null);
  decipher.setAutoPadding(false);

  return Buffer.concat([decipher.update(data), decipher.final()]);
}

function pkcs7Unpad(data: Buffer, blockSize = 16): Buffer {
  if (data.length === 0) return data;

  const padding = data[data.length - 1];

  if (padding < 1 || padding > blockSize || padding > data.length) return data;

  for (let index = data.length - padding; index < data.length; index += 1) {
    if (data[index] !== padding) return data;
  }

  return data.subarray(0, data.length - padding);
}

function buildKeyBox(key: Uint8Array): Uint8Array {
  const box = new Uint8Array(256);

  for (let index = 0; index < 256; index += 1) {
    box[index] = index;
  }

  let j = 0;

  for (let index = 0; index < 256; index += 1) {
    j = (j + box[index] + key[index % key.length]) & 0xff;
    const swap = box[index];
    box[index] = box[j];
    box[j] = swap;
  }

  return box;
}

// 网易的流加密：RC4 的密钥调度被展开成预计算表，表本身在运行时不再变化
function decryptAudio(encrypted: Buffer, keyBox: Uint8Array): Buffer {
  const output = Buffer.allocUnsafe(encrypted.length);

  for (let index = 0; index < encrypted.length; index += 1) {
    const step = (index + 1) & 0xff;
    output[index] = encrypted[index] ^ keyBox[(keyBox[step] + keyBox[(keyBox[step] + step) & 0xff]) & 0xff];
  }

  return output;
}
