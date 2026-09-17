import { expect, it } from 'vitest';

import { makeCatalogPayload, validCatalogTrack } from '@/test/music-fixtures';

import { findCatalogAudioUrl, findCatalogPublishedAt, resolveSourceChange, toCatalogEntries } from '../music-source';

it('a valid payload maps to catalogue entries', () => {
  const [entry] = toCatalogEntries(makeCatalogPayload());

  expect(entry.track.id).toBe('demo-01');
  expect(entry.track.title).toBe('演示曲目 01');
  expect(entry.track.artist).toBe('Incept');
  expect(entry.track.durationHint).toBe(268);
  expect(entry.audioUrl).toBe('/_music-media/abc.wav');
  expect(entry.publishedAt).toBe('2026-04-26T00:00:00.000Z');
});

it('a non-object payload is rejected', () => {
  expect(() => toCatalogEntries(null)).toThrow(/must be an object with a tracks array/u);
  expect(() => toCatalogEntries({ tracks: 'nope' })).toThrow(/must be an object with a tracks array/u);
});

it('missing required fields are rejected', () => {
  expect(() => toCatalogEntries(makeCatalogPayload({ trackKey: '   ' }))).toThrow(/must carry trackKey/u);
  expect(() => toCatalogEntries(makeCatalogPayload({ title: '' }))).toThrow(/must carry trackKey/u);
  expect(() => toCatalogEntries(makeCatalogPayload({ audioUrl: '' }))).toThrow(/must carry trackKey/u);
});

// 重复身份会让队列里两首无法区分，在进入应用前拒绝
it('a duplicate trackKey is rejected', () => {
  const duplicates = {
    tracks: [
      { ...validCatalogTrack, trackKey: 'same' },
      { ...validCatalogTrack, trackKey: 'same' },
    ],
  };

  expect(() => toCatalogEntries(duplicates)).toThrow(/duplicate trackKey: same/u);
});

it('a non-positive or non-finite duration is rejected', () => {
  expect(() => toCatalogEntries(makeCatalogPayload({ durationSeconds: 0 }))).toThrow(
    /unusable durationSeconds/u,
  );
  expect(() => toCatalogEntries(makeCatalogPayload({ durationSeconds: -5 }))).toThrow(
    /unusable durationSeconds/u,
  );
  expect(() => toCatalogEntries(makeCatalogPayload({ durationSeconds: 'x' }))).toThrow(
    /unusable durationSeconds/u,
  );
});

it('an absent duration is allowed and becomes undefined', () => {
  const [entry] = toCatalogEntries(makeCatalogPayload({ durationSeconds: null }));

  expect(entry.track.durationHint).toBeUndefined();
});

it('an unparsable date is rejected', () => {
  expect(() => toCatalogEntries(makeCatalogPayload({ publishedAt: 'not-a-date' }))).toThrow(
    /unparsable publishedAt/u,
  );
});

it('an empty date string is treated as no date', () => {
  const [entry] = toCatalogEntries(makeCatalogPayload({ publishedAt: '' }));

  expect(entry.publishedAt).toBeNull();
});

// 站外 http、data: 与 javascript: 不进入音频元素的 src
it('an unusable audioUrl is rejected', () => {
  expect(() => toCatalogEntries(makeCatalogPayload({ audioUrl: 'http://evil.test/a.wav' }))).toThrow(
    /unusable audioUrl/u,
  );
  expect(() => toCatalogEntries(makeCatalogPayload({ audioUrl: 'data:audio/wav;base64,AA' }))).toThrow(
    /unusable audioUrl/u,
  );
  expect(() => toCatalogEntries(makeCatalogPayload({ audioUrl: 'javascript:alert(1)' }))).toThrow(
    /unusable audioUrl/u,
  );
  expect(() => toCatalogEntries(makeCatalogPayload({ audioUrl: 'relative/a.wav' }))).toThrow(
    /unusable audioUrl/u,
  );
});

// https ：未来的对象存储/CDN 预留位置
it('an https audioUrl is accepted', () => {
  const [entry] = toCatalogEntries(makeCatalogPayload({ audioUrl: 'https://cdn.test/a.wav' }));

  expect(entry.audioUrl).toBe('https://cdn.test/a.wav');
});

it('lookups return the entry for a known track and nothing for an unknown one', () => {
  const entries = toCatalogEntries({
    tracks: [
      { ...validCatalogTrack, trackKey: 'a' },
      { ...validCatalogTrack, trackKey: 'b', publishedAt: null },
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
