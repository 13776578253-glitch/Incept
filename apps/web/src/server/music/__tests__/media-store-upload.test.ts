// @vitest-environment node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { removeMusicMediaByUrl, storeMusicAudioBytes, storeMusicUpload } from '../media-store';

let directory: string;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'music-upload-'));
});

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

function sha256(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function streamOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }

      controller.close();
    },
  });
}

it('stores an upload as <sha256>.<ext> and leaves no temp file behind', async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const result = await storeMusicUpload({
    stream: streamOf(bytes),
    filename: 'Song.MP3',
    directory,
  });
  const hash = sha256(bytes);

  expect(result.hash).toBe(hash);
  expect(result.fileName).toBe(`${hash}.mp3`);
  expect(result.targetUrl).toBe(`/_music-media/${hash}.mp3`);
  expect(result.mimeType).toBe('audio/mpeg');
  expect(result.size).toBe(4);
  expect(result.status).toBe('publish');
  expect(await fs.readdir(directory)).toEqual([`${hash}.mp3`]);
  expect(await fs.readFile(result.storedPath)).toEqual(Buffer.from(bytes));
});

it('reuses an existing mirror file for identical bytes', async () => {
  const bytes = new Uint8Array([9, 8, 7]);

  const first = await storeMusicUpload({ stream: streamOf(bytes), filename: 'one.wav', directory });
  const second = await storeMusicUpload({ stream: streamOf(bytes), filename: 'two.wav', directory });

  expect(first.status).toBe('publish');
  expect(second.status).toBe('reuse');
  expect(second.fileName).toBe(first.fileName);
  expect(await fs.readdir(directory)).toEqual([first.fileName]);
});

it('replaces a mirror file whose contents do not match the hash', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const hash = sha256(bytes);

  // 文件名与尺寸都对得上，但内容不是这一份：重新哈希才看得见，必须重写
  await fs.writeFile(path.join(directory, `${hash}.wav`), Buffer.from([1, 2, 9]));

  const result = await storeMusicUpload({ stream: streamOf(bytes), filename: 'take.wav', directory });

  expect(result.status).toBe('publish');
  expect(await fs.readFile(result.storedPath)).toEqual(Buffer.from(bytes));
});

it('replaces a truncated mirror file', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const hash = sha256(bytes);

  await fs.writeFile(path.join(directory, `${hash}.wav`), Buffer.from([1, 2]));

  const result = await storeMusicUpload({ stream: streamOf(bytes), filename: 'take.wav', directory });

  expect(result.status).toBe('publish');
  expect((await fs.readFile(result.storedPath)).byteLength).toBe(3);
});

it('stores under the extension the validator returns, not the one on the filename', async () => {
  const bytes = new Uint8Array([4, 5, 6]);
  const result = await storeMusicUpload({
    stream: streamOf(bytes),
    filename: 'song.mp3',
    directory,
    resolveExtension: async () => '.flac',
  });

  expect(result.fileName).toBe(`${sha256(bytes)}.flac`);
  expect(result.mimeType).toBe('audio/flac');
  expect(await fs.readdir(directory)).toEqual([`${sha256(bytes)}.flac`]);
});

it('publishes nothing and removes the temp file when the validator rejects', async () => {
  await expect(
    storeMusicUpload({
      stream: streamOf(new Uint8Array([1, 2, 3])),
      filename: 'junk.mp3',
      directory,
      resolveExtension: async () => {
        throw new Error('The file is not MP3, WAV or FLAC audio.');
      },
    }),
  ).rejects.toThrow('The file is not MP3, WAV or FLAC audio.');

  expect(await fs.readdir(directory)).toEqual([]);
});

it('rejects an unsupported extension without writing anything', async () => {
  await expect(
    storeMusicUpload({ stream: streamOf(new Uint8Array([1])), filename: 'notes.txt', directory }),
  ).rejects.toThrow(/Unsupported music file extension/u);

  expect(await fs.readdir(directory)).toEqual([]);
});

