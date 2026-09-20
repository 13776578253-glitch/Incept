// @vitest-environment node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { storeMusicUpload } from '../media-store';

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

it('replaces a mirror file whose size does not match the uploaded bytes', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const hash = sha256(bytes);

  // 同名但被截断：重写，不当作可复用
  await fs.writeFile(path.join(directory, `${hash}.wav`), Buffer.from([1, 2]));

  const result = await storeMusicUpload({ stream: streamOf(bytes), filename: 'take.wav', directory });

  expect(result.status).toBe('publish');
  expect((await fs.readFile(result.storedPath)).byteLength).toBe(3);
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
