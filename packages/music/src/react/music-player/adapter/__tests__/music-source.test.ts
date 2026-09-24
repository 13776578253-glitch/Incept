import { expect, it } from 'vitest';

import {
  filterCatalogByLibrary,
  findCatalogAudioUrl,
  findCatalogPublishedAt,
  resolveLibrarySelection,
  resolveSourceChange,
  toMusicCatalog,
  type MusicTrackCatalogEntry,
} from '../music-source';
import { makeCatalogPayload, makeMixedCatalog, validCatalogTrack } from '../../../../testing/music-fixtures';

function entriesOf(payload: unknown): MusicTrackCatalogEntry[] {
  return toMusicCatalog(payload).entries;
}

it('a valid payload maps to catalogue entries and libraries', () => {
  const catalog = toMusicCatalog(makeCatalogPayload());
  const [entry] = catalog.entries;

  expect(catalog.libraries).toEqual([{ key: 'default', title: 'default', position: 1 }]);
  expect(entry.track.id).toBe('demo-01');
  expect(entry.track.title).toBe('演示曲目 01');
  expect(entry.track.artist).toBe('Incept');
  expect(entry.track.durationHint).toBe(268);
  expect(entry.audioUrl).toBe('/_music-media/abc.wav');
  expect(entry.publishedAt).toBe('2026-04-26T00:00:00.000Z');
  expect(entry.libraries).toEqual(['default']);
});

it('a payload without the libraries or tracks array is rejected', () => {
  expect(() => toMusicCatalog(null)).toThrow(/must be an object with a tracks array/u);
  expect(() => toMusicCatalog({ tracks: 'nope' })).toThrow(/must be an object with a tracks array/u);
  expect(() => toMusicCatalog({ libraries: [], tracks: [] })).not.toThrow();
  expect(() => toMusicCatalog({ tracks: [] })).toThrow(/must be an object with a libraries array/u);
  expect(() => toMusicCatalog({ libraries: {}, tracks: [] })).toThrow(
    /must be an object with a libraries array/u,
  );
});

it('missing required fields are rejected', () => {
  expect(() => entriesOf(makeCatalogPayload({ trackKey: '   ' }))).toThrow(/must carry trackKey/u);
  expect(() => entriesOf(makeCatalogPayload({ title: '' }))).toThrow(/must carry trackKey/u);
  expect(() => entriesOf(makeCatalogPayload({ audioUrl: '' }))).toThrow(/must carry trackKey/u);
});

// 重复身份会让队列里两首无法区分，在进入应用前拒绝
it('a duplicate trackKey is rejected', () => {
  const duplicates = {
    libraries: [{ key: 'default', title: 'default', position: 1 }],
    tracks: [
      { ...validCatalogTrack, libraries: ['default'], trackKey: 'same' },
      { ...validCatalogTrack, libraries: ['default'], trackKey: 'same' },
    ],
  };

  expect(() => toMusicCatalog(duplicates)).toThrow(/duplicate trackKey: same/u);
});

it('a non-positive or non-finite duration is rejected', () => {
  expect(() => entriesOf(makeCatalogPayload({ durationSeconds: 0 }))).toThrow(/unusable durationSeconds/u);
  expect(() => entriesOf(makeCatalogPayload({ durationSeconds: -5 }))).toThrow(/unusable durationSeconds/u);
  expect(() => entriesOf(makeCatalogPayload({ durationSeconds: 'x' }))).toThrow(/unusable durationSeconds/u);
});

it('an absent duration is allowed and becomes undefined', () => {
  const [entry] = entriesOf(makeCatalogPayload({ durationSeconds: null }));

  expect(entry.track.durationHint).toBeUndefined();
});

it('an unparsable date is rejected', () => {
  expect(() => entriesOf(makeCatalogPayload({ publishedAt: 'not-a-date' }))).toThrow(
    /unparsable publishedAt/u,
  );
});

it('an empty date string is treated as no date', () => {
  const [entry] = entriesOf(makeCatalogPayload({ publishedAt: '' }));

  expect(entry.publishedAt).toBeNull();
});

// 站外 http、data: 与 javascript: 不进入音频元素的 src
it('an unusable audioUrl is rejected', () => {
  expect(() => entriesOf(makeCatalogPayload({ audioUrl: 'http://evil.test/a.wav' }))).toThrow(
    /unusable audioUrl/u,
  );
  expect(() => entriesOf(makeCatalogPayload({ audioUrl: 'data:audio/wav;base64,AA' }))).toThrow(
    /unusable audioUrl/u,
  );
  expect(() => entriesOf(makeCatalogPayload({ audioUrl: 'javascript:alert(1)' }))).toThrow(
    /unusable audioUrl/u,
  );
  expect(() => entriesOf(makeCatalogPayload({ audioUrl: 'relative/a.wav' }))).toThrow(
    /unusable audioUrl/u,
  );
});

