// @vitest-environment node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { mirrorRef, db } = vi.hoisted(() => ({
  mirrorRef: { directory: '' },
  db: {
    listAllMusicLibraries: vi.fn(),
    uploadMusicTrack: vi.fn(),
  },
}));

vi.mock('@/server/auth', () => ({
  getCurrentViewer: async () => ({ role: 'owner' }),
  hasSameOrigin: () => true,
}));

vi.mock('@incept/db/music', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@incept/db/music')>();

  return {
    ...actual,
    listAllMusicLibraries: db.listAllMusicLibraries,
    uploadMusicTrack: db.uploadMusicTrack,
  };
});

// 把镜像目录换到临时目录，其余实现保持真实 /含 fs 与真实解码/解析
vi.mock('@/server/music/media-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/music/media-store')>();

  return {
    ...actual,
    storeMusicUpload: (input: Parameters<typeof actual.storeMusicUpload>[0]) =>
      actual.storeMusicUpload({ ...input, directory: mirrorRef.directory }),
    storeMusicAudioBytes: (input: Parameters<typeof actual.storeMusicAudioBytes>[0]) =>
      actual.storeMusicAudioBytes({ ...input, directory: mirrorRef.directory }),
  };
});

import { buildNcmContainer } from '@/test/ncm-fixture';

import { POST } from '../route';

// 合成 WAV：结构合法/能被 music-metadata 解析
function wavBytes(seconds = 1): Buffer {
  const dataBytes = seconds * 8000 * 2;
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

// 合成 MP3：ID3v2 头 + 若干 MPEG-1 Layer III 帧，music-metadata 能读出采样率与时长
function mp3Bytes(frames = 40): Buffer {
  const tag = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const frame = Buffer.alloc(417);

  frame[0] = 0xff;
  frame[1] = 0xfb;
  frame[2] = 0x90;

  return Buffer.concat([tag, ...Array.from({ length: frames }, () => frame)]);
}

function sha256(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function uploadRequest(filename: string, library: string, body: Buffer): Request {
  const query = new URLSearchParams({ filename, library });

  return new Request(`http://localhost/api/internal/music/tracks?${query.toString()}`, {
    method: 'POST',
    body: new Uint8Array(body),
  });
}

function catalogTrack(overrides: Record<string, unknown> = {}) {
  return {
    id: 'track-1',
    trackKey: 'song',
    title: 'Song',
    artist: null,
    audioUrl: '/_music-media/one.wav',
    contentHash: 'hash-1',
    mimeType: 'audio/wav',
    fileSize: 1024,
    durationSeconds: 1,
    publishedAt: null,
    position: 1,
    isActive: true,
    libraries: ['default'],
    ...overrides,
  };
}

const library = { id: 'lib-default', key: 'default', title: 'default', position: 1, isActive: true };

beforeEach(async () => {
  mirrorRef.directory = await fs.mkdtemp(path.join(os.tmpdir(), 'music-route-'));
  db.listAllMusicLibraries.mockResolvedValue([library]);
  db.uploadMusicTrack.mockResolvedValue({ status: 'created', track: catalogTrack(), duplicates: [] });
});

afterEach(async () => {
  await fs.rm(mirrorRef.directory, { recursive: true, force: true });
  vi.clearAllMocks();
});

it('rejects an unsupported extension before reading the body', async () => {
  const response = await POST(uploadRequest('notes.txt', 'default', Buffer.from('hello')));

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    error: expect.stringMatching(/Unsupported music file extension/u),
  });
  expect(db.listAllMusicLibraries).not.toHaveBeenCalled();
  expect(await fs.readdir(mirrorRef.directory)).toEqual([]);
});

it('rejects an unknown or deactivated library before storing anything', async () => {
  db.listAllMusicLibraries.mockResolvedValue([{ ...library, isActive: false }]);

  const response = await POST(uploadRequest('song.mp3', 'default', wavBytes()));

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    error: expect.stringMatching(/does not exist or is deactivated/u),
  });
  expect(await fs.readdir(mirrorRef.directory)).toEqual([]);
});

it('rejects a text file that only pretends to be an mp3, leaving the mirror empty', async () => {
  const response = await POST(uploadRequest('fake.mp3', 'default', Buffer.from('definitely not audio')));

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    error: expect.stringMatching(/not MP3, WAV or FLAC/u),
  });
  expect(db.uploadMusicTrack).not.toHaveBeenCalled();
  expect(await fs.readdir(mirrorRef.directory)).toEqual([]);
});

it('rejects a broken ncm and reports the decoder code', async () => {
  const response = await POST(uploadRequest('broken.ncm', 'default', Buffer.from('not an ncm file')));

  expect(response.status).toBe(400);
  const payload = (await response.json()) as { code?: string };

  expect(payload.code).toBe('NOT_NCM');
  expect(await fs.readdir(mirrorRef.directory)).toEqual([]);
});

