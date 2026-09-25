import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialPlayerState } from '../state';
import { pickShuffleIndex, resolveNextIndex, resolvePreviousIndex } from '../playback-mode';
import type { MusicTrack, PlaybackRandom, RepeatMode } from '../types';

const tracks: MusicTrack[] = [
  { id: 'a', title: 'Alpha' },
  { id: 'b', title: 'Beta' },
  { id: 'c', title: 'Gamma' },
];

function createState(currentTrackId: string | null, repeatMode: RepeatMode) {
  return { ...createInitialPlayerState(tracks), currentTrackId, repeatMode, status: 'paused' as const };
}

const firstValue: PlaybackRandom = () => 0;
const lastValue: PlaybackRandom = () => 0.999999;

test('resolveNextIndex returns null for an empty queue', () => {
  assert.equal(resolveNextIndex(createInitialPlayerState(), firstValue), null);
  assert.equal(resolvePreviousIndex(createInitialPlayerState(), firstValue), null);
});

test('resolveNextIndex walks forward in order mode', () => {
  assert.equal(resolveNextIndex(createState('a', 'off'), firstValue), 1);
  assert.equal(resolveNextIndex(createState('b', 'off'), firstValue), 2);
});

test('resolveNextIndex stops at the end of the queue in order mode', () => {
  assert.equal(resolveNextIndex(createState('c', 'off'), firstValue), null);
});

test('resolvePreviousIndex walks backward and stops at the start in order mode', () => {
  assert.equal(resolvePreviousIndex(createState('c', 'off'), firstValue), 1);
  assert.equal(resolvePreviousIndex(createState('a', 'off'), firstValue), null);
});

test('repeat all wraps in both directions', () => {
  assert.equal(resolveNextIndex(createState('c', 'all'), firstValue), 0);
  assert.equal(resolvePreviousIndex(createState('a', 'all'), firstValue), 2);
});

test('repeat one keeps the current index', () => {
  assert.equal(resolveNextIndex(createState('b', 'one'), firstValue), 1);
  assert.equal(resolvePreviousIndex(createState('b', 'one'), firstValue), 1);
});

test('a single-track queue cannot advance in order mode', () => {
  const single = { ...createInitialPlayerState([tracks[0]]), status: 'paused' as const };

  assert.equal(resolveNextIndex(single, firstValue), null);
  assert.equal(resolvePreviousIndex(single, firstValue), null);
  assert.equal(resolveNextIndex({ ...single, repeatMode: 'all' }, firstValue), 0);
});

test('pickShuffleIndex stays inside the queue', () => {
  for (let index = 0; index < tracks.length; index += 1) {
    assert.equal(pickShuffleIndex(3, index, firstValue) >= 0, true);
    assert.equal(pickShuffleIndex(3, index, lastValue) < 3, true);
  }
});

test('pickShuffleIndex never repeats the current track immediately', () => {
  const samples: PlaybackRandom[] = [firstValue, lastValue, () => 0.25, () => 0.5, () => 0.75];

  for (let queueLength = 2; queueLength <= 5; queueLength += 1) {
    for (let currentIndex = 0; currentIndex < queueLength; currentIndex += 1) {
      for (const random of samples) {
        const picked = pickShuffleIndex(queueLength, currentIndex, random);

        assert.notEqual(picked, currentIndex);
        assert.equal(picked >= 0 && picked < queueLength, true);
      }
    }
  }
});

test('pickShuffleIndex clamps an unusable random source', () => {
  const wild: PlaybackRandom = () => Number.NaN;

  const picked = pickShuffleIndex(3, 1, wild);

  assert.notEqual(picked, 1);
  assert.equal(picked >= 0 && picked < 3, true);
});

test('shuffle mode picks a different track for next and previous', () => {
  assert.notEqual(resolveNextIndex(createState('b', 'shuffle'), firstValue), 1);
  assert.notEqual(resolvePreviousIndex(createState('b', 'shuffle'), lastValue), 1);
});
