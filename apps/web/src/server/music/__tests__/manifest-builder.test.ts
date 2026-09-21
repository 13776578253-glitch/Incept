// @vitest-environment node
import { expect, it } from 'vitest';

import { buildMusicManifest, type PreviousMusicManifest } from '../manifest-builder';

it('derives libraries from numbered folders and puts root files in the default library', () => {
  const { document, report } = buildMusicManifest({
    files: ['01-播客/episode-01.mp3', '02-音乐/album/track-01.mp3', 'intro.mp3'],
    previous: null,
  });

  expect(document.libraries).toEqual([
    { key: '播客', title: '播客', position: 1 },
    { key: '音乐', title: '音乐', position: 2 },
    { key: 'default', title: 'default', position: 3 },
  ]);

  expect(document.tracks.map((track) => [track.file, track.libraries])).toEqual([
    ['01-播客/episode-01.mp3', ['播客']],
    ['02-音乐/album/track-01.mp3', ['音乐']],
    ['intro.mp3', ['default']],
  ]);

  // trackKey 仍由完整路径派生：改文件夹名会产生新的 key（决策文档已记为后果）
  expect(document.tracks[0].trackKey).toBe('01-播客-episode-01');
  expect(report).toMatchObject({ files: 3, kept: 0, added: 3, missing: [] });
  expect(report.librariesAdded).toEqual(['播客', '音乐', 'default']);
});

it('rejects a first-level folder that is not numbered', () => {
  expect(() =>
    buildMusicManifest({ files: ['播客/episode-01.mp3'], previous: null }),
  ).toThrow(/is not numbered/u);
});

it('rejects two folders that derive the same library key', () => {
  expect(() =>
    buildMusicManifest({ files: ['01-音乐/a.mp3', '02-音乐/b.mp3'], previous: null }),
  ).toThrow(/derive the same library key "音乐"/u);
});

it('rejects two folders that share a number', () => {
  expect(() =>
    buildMusicManifest({ files: ['01-播客/a.mp3', '01-音乐/b.mp3'], previous: null }),
  ).toThrow(/use the same number 01/u);
});

it('keeps hand-written library titles, positions and memberships', () => {
  const previous: PreviousMusicManifest = {
    libraries: [{ key: '播客', title: '播客精选', position: 5 }],
    tracks: [
      {
        trackKey: 'custom-key',
        file: '01-播客/episode-01.mp3',
        title: '第一集',
        position: 7,
        libraries: ['播客', '音乐'],
      },
    ],
  };

  const { document } = buildMusicManifest({
    files: ['01-播客/episode-01.mp3', '02-音乐/x.mp3'],
    previous,
  });

  // 手写的顺序优先：播客保留 position 5，新曲库音乐拿到派生出来的 position 2
  expect(document.libraries).toEqual([
    { key: '音乐', title: '音乐', position: 2 },
    { key: '播客', title: '播客精选', position: 5 },
  ]);

  const [track] = document.tracks;

  expect(track).toMatchObject({
    trackKey: 'custom-key',
    title: '第一集',
    position: 7,
    libraries: ['播客', '音乐'],
  });
});

it('upgrades a legacy manifest that has no libraries at all', () => {
  const previous: PreviousMusicManifest = {
    tracks: [
      {
        trackKey: 'gumi-心做',
        file: '01-播客/episode-01.mp3',
        title: '心做し',
        position: 1,
      },
    ],
  };

  const { document } = buildMusicManifest({ files: ['01-播客/episode-01.mp3'], previous });

  expect(document.libraries).toEqual([{ key: '播客', title: '播客', position: 1 }]);
  expect(document.tracks[0]).toMatchObject({ trackKey: 'gumi-心做', libraries: ['播客'] });
});

it('removes a library that has no folder and no track referring to it', () => {
  const previous: PreviousMusicManifest = {
    libraries: [
      { key: '播客', title: '播客', position: 1 },
      { key: '旧库', title: '旧库', position: 2 },
    ],
    tracks: [
      { trackKey: 'a', file: '01-播客/episode-01.mp3', title: '第一集', position: 1, libraries: ['播客'] },
    ],
  };

  const { document, report } = buildMusicManifest({
    files: ['01-播客/episode-01.mp3'],
    previous,
  });

  expect(document.libraries.map((library) => library.key)).toEqual(['播客']);
  expect(report.librariesRemoved).toEqual(['旧库']);
});

