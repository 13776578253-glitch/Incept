import { expect, it } from 'vitest';

import { isUploadableMusicFileName, partitionMusicUploadFiles } from '../music-upload-filter';

it('accepts exactly the formats the server whitelists', () => {
  for (const name of ['song.mp3', 'Song.MP3', 'take.wav', 'album.flac', 'netease.NCM']) {
    expect(isUploadableMusicFileName(name)).toBe(true);
  }

  for (const name of ['cover.jpg', 'lyrics.lrc', 'notes.txt', 'archive.zip', 'song']) {
    expect(isUploadableMusicFileName(name)).toBe(false);
  }
});

it('splits a selection into candidates and skipped files', () => {
  const files = [{ name: 'song.mp3' }, { name: 'cover.jpg' }, { name: 'take.wav' }];
  const { candidates, skipped } = partitionMusicUploadFiles(files);

  expect(candidates.map((file) => file.name)).toEqual(['song.mp3', 'take.wav']);
  expect(skipped.map((file) => file.name)).toEqual(['cover.jpg']);
});
