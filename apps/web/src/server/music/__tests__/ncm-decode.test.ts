// @vitest-environment node
import { expect, it } from 'vitest';

import { buildNcmContainer } from '@/test/ncm-fixture';

import { NcmDecodeError, decodeNcmAudio, isNcmFileName } from '../ncm-decode';

const id3Audio = Buffer.concat([Buffer.from('ID3', 'latin1'), Buffer.alloc(64, 7)]);
const flacAudio = Buffer.concat([Buffer.from('fLaC', 'latin1'), Buffer.alloc(64, 9)]);

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
  const decoded = decodeNcmAudio(buildNcmContainer({ audio: id3Audio, metadata: neteaseMetadata() }));

  expect(decoded.format).toBe('mp3');
  expect(decoded.audio.equals(id3Audio)).toBe(true);
  expect(decoded.title).toBe('心做し');
  expect(decoded.artists).toEqual(['GUMI', '一之瀬ユウ']);
});

it('detects flac audio and tolerates a missing or broken metadata block', () => {
  const withoutMetadata = decodeNcmAudio(buildNcmContainer({ audio: flacAudio, metadata: null }));

  expect(withoutMetadata.format).toBe('flac');
  expect(withoutMetadata.audio.equals(flacAudio)).toBe(true);
  expect(withoutMetadata.title).toBeNull();
  expect(withoutMetadata.artists).toEqual([]);

  const brokenMetadata = decodeNcmAudio(
    buildNcmContainer({ audio: flacAudio, metadata: { musicName: 'ignored', artist: 'not-an-array' } }),
  );

  expect(brokenMetadata.format).toBe('flac');
  expect(brokenMetadata.title).toBe('ignored');
  expect(brokenMetadata.artists).toEqual([]);
});

it('recognises a bare MPEG frame sync as mp3', () => {
  const audio = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(32, 3)]);

  expect(decodeNcmAudio(buildNcmContainer({ audio })).format).toBe('mp3');
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
  const fixture = buildNcmContainer({ audio: id3Audio, metadata: neteaseMetadata() });

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
