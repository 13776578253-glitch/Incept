// @vitest-environment node
import { createCipheriv, randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';

import { NcmDecodeError, decodeNcmAudio, isNcmFileName } from '../ncm-decode';

const coreKey = Buffer.from('687a4852416d736f356b496e62617857', 'hex');
const metaKey = Buffer.from('2331346c6a6b5f215c5d2630553c2728', 'hex');

const id3Audio = Buffer.concat([Buffer.from('ID3', 'latin1'), Buffer.alloc(64, 7)]);
const flacAudio = Buffer.concat([Buffer.from('fLaC', 'latin1'), Buffer.alloc(64, 9)]);

function aes128EcbEncrypt(key: Buffer, data: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(false);

  return Buffer.concat([cipher.update(data), cipher.final()]);
}

function pkcs7Pad(data: Buffer, blockSize = 16): Buffer {
  const padding = blockSize - (data.length % blockSize);

  return Buffer.concat([data, Buffer.alloc(padding, padding)]);
}

function xorInPlace(data: Buffer, value: number): void {
  for (let index = 0; index < data.length; index += 1) {
    data[index] ^= value;
  }
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);

  return buffer;
}

function rc4Transform(data: Buffer, keyText: string): Buffer {
  const key = Buffer.from(keyText, 'latin1');
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

  const output = Buffer.allocUnsafe(data.length);

  for (let index = 0; index < data.length; index += 1) {
    const step = (index + 1) & 0xff;
    output[index] = data[index] ^ box[(box[step] + box[(box[step] + step) & 0xff]) & 0xff];
  }

  return output;
}

function buildNcm(input: {
  audio: Buffer;
  metadata?: Record<string, unknown> | null;
  cover?: Buffer;
}): Buffer {
  const rc4Key = randomBytes(48).toString('base64').replace(/[+/=]/gu, 'A');
  const keyPlain = pkcs7Pad(
    Buffer.concat([Buffer.from('neteasecloudmusic', 'latin1'), Buffer.from(rc4Key, 'latin1')]),
  );
  const keyBlock = aes128EcbEncrypt(coreKey, keyPlain);
  xorInPlace(keyBlock, 0x64);

  let metaPlain = Buffer.alloc(0);

  if (input.metadata) {
    const metaJson = Buffer.from(`music:${JSON.stringify(input.metadata)}`, 'utf8');
    const metaBlock = aes128EcbEncrypt(metaKey, pkcs7Pad(metaJson));
    metaPlain = Buffer.from(`163 key(Don't modify):${metaBlock.toString('base64')}`, 'latin1');
    xorInPlace(metaPlain, 0x63);
  }

  const cover = input.cover ?? Buffer.alloc(0);

  return Buffer.concat([
    Buffer.from('CTENFDAM', 'latin1'),
    Buffer.from([0x01, 0x70]),
    uint32(keyBlock.length),
    keyBlock,
    uint32(metaPlain.length),
    metaPlain,
    uint32(0),
    Buffer.alloc(5),
    uint32(cover.length),
    cover,
    rc4Transform(input.audio, rc4Key),
  ]);
}

function neteaseMetadata(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    musicId: '42',
    musicName: '心做し',
    artist: [
      ['GUMI', '9'],
      ['一之瀬ユウ', '10'],
    ],
    album: 'Synthetic Album',
    albumId: '99',
    bitrate: 320000,
    duration: 268000,
    format: 'mp3',
    albumPic: 'http://example.invalid/cover.jpg',
    ...overrides,
  };
}

it('decodes an mp3 container and keeps its embedded title and artists', () => {
  const decoded = decodeNcmAudio(buildNcm({ audio: id3Audio, metadata: neteaseMetadata() }));

  expect(decoded.format).toBe('mp3');
  expect(decoded.audio.equals(id3Audio)).toBe(true);
  expect(decoded.title).toBe('心做し');
  expect(decoded.artists).toEqual(['GUMI', '一之瀬ユウ']);
});

it('detects flac audio and tolerates a missing or broken metadata block', () => {
  const withoutMetadata = decodeNcmAudio(buildNcm({ audio: flacAudio, metadata: null }));

  expect(withoutMetadata.format).toBe('flac');
  expect(withoutMetadata.audio.equals(flacAudio)).toBe(true);
  expect(withoutMetadata.title).toBeNull();
  expect(withoutMetadata.artists).toEqual([]);

  const brokenMetadata = decodeNcmAudio(
    buildNcm({ audio: flacAudio, metadata: { musicName: 'ignored', artist: 'not-an-array' } }),
  );

  expect(brokenMetadata.format).toBe('flac');
  expect(brokenMetadata.title).toBe('ignored');
  expect(brokenMetadata.artists).toEqual([]);
});

it('recognises a bare MPEG frame sync as mp3', () => {
  const audio = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(32, 3)]);

  expect(decodeNcmAudio(buildNcm({ audio })).format).toBe('mp3');
});

it('rejects inputs that are not ncm containers, with a code', () => {
  const notNcm = (() => {
    try {
      decodeNcmAudio(Buffer.from('this is just an mp3, honestly', 'utf8'));
      return null;
    } catch (error) {
      return error;
    }
  })();

  expect(notNcm).toBeInstanceOf(NcmDecodeError);
  expect((notNcm as NcmDecodeError).code).toBe('NOT_NCM');
  expect(() => decodeNcmAudio(Buffer.alloc(0))).toThrow(/magic header/u);
});

it('reports a truncated container instead of decoding garbage', () => {
  const fixture = buildNcm({ audio: id3Audio, metadata: neteaseMetadata() });

  expect(() => decodeNcmAudio(fixture.subarray(0, 40))).toThrow(/Unexpected end of file/u);
  // history：正好切在音频开始处：容器还在，但没有音频载荷
  expect(() =>
    decodeNcmAudio(fixture.subarray(0, fixture.length - id3Audio.length)),
  ).toThrow(/no audio payload/u);
});

it('recognises ncm file names case-insensitively', () => {
  expect(isNcmFileName('心做し.NCM')).toBe(true);
  expect(isNcmFileName('song.ncm')).toBe(true);
  expect(isNcmFileName('song.mp3')).toBe(false);
});