it('keeps missing-on-disk entries and lets them hold a library alive', () => {
  const previous: PreviousMusicManifest = {
    libraries: [{ key: '播客', title: '播客', position: 1 }],
    tracks: [
      { trackKey: 'gone', file: '01-播客/gone.mp3', title: '走了', position: 1 },
      { trackKey: 'kept', file: '02-音乐/kept.mp3', title: '还在', position: 2, libraries: ['音乐'] },
    ],
  };

  const { document, report } = buildMusicManifest({ files: ['02-音乐/kept.mp3'], previous });

  // 播客的文件夹已经不在，但清单里仍有一条曲目引用它，所以曲库保留
  expect(document.libraries.map((library) => library.key)).toEqual(['播客', '音乐']);
  expect(report.missing).toEqual(['01-播客/gone.mp3']);
  expect(document.tracks.find((track) => track.trackKey === 'gone')).toMatchObject({
    libraries: ['播客'],
  });
});

it('rejects a hand-written library key that no folder derives and the previous manifest does not declare', () => {
  const previous: PreviousMusicManifest = {
    libraries: [{ key: '播客', title: '播客', position: 1 }],
    tracks: [
      {
        trackKey: 'a',
        file: '01-播客/episode-01.mp3',
        title: '第一集',
        position: 1,
        // 手误：musci 不是任何文件夹派生的 key
        libraries: ['播客', 'musci'],
      },
    ],
  };

  // 静默造出这个库，会让导入端的"引用未声明曲库"永远不触发
  expect(() =>
    buildMusicManifest({ files: ['01-播客/episode-01.mp3'], previous }),
  ).toThrow(/refers to the library "musci"/u);
});

it('keeps a declared library that only a track refers to', () => {
  const previous: PreviousMusicManifest = {
    libraries: [{ key: '精选', title: '精选', position: 4 }],
    tracks: [
      {
        trackKey: 'a',
        file: '01-播客/episode-01.mp3',
        title: '第一集',
        position: 1,
        libraries: ['播客', '精选'],
      },
    ],
  };

  const { document } = buildMusicManifest({ files: ['01-播客/episode-01.mp3'], previous });

  expect(document.libraries).toEqual([
    { key: '播客', title: '播客', position: 1 },
    { key: '精选', title: '精选', position: 4 },
  ]);
});

it('falls back to the default library for a missing entry whose folder is gone', () => {
  const previous: PreviousMusicManifest = {
    tracks: [
      { trackKey: 'gone', file: '03-老库/gone.mp3', title: '走了', position: 1 },
    ],
  };

  const { document } = buildMusicManifest({ files: ['01-播客/episode-01.mp3'], previous });

  // 老库既没有文件夹、上一版也没声明，不能凭空造出来
  expect(document.libraries).toEqual([
    { key: '播客', title: '播客', position: 1 },
    { key: 'default', title: 'default', position: 2 },
  ]);
  expect(document.tracks.find((track) => track.trackKey === 'gone')).toMatchObject({
    libraries: ['default'],
  });
});

it('lets a renamed folder keep the library key while the old entries stay behind', () => {
  const previous: PreviousMusicManifest = {
    libraries: [{ key: '播客', title: '播客', position: 9 }],
    tracks: [
      { trackKey: '01-播客-episode-01', file: '01-播客/episode-01.mp3', title: '第一集', position: 1 },
    ],
  };

  const { document, report } = buildMusicManifest({
    files: ['05-播客/episode-01.mp3'],
    previous,
  });

  // 前缀不进 key，所以改名（改变编号）不会换库；手写的 position 9 也留着
  expect(document.libraries).toEqual([{ key: '播客', title: '播客', position: 9 }]);
  expect(document.tracks.map((track) => track.file)).toEqual([
    '05-播客/episode-01.mp3',
    '01-播客/episode-01.mp3',
  ]);
  expect(document.tracks[0].trackKey).toBe('05-播客-episode-01');
  expect(report.missing).toEqual(['01-播客/episode-01.mp3']);
});
