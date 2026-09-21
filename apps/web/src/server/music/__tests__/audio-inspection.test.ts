// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { inspectUploadedAudio, sniffMusicAudioFormat } from '../audio-inspection';

let directory: string;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-inspection-'));
});

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

// 合成 fixture
function wavFile(seconds = 1): Buffer {
  const dataBytes = seconds * 8000 * 2; // 8000 Hz, mono, 16-bit
  const bytes = Buffer.alloc(44 + dataBytes);

  bytes.write('RIFF', 0, 'latin1');
  bytes.writeUInt32LE(36 + dataBytes, 4);
  bytes.write('WAVE', 8, 'latin1');
  bytes.write('fmt ', 12, 'latin1');
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36, 'latin1');
  bytes.writeUInt32LE(dataBytes, 40);

  return bytes;
}

function flacFile(seconds = 2): Buffer {
  const streamInfo = Buffer.alloc(34);
  const totalSamples = seconds * 44100;

  streamInfo.writeUInt16BE(4096, 0);
  streamInfo.writeUInt16BE(4096, 2);
  // 字节 10..17：采样率(20) | 声道-1(3) | 位深-1(5) | 总采样数(36)
  streamInfo.writeUInt32BE((44100 << 12) | (1 << 9) | (15 << 4), 10);
  streamInfo.writeUInt32BE(totalSamples, 14);

  return Buffer.concat([
    Buffer.from('fLaC', 'latin1'),
    Buffer.from([0x80, 0x00, 0x00, 0x22]),
    streamInfo,
  ]);
}

function id3Frame(id: string, text: string): Buffer {
  const payload = Buffer.concat([Buffer.from([0x00]), Buffer.from(text, 'latin1')]);
  const header = Buffer.alloc(10);

  header.write(id, 0, 'latin1');
  header.writeUInt32BE(payload.length, 4);

  return Buffer.concat([header, payload]);
}

function id3Tag(frames: Buffer[]): Buffer {
  const body = Buffer.concat(frames);
  const header = Buffer.alloc(10);

  header.write('ID3', 0, 'latin1');
  header[3] = 0x03;
  header[6] = (body.length >> 21) & 0x7f;
  header[7] = (body.length >> 14) & 0x7f;
  header[8] = (body.length >> 7) & 0x7f;
  header[9] = body.length & 0x7f;

  return Buffer.concat([header, body]);
}

function mp3File(options: { tag?: boolean } = {}): Buffer {
  const frame = Buffer.alloc(417); // MPEG-1 Layer III, 128 kbps, 44.1 kHz

  frame[0] = 0xff;
  frame[1] = 0xfb;
  frame[2] = 0x90;

  const frames = Array.from({ length: 40 }, () => frame);
  const tag = options.tag ? id3Tag([id3Frame('TIT2', 'Probe Song'), id3Frame('TPE1', 'Probe Artist')]) : id3Tag([]);

  return Buffer.concat([tag, ...frames]);
}

async function writeFile(name: string, bytes: Buffer): Promise<string> {
  const file = path.join(directory, name);

  await fs.writeFile(file, bytes);

  return file;
}

it('sniffs the real format from the file header alone', () => {
  expect(sniffMusicAudioFormat(wavFile())).toBe('wav');
  expect(sniffMusicAudioFormat(flacFile())).toBe('flac');
  expect(sniffMusicAudioFormat(mp3File())).toBe('mp3');
  expect(sniffMusicAudioFormat(Buffer.from('RIFF____AVI ', 'latin1'))).toBeNull();
  expect(sniffMusicAudioFormat(Buffer.from('plain text' ))).toBeNull();
  expect(
    sniffMusicAudioFormat(
      Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]),
    ),
  ).toBeNull();
  expect(sniffMusicAudioFormat(Buffer.alloc(0))).toBeNull();
});

it('accepts a parsable file with no tags and leaves the metadata empty', async () => {
  const file = await writeFile('untagged.wav', wavFile());
  const inspection = await inspectUploadedAudio(file);

  expect(inspection).toEqual({ ok: true, format: 'wav', title: null, artist: null, durationSeconds: 1 });
});

it('reports the real format regardless of the name it was uploaded under', async () => {
  const file = await writeFile('mislabeled.mp3', wavFile());
  const inspection = await inspectUploadedAudio(file);

  expect(inspection.ok).toBe(true);
  expect(inspection.ok ? inspection.format : null).toBe('wav');
  expect(inspection.ok ? inspection.durationSeconds : null).toBe(1);
});

it('reads tags when the file carries them', async () => {
  const file = await writeFile('tagged.mp3', mp3File({ tag: true }));
  const inspection = await inspectUploadedAudio(file);

  expect(inspection.ok).toBe(true);
  expect(inspection.ok ? inspection.title : null).toBe('Probe Song');
  expect(inspection.ok ? inspection.artist : null).toBe('Probe Artist');
  expect(inspection.ok ? inspection.durationSeconds : null).toBe(1);
});

it('rejects a text file that only pretends to be audio', async () => {
  const file = await writeFile('notes.mp3', Buffer.from('this is definitely not audio', 'utf8'));
  const inspection = await inspectUploadedAudio(file);

  expect(inspection.ok).toBe(false);
  expect(inspection.ok ? null : inspection.error).toMatch(/not MP3, WAV or FLAC/u);
});

it('rejects an image renamed to an audio extension', async () => {
  const file = await writeFile(
    'cover.flac',
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]),
  );
  const inspection = await inspectUploadedAudio(file);

  expect(inspection.ok).toBe(false);
});

it('rejects a file that is only a container shell with no audio stream', async () => {
  // 只剩一个 ID3 头 / 只剩 FLAC 魔数：签名嗅探通过，music-metadata 也不抛错，但解析不出采样率
  const id3Only = await writeFile(
    'shell.mp3',
    Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  );
  const emptyFlac = await writeFile('shell.flac', Buffer.from('fLaC', 'latin1'));

  for (const file of [id3Only, emptyFlac]) {
    const inspection = await inspectUploadedAudio(file);

    expect(inspection.ok).toBe(false);
    expect(inspection.ok ? null : inspection.error).toMatch(/no readable audio stream/u);
  }
});