it('stops past the size limit and removes the temp file', async () => {
  const chunk = new Uint8Array(8);

  await expect(
    storeMusicUpload({
      stream: streamOf(chunk, chunk),
      filename: 'big.wav',
      directory,
      maxBytes: 10,
    }),
  ).rejects.toThrow(/exceeds/u);

  expect(await fs.readdir(directory)).toEqual([]);
});

it('reuses stored audio bytes only when the target re-hashes to the same value', async () => {
  const bytes = Buffer.from([7, 7, 7, 7]);

  const first = await storeMusicAudioBytes({ bytes, extension: '.mp3', directory });
  const second = await storeMusicAudioBytes({ bytes, extension: '.mp3', directory });

  expect(first.status).toBe('publish');
  expect(second.status).toBe('reuse');

  // 文件名与尺寸都一样，但内容被外部换过：重新哈希才看得见，必须重写
  await fs.writeFile(path.join(directory, `${sha256(bytes)}.mp3`), Buffer.from([7, 7, 7, 8]));

  const third = await storeMusicAudioBytes({ bytes, extension: '.mp3', directory });

  expect(third.status).toBe('publish');
  expect(await fs.readFile(third.storedPath)).toEqual(bytes);
});

it('publishes stored audio bytes only after the validator accepts them', async () => {
  const rejected = Buffer.from([1, 2, 3, 4]);

  // NCM 解码结果走的就是这条路：只有魔数对、解析不出音频流时，镜像里不能留下任何东西
  await expect(
    storeMusicAudioBytes({
      bytes: rejected,
      extension: '.mp3',
      directory,
      validate: async () => {
        throw new Error('The file has no readable audio stream.');
      },
    }),
  ).rejects.toThrow('The file has no readable audio stream.');

  expect(await fs.readdir(directory)).toEqual([]);

  const accepted = await storeMusicAudioBytes({
    bytes: rejected,
    extension: '.mp3',
    directory,
    validate: async () => {},
  });

  expect(accepted.status).toBe('publish');
  expect(await fs.readdir(directory)).toEqual([accepted.fileName]);
  expect(await fs.readFile(accepted.storedPath)).toEqual(rejected);
});

it('removes a mirror file by URL and refuses names carrying any path component', async () => {
  const name = `${'a'.repeat(64)}.mp3`;

  await fs.writeFile(path.join(directory, name), Buffer.from([1, 2, 3]));

  expect(await removeMusicMediaByUrl(`/_music-media/${name}`, directory)).toBe(true);
  expect(await fs.readdir(directory)).toEqual([]);

  // 逃逸尝试与外部前缀都不接受，目录里的文件一个也不能少
  await fs.writeFile(path.join(directory, 'cover.jpg'), Buffer.from([1]));

  expect(await removeMusicMediaByUrl('/_music-media/../cover.jpg', directory)).toBe(false);
  expect(await removeMusicMediaByUrl('/_music-media/nested/cover.jpg', directory)).toBe(false);
  expect(await removeMusicMediaByUrl('https://example.com/_music-media/cover.jpg', directory)).toBe(false);
  expect(await removeMusicMediaByUrl(`/_music-media/${name}`, directory)).toBe(false);
  expect(await fs.readdir(directory)).toEqual(['cover.jpg']);
});

it('lets two uploads of the same bytes race for one target without failing', async () => {
  for (let round = 0; round < 5; round += 1) {
    const roundDirectory = path.join(directory, `round-${round}`);
    const bytes = new Uint8Array([5, 5, 5, round]);

    await fs.mkdir(roundDirectory, { recursive: true });

    const [first, second] = await Promise.all([
      storeMusicUpload({ stream: streamOf(bytes), filename: 'one.wav', directory: roundDirectory }),
      storeMusicUpload({ stream: streamOf(bytes), filename: 'two.wav', directory: roundDirectory }),
    ]);

    for (const result of [first, second]) {
      expect(['publish', 'reuse']).toContain(result.status);
      expect(result.fileName).toBe(first.fileName);
    }

    expect(await fs.readdir(roundDirectory)).toEqual([first.fileName]);
    expect(await fs.readFile(first.storedPath)).toEqual(Buffer.from(bytes));
  }
});
