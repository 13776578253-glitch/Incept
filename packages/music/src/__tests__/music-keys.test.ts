// @vitest-environment node
import path from 'node:path';
import { expect, it } from 'vitest';

import { deriveMusicTrackKey, slugifyMusicKey, titleFromFileName, uniqueMusicKey } from '../domain';

// R-KEYS 选 A 的语义锁：文件名工具必须与 path.posix 逐例一致（POSIX-only，'\' 是普通字符）
const corpus = [
  'track.mp3',
  'TRACK.MP3',
  'archive.tar.gz',
  'no-extension',
  '.hidden',
  '..',
  '..hidden',
  'a.',
  'a..b',
  'dir/track.mp3',
  'dir/sub/track.flac',
  '01-播客/心做し.mp3',
  'a.b/c',
  'dir/',
  'a.b/',
  '',
  '/',
  '//',
  '///',
  'a//b',
  'a//',
  '//a.b',
  'a\\b.mp3',
  'C:\\music\\song.mp3',
  'file-name_here.mp3',
  '/.hidden',
  '/..hidden',
  'x/.hidden',
  'x/..hidden',
  'dir//sub//t.mp3',
  ' .',
  '....',
  'a..',
  'a...',
  '.a',
  '.a.',
  '.a..',
  '..a',
  '..a.',
  'a.b.',
  '...b',
  '.a.b',
  'a...b',
  'x..',
  'x...',
  '.x.',
  '..x..',
  '..a..b',
  '.',
  './.',
  './/',
  'a/..',
  'a/...',
  '..mp3',
  '.mp3',
];

function posixReferenceTitle(file: string): string {
  const base = path.posix.basename(file, path.posix.extname(file));

  return base.replace(/[-_]+/g, ' ').trim() || base;
}

function posixReferenceTrackKey(filename: string, taken: Set<string>): string {
  const extension = path.posix.extname(filename);
  const withoutExtension =
    extension === '' ? filename : filename.slice(0, filename.length - extension.length);

  return uniqueMusicKey(slugifyMusicKey(withoutExtension), taken);
}

it('derives titles exactly like POSIX basename minus POSIX extname', () => {
  for (const file of corpus) {
    expect(titleFromFileName(file), file).toBe(posixReferenceTitle(file));
  }
});

it('derives track keys exactly like the POSIX extname split', () => {
  for (const file of corpus) {
    expect(deriveMusicTrackKey(file, new Set()), file).toBe(posixReferenceTrackKey(file, new Set()));
    expect(deriveMusicTrackKey(file, new Set(['demo'])), file).toBe(
      posixReferenceTrackKey(file, new Set(['demo'])),
    );
  }
});

it('treats backslashes as ordinary characters (POSIX-only)', () => {
  expect(titleFromFileName('a\\b.mp3')).toBe('a\\b');
  expect(deriveMusicTrackKey('a\\b.mp3', new Set())).toBe('a-b');
});