it('stores a wav that was named .mp3 under its real format and reports a created track', async () => {
  const bytes = wavBytes();
  const response = await POST(uploadRequest('mislabeled.mp3', 'default', bytes));
  const hash = sha256(bytes);

  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toMatchObject({
    mediaStatus: 'published',
    trackStatus: 'created',
    duplicates: [],
  });
  expect(await fs.readdir(mirrorRef.directory)).toEqual([`${hash}.wav`]);
  expect(db.uploadMusicTrack).toHaveBeenCalledWith({
    filename: 'mislabeled.mp3',
    title: 'mislabeled',
    artist: null,
    durationSeconds: 1,
    audioUrl: `/_music-media/${hash}.wav`,
    contentHash: hash,
    mimeType: 'audio/wav',
    fileSize: bytes.byteLength,
    libraryKeys: ['default'],
  });
});

it('reports reused media when the mirror already holds the same bytes', async () => {
  const bytes = wavBytes();

  await POST(uploadRequest('first.mp3', 'default', bytes));

  const response = await POST(uploadRequest('second.mp3', 'default', bytes));

  //命中复用文件，用例里的行仍按新建返回
  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toMatchObject({
    mediaStatus: 'reused',
    trackStatus: 'created',
  });
});

it('passes the dedup outcome and duplicate candidates through to the client', async () => {
  db.uploadMusicTrack.mockResolvedValue({
    status: 'membership-added',
    track: catalogTrack({ libraries: ['default', '精选'] }),
    duplicates: [
      { trackKey: 'other', title: 'Other Song', artist: null, durationSeconds: 12, reason: 'title-duration' },
    ],
  });

  const response = await POST(uploadRequest('song.mp3', 'default', wavBytes()));

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    trackStatus: 'membership-added',
    duplicates: [{ trackKey: 'other' }],
  });
});

it('reports a deactivated match without touching the row', async () => {
  db.uploadMusicTrack.mockResolvedValue({
    status: 'deactivated',
    track: catalogTrack({ isActive: false }),
    duplicates: [],
  });

  const response = await POST(uploadRequest('song.mp3', 'default', wavBytes()));

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    trackStatus: 'deactivated',
    track: { isActive: false },
  });
});

// 失败清理的边界：一个并发的同内容上传可能已经复用了这份文件、只是还没提交自己的行，
// 此刻按"没有行引用"删除就会让对方提交出指向已删文件的行，因此这里刻意不删：留下孤儿，
// 交给 `pnpm music:import --validate` 在安全时机报告与处理。
it('leaves the published mirror file in place when the database write fails', async () => {
  const bytes = wavBytes();
  const hash = sha256(bytes);

  db.uploadMusicTrack.mockRejectedValue(new Error('The library "default" does not exist.'));

  const response = await POST(uploadRequest('song.mp3', 'default', bytes));

  expect(response.status).toBe(400);
  expect(await fs.readdir(mirrorRef.directory)).toEqual([`${hash}.wav`]);
  expect(await fs.readFile(path.join(mirrorRef.directory, `${hash}.wav`))).toEqual(bytes);
});

it('leaves an already stored file untouched when the database write fails', async () => {
  const bytes = wavBytes();
  const hash = sha256(bytes);

  await POST(uploadRequest('first.mp3', 'default', bytes));

  db.uploadMusicTrack.mockRejectedValue(new Error('boom'));

  const response = await POST(uploadRequest('second.mp3', 'default', bytes));

  expect(response.status).toBe(400);
  expect(await fs.readdir(mirrorRef.directory)).toEqual([`${hash}.wav`]);
});

// NCM 与普通上传同一套"先验后发"：解密成功但解出来的音频解析不出音频流时，镜像目录必须仍然是空的
it('rejects an ncm whose decoded audio has no readable stream, publishing nothing', async () => {
  const shell = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

  const response = await POST(
    uploadRequest('broken.ncm', 'default', buildNcmContainer({ audio: shell })),
  );

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    error: expect.stringMatching(/no readable audio stream/u),
  });
  expect(db.uploadMusicTrack).not.toHaveBeenCalled();
  expect(await fs.readdir(mirrorRef.directory)).toEqual([]);
});

it('stores the decoded audio of a working ncm under its real format', async () => {
  const audio = mp3Bytes();
  const response = await POST(
    uploadRequest(
      'song.ncm',
      'default',
      buildNcmContainer({
        audio,
        metadata: { musicName: '容器歌名', artist: [['容器歌手', 7]] },
      }),
    ),
  );

  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toMatchObject({ trackStatus: 'created' });
  expect(await fs.readdir(mirrorRef.directory)).toEqual([`${sha256(audio)}.mp3`]);
  expect(db.uploadMusicTrack).toHaveBeenCalledWith(
    expect.objectContaining({
      title: '容器歌名',
      artist: '容器歌手',
      contentHash: sha256(audio),
      mimeType: 'audio/mpeg',
    }),
  );
});