// https ：未来的对象存储/CDN 预留位置
it('an https audioUrl is accepted', () => {
  const [entry] = entriesOf(makeCatalogPayload({ audioUrl: 'https://cdn.test/a.wav' }));

  expect(entry.audioUrl).toBe('https://cdn.test/a.wav');
});

it('malformed library declarations are rejected', () => {
  expect(() =>
    toMusicCatalog({
      libraries: [
        { key: '音乐', title: '音乐', position: 1 },
        { key: '音乐', title: '另一个', position: 2 },
      ],
      tracks: [{ ...validCatalogTrack, libraries: ['音乐'] }],
    }),
  ).toThrow(/duplicate library key: 音乐/u);

  expect(() =>
    toMusicCatalog({ libraries: [{ key: '  ', title: '音乐', position: 1 }], tracks: [] }),
  ).toThrow(/must carry key and title/u);

  expect(() =>
    toMusicCatalog({ libraries: [{ key: '音乐', title: '音乐', position: 1.5 }], tracks: [] }),
  ).toThrow(/unusable position/u);
});

it('malformed track memberships are rejected', () => {
  expect(() => entriesOf(makeCatalogPayload({ libraries: 'default' }))).toThrow(
    /must carry a libraries array/u,
  );
  expect(() => entriesOf(makeCatalogPayload({ libraries: ['  '] }))).toThrow(/unusable library key/u);
  expect(() => entriesOf(makeCatalogPayload({ libraries: ['default', 'default'] }))).toThrow(
    /repeats the library key/u,
  );
  expect(() => entriesOf(makeCatalogPayload({ libraries: ['missing'] }))).toThrow(
    /refers to an undeclared library: missing/u,
  );
});

it('filters the catalogue by library, treating null as the all view', () => {
  const { entries } = makeMixedCatalog();

  expect(filterCatalogByLibrary(entries, null)).toHaveLength(3);
  expect(filterCatalogByLibrary(entries, '播客').map((entry) => entry.track.id)).toEqual([
    'pod-01',
    'both-01',
  ]);
  expect(filterCatalogByLibrary(entries, '音乐').map((entry) => entry.track.id)).toEqual([
    'music-01',
    'both-01',
  ]);
  expect(filterCatalogByLibrary(entries, '不存在')).toEqual([]);
});

it('falls back to the all view when the stored library is gone', () => {
  const { libraries } = makeMixedCatalog();

  expect(resolveLibrarySelection(libraries, null)).toBeNull();
  expect(resolveLibrarySelection(libraries, '播客')).toBe('播客');
  expect(resolveLibrarySelection(libraries, '已删除')).toBeNull();
});

it('lookups return the entry for a known track and nothing for an unknown one', () => {
  const entries = entriesOf({
    libraries: [{ key: 'default', title: 'default', position: 1 }],
    tracks: [
      { ...validCatalogTrack, libraries: ['default'], trackKey: 'a' },
      { ...validCatalogTrack, libraries: ['default'], trackKey: 'b', publishedAt: null },
    ],
  });

  expect(findCatalogAudioUrl(entries, 'b')).toBe('/_music-media/abc.wav');
  expect(findCatalogAudioUrl(entries, 'missing')).toBeNull();
  expect(findCatalogPublishedAt(entries, 'a')).toBe('2026-04-26T00:00:00.000Z');
  expect(findCatalogPublishedAt(entries, 'b')).toBeNull();
});

// 只有 URL 真的变了才允许换源
// 目录数组换引用不算理由：会触发 load() 并打断正在播放的音频
it('the same track and the same URL must not trigger a source swap', () => {
  const previous = { trackId: 'a', audioUrl: '/_music-media/a.wav' };

  expect(resolveSourceChange(previous, { ...previous })).toBe('unchanged');
});

it('a different track swaps the source', () => {
  expect(
    resolveSourceChange(
      { trackId: 'a', audioUrl: '/_music-media/a.wav' },
      { trackId: 'b', audioUrl: '/_music-media/b.wav' },
    ),
  ).toBe('applied');
});

it('the same track with a changed URL is reported as replaced', () => {
  expect(
    resolveSourceChange(
      { trackId: 'a', audioUrl: '/_music-media/old.wav' },
      { trackId: 'a', audioUrl: '/_music-media/new.wav' },
    ),
  ).toBe('replaced');
});

it('the first application after a release swaps the source', () => {
  expect(
    resolveSourceChange(
      { trackId: null, audioUrl: null },
      { trackId: 'a', audioUrl: '/_music-media/a.wav' },
    ),
  ).toBe('applied');
});
