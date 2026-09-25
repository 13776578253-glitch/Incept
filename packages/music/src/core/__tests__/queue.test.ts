import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialPlayerState } from '../state';
import {
  addTrackToQueue,
  getCurrentIndex,
  getCurrentTrack,
  moveQueueItem,
  removeTrackFromQueue,
  setQueue,
} from '../queue';
import type { MusicTrack } from '../types';

const trackA: MusicTrack = { id: 'a', title: 'Alpha', durationHint: 10 };
const trackB: MusicTrack = { id: 'b', title: 'Beta', durationHint: 20 };
const trackC: MusicTrack = { id: 'c', title: 'Gamma', durationHint: 30 };

function createQueueState(tracks: MusicTrack[] = [trackA, trackB, trackC]) {
  return { ...createInitialPlayerState(tracks), status: 'paused' as const };
}

test('createInitialPlayerState selects the first track without claiming playback', () => {
  const state = createInitialPlayerState([trackA, trackB]);

  assert.equal(state.currentTrackId, 'a');
  assert.equal(state.status, 'idle');
  assert.equal(state.currentTime, 0);
  assert.equal(state.duration, 10);
  assert.equal(state.playbackRate, 1);
  assert.equal(state.repeatMode, 'off');
});

test('createInitialPlayerState handles an empty queue', () => {
  const state = createInitialPlayerState();

  assert.equal(state.currentTrackId, null);
  assert.equal(state.queue.length, 0);
});

test('getCurrentTrack and getCurrentIndex follow the cursor', () => {
  const state = createQueueState();

  assert.equal(getCurrentIndex(state), 0);
  assert.equal(getCurrentTrack(state)?.id, 'a');
});

test('getCurrentIndex reports -1 for an empty or unknown cursor', () => {
  assert.equal(getCurrentIndex(createInitialPlayerState()), -1);

  const orphaned = { ...createQueueState(), currentTrackId: 'missing' };

  assert.equal(getCurrentIndex(orphaned), -1);
  assert.equal(getCurrentTrack(orphaned), undefined);
});

test('setQueue keeps the current track when it still exists', () => {
  const state = { ...createQueueState(), currentTrackId: 'b', currentTime: 4 };
  const next = setQueue(state, [trackC, trackB]);

  assert.deepEqual(
    next.queue.map((track) => track.id),
    ['c', 'b'],
  );
  assert.equal(next.currentTrackId, 'b');
  assert.equal(next.currentTime, 4);
});

test('setQueue moves the cursor to the first track when the current track disappears', () => {
  const state = { ...createQueueState(), currentTrackId: 'b', currentTime: 4 };
  const next = setQueue(state, [trackC, trackA]);

  assert.equal(next.currentTrackId, 'c');
  assert.equal(next.currentTime, 0);
  assert.equal(next.duration, 30);
});

test('setQueue resets the player when the queue becomes empty', () => {
  const next = setQueue(createQueueState(), []);

  assert.equal(next.currentTrackId, null);
  assert.equal(next.status, 'idle');
  assert.equal(next.currentTime, 0);
  assert.equal(next.duration, 0);
});

test('addTrackToQueue appends by default and inserts at an index', () => {
  const appended = addTrackToQueue(createQueueState([trackA]), trackB);

  assert.deepEqual(
    appended.queue.map((track) => track.id),
    ['a', 'b'],
  );

  const inserted = addTrackToQueue(createQueueState([trackA, trackC]), trackB, 1);

  assert.deepEqual(
    inserted.queue.map((track) => track.id),
    ['a', 'b', 'c'],
  );
});

test('addTrackToQueue adopts the first track when the queue was empty', () => {
  const next = addTrackToQueue(createInitialPlayerState(), trackB);

  assert.equal(next.currentTrackId, 'b');
  assert.equal(next.duration, 20);
});

test('removeTrackFromQueue leaves the cursor alone for a non-current track', () => {
  const state = createQueueState();
  const next = removeTrackFromQueue(state, 'c');

  assert.equal(next.currentTrackId, 'a');
  assert.equal(next.currentTime, state.currentTime);
  assert.deepEqual(
    next.queue.map((track) => track.id),
    ['a', 'b'],
  );
});

test('removeTrackFromQueue moves the cursor to the following track', () => {
  const state = { ...createQueueState(), currentTrackId: 'b', currentTime: 7 };
  const next = removeTrackFromQueue(state, 'b');

  assert.equal(next.currentTrackId, 'c');
  assert.equal(next.currentTime, 0);
  assert.equal(next.duration, 30);
});

test('removeTrackFromQueue falls back to the previous track when the last one is removed', () => {
  const state = { ...createQueueState(), currentTrackId: 'c' };
  const next = removeTrackFromQueue(state, 'c');

  assert.equal(next.currentTrackId, 'b');
  assert.equal(next.duration, 20);
});

test('removeTrackFromQueue keeps loading when the player was playing', () => {
  const state = { ...createQueueState(), currentTrackId: 'b', status: 'playing' as const };
  const next = removeTrackFromQueue(state, 'b');

  assert.equal(next.status, 'loading');
});

test('removeTrackFromQueue empties the player when the only track is removed', () => {
  const next = removeTrackFromQueue(createQueueState([trackA]), 'a');

  assert.equal(next.currentTrackId, null);
  assert.equal(next.status, 'idle');
  assert.equal(next.duration, 0);
});

test('removeTrackFromQueue ignores an unknown track id', () => {
  const state = createQueueState();

  assert.equal(removeTrackFromQueue(state, 'missing'), state);
});

test('moveQueueItem reorders the queue without moving the cursor', () => {
  const state = { ...createQueueState(), currentTrackId: 'a' };
  const next = moveQueueItem(state, 0, 2);

  assert.deepEqual(
    next.queue.map((track) => track.id),
    ['b', 'c', 'a'],
  );
  assert.equal(next.currentTrackId, 'a');
  assert.equal(getCurrentIndex(next), 2);
});

test('moveQueueItem ignores out-of-range and no-op moves', () => {
  const state = createQueueState();

  assert.equal(moveQueueItem(state, -1, 1), state);
  assert.equal(moveQueueItem(state, 3, 1), state);
  assert.equal(moveQueueItem(state, 1, 1), state);
});
