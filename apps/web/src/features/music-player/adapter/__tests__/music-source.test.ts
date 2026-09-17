import assert from 'node:assert/strict';
import test from 'node:test';

import { findCatalogAudioUrl, findCatalogPublishedAt, resolveSourceChange, toCatalogEntries } from '../music-source';

const validTrack = {
  trackKey: 'demo-01',
  title: '演示曲目 01',
  artist: 'Incept',
  audioUrl: '/_music-media/abc.wav',
  durationSeconds: 268,
  publishedAt: '2026-04-26T00:00:00.000Z',
};

function payloadWith(overrides: Record<string, unknown> = {}) {
  return { tracks: [{ ...validTrack, ...overrides }] };
}

test('a valid payload maps to catalogue entries', () => {
  const [entry] = toCatalogEntries(payloadWith());

  assert.equal(entry.track.id, 'demo-01');
  assert.equal(entry.track.title, '演示曲目 01');
  assert.equal(entry.track.artist, 'Incept');
  assert.equal(entry.track.durationHint, 268);
  assert.equal(entry.audioUrl, '/_music-media/abc.wav');
  assert.equal(entry.publishedAt, '2026-04-26T00:00:00.000Z');
});

test('a non-object payload is rejected', () => {
  assert.throws(() => toCatalogEntries(null), /must be an object with a tracks array/u);
  assert.throws(() => toCatalogEntries({ tracks: 'nope' }), /must be an object with a tracks array/u);
});

test('missing required fields are rejected', () => {
  assert.throws(() => toCatalogEntries(payloadWith({ trackKey: '   ' })), /must carry trackKey/u);
  assert.throws(() => toCatalogEntries(payloadWith({ title: '' })), /must carry trackKey/u);
  assert.throws(() => toCatalogEntries(payloadWith({ audioUrl: '' })), /must carry trackKey/u);
});

// 重复身份会让队列里两首无法区分，在进入应用前拒绝
test('a duplicate trackKey is rejected', () => {
  const duplicates = {
    tracks: [
      { ...validTrack, trackKey: 'same' },
      { ...validTrack, trackKey: 'same' },
    ],
  };

  assert.throws(() => toCatalogEntries(duplicates), /duplicate trackKey: same/u);
});

test('a non-positive or non-finite duration is rejected', () => {
  assert.throws(() => toCatalogEntries(payloadWith({ durationSeconds: 0 })), /unusable durationSeconds/u);
  assert.throws(() => toCatalogEntries(payloadWith({ durationSeconds: -5 })), /unusable durationSeconds/u);
  assert.throws(() => toCatalogEntries(payloadWith({ durationSeconds: 'x' })), /unusable durationSeconds/u);
});

test('an absent duration is allowed and becomes undefined', () => {
  const [entry] = toCatalogEntries(payloadWith({ durationSeconds: null }));

  assert.equal(entry.track.durationHint, undefined);
});

test('an unparsable date is rejected', () => {
  assert.throws(() => toCatalogEntries(payloadWith({ publishedAt: 'not-a-date' })), /unparsable publishedAt/u);
});

test('an empty date string is treated as no date', () => {
  const [entry] = toCatalogEntries(payloadWith({ publishedAt: '' }));

  assert.equal(entry.publishedAt, null);
});

// 站外 http、data: 与 javascript: 不进入音频元素的 src
test('an unusable audioUrl is rejected', () => {
  assert.throws(() => toCatalogEntries(payloadWith({ audioUrl: 'http://evil.test/a.wav' })), /unusable audioUrl/u);
  assert.throws(() => toCatalogEntries(payloadWith({ audioUrl: 'data:audio/wav;base64,AA' })), /unusable audioUrl/u);
  assert.throws(() => toCatalogEntries(payloadWith({ audioUrl: 'javascript:alert(1)' })), /unusable audioUrl/u);
  assert.throws(() => toCatalogEntries(payloadWith({ audioUrl: 'relative/a.wav' })), /unusable audioUrl/u);
});

// https ：未来的对象存储/CDN 预留位置
test('an https audioUrl is accepted', () => {
  const [entry] = toCatalogEntries(payloadWith({ audioUrl: 'https://cdn.test/a.wav' }));

  assert.equal(entry.audioUrl, 'https://cdn.test/a.wav');
});

test('lookups return the entry for a known track and nothing for an unknown one', () => {
  const entries = toCatalogEntries({
    tracks: [
      { ...validTrack, trackKey: 'a' },
      { ...validTrack, trackKey: 'b', publishedAt: null },
    ],
  });

  assert.equal(findCatalogAudioUrl(entries, 'b'), '/_music-media/abc.wav');
  assert.equal(findCatalogAudioUrl(entries, 'missing'), null);
  assert.equal(findCatalogPublishedAt(entries, 'a'), '2026-04-26T00:00:00.000Z');
  assert.equal(findCatalogPublishedAt(entries, 'b'), null);
});

// 只有 URL 真的变了才允许换源
// 目录数组换引用不算理由：会触发 load() 并打断正在播放的音频
test('the same track and the same URL must not trigger a source swap', () => {
  const previous = { trackId: 'a', audioUrl: '/_music-media/a.wav' };

  assert.equal(resolveSourceChange(previous, { ...previous }), 'unchanged');
});

test('a different track swaps the source', () => {
  assert.equal(
    resolveSourceChange(
      { trackId: 'a', audioUrl: '/_music-media/a.wav' },
      { trackId: 'b', audioUrl: '/_music-media/b.wav' },
    ),
    'applied',
  );
});

test('the same track with a changed URL is reported as replaced', () => {
  assert.equal(
    resolveSourceChange(
      { trackId: 'a', audioUrl: '/_music-media/old.wav' },
      { trackId: 'a', audioUrl: '/_music-media/new.wav' },
    ),
    'replaced',
  );
});

test('the first application after a release swaps the source', () => {
  assert.equal(
    resolveSourceChange(
      { trackId: null, audioUrl: null },
      { trackId: 'a', audioUrl: '/_music-media/a.wav' },
    ),
    'applied',
  );
});
