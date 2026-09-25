import assert from 'node:assert/strict';
import test from 'node:test';

import { reducePlayerState } from '../reducer';
import { createInitialPlayerState } from '../state';
import type { MusicTrack, PlaybackRandom, PlayerState } from '../types';

const tracks: MusicTrack[] = [
  { id: 'a', title: 'Alpha', durationHint: 10 },
  { id: 'b', title: 'Beta', durationHint: 20 },
  { id: 'c', title: 'Gamma', durationHint: 30 },
];

const firstValue: PlaybackRandom = () => 0;

function createState(overrides: Partial<PlayerState> = {}): PlayerState {
  return { ...createInitialPlayerState(tracks), status: 'paused', ...overrides };
}

test('playRequested asks for playback without claiming it started', () => {
  const idle = createInitialPlayerState(tracks);
  const paused = createState();

  const afterIdle = reducePlayerState(idle, { type: 'playRequested' }, firstValue);
  const afterPaused = reducePlayerState(paused, { type: 'playRequested' }, firstValue);

  assert.notEqual(afterIdle.status, 'playing');
  assert.notEqual(afterPaused.status, 'playing');
  assert.equal(afterPaused.status, 'loading');
});

test('playRequested keeps an empty queue idle', () => {
  const empty = createInitialPlayerState();
  const next = reducePlayerState(empty, { type: 'playRequested' }, firstValue);

  assert.equal(next.status, 'idle');
});

test('playRequested clears a previous error message', () => {
  const errored = createState({ status: 'errored', errorMessage: 'boom' });
  const next = reducePlayerState(errored, { type: 'playRequested' }, firstValue);

  assert.equal(next.errorMessage, undefined);
});

test('playStarted is the only transition that reports playback', () => {
  const next = reducePlayerState(createState({ errorMessage: 'stale' }), { type: 'playStarted' }, firstValue);

  assert.equal(next.status, 'playing');
  assert.equal(next.errorMessage, undefined);
});

test('pauseRequested waits for the browser event', () => {
  const playing = createState({ status: 'playing' });

  assert.equal(reducePlayerState(playing, { type: 'pauseRequested' }, firstValue).status, 'playing');
  assert.equal(reducePlayerState(playing, { type: 'playPaused' }, firstValue).status, 'paused');
});

test('playRejected recovers to a non-playing state and keeps the message', () => {
  const playing = createState({ status: 'playing' });
  const next = reducePlayerState(playing, { type: 'playRejected', message: 'blocked' }, firstValue);

  assert.equal(next.status, 'paused');
  assert.notEqual(next.status, 'playing');
  assert.equal(next.errorMessage, 'blocked');
});

test('audioErrored moves the player into the errored state', () => {
  const next = reducePlayerState(createState(), { type: 'audioErrored', message: 'decode' }, firstValue);

  assert.equal(next.status, 'errored');
  assert.equal(next.errorMessage, 'decode');
});

test('selectTrackRequested ignores an unknown track id', () => {
  const state = createState();

  assert.equal(reducePlayerState(state, { type: 'selectTrackRequested', trackId: 'missing' }, firstValue), state);
});

test('selectTrackRequested moves the cursor and resets the timeline', () => {
  const state = createState({ currentTime: 6 });
  const next = reducePlayerState(state, { type: 'selectTrackRequested', trackId: 'c' }, firstValue);

  assert.equal(next.currentTrackId, 'c');
  assert.equal(next.currentTime, 0);
  assert.equal(next.duration, 30);
  assert.equal(next.status, 'paused');
});

test('selectTrackRequested keeps loading while the player was playing', () => {
  const state = createState({ status: 'playing' });
  const next = reducePlayerState(state, { type: 'selectTrackRequested', trackId: 'b' }, firstValue);

  assert.equal(next.status, 'loading');
});

test('nextRequested and previousRequested follow the queue', () => {
  const state = createState({ currentTrackId: 'b' });

  assert.equal(reducePlayerState(state, { type: 'nextRequested' }, firstValue).currentTrackId, 'c');
  assert.equal(reducePlayerState(state, { type: 'previousRequested' }, firstValue).currentTrackId, 'a');
});

test('nextRequested on an empty queue is a no-op', () => {
  const empty = createInitialPlayerState();

  assert.equal(reducePlayerState(empty, { type: 'nextRequested' }, firstValue), empty);
});

test('nextRequested at the end of the queue is a no-op in order mode', () => {
  const state = createState({ currentTrackId: 'c' });

  assert.equal(reducePlayerState(state, { type: 'nextRequested' }, firstValue), state);
});

test('trackEnded stops at the end of the queue in order mode', () => {
  const state = createState({ currentTrackId: 'c', currentTime: 29, status: 'playing' });
  const next = reducePlayerState(state, { type: 'trackEnded' }, firstValue);

  assert.equal(next.status, 'paused');
  assert.equal(next.currentTime, 0);
  assert.equal(next.currentTrackId, 'c');
});

test('trackEnded wraps to the first track in repeat-all mode', () => {
  const state = createState({ currentTrackId: 'c', repeatMode: 'all', status: 'playing' });
  const next = reducePlayerState(state, { type: 'trackEnded' }, firstValue);

  assert.equal(next.currentTrackId, 'a');
  assert.equal(next.status, 'loading');
});

test('trackEnded replays the same track in repeat-one mode', () => {
  const state = createState({ currentTrackId: 'b', repeatMode: 'one', currentTime: 19, status: 'playing' });
  const next = reducePlayerState(state, { type: 'trackEnded' }, firstValue);

  assert.equal(next.currentTrackId, 'b');
  assert.equal(next.currentTime, 0);
  assert.equal(next.status, 'loading');
});

test('trackEnded picks a different track in shuffle mode', () => {
  const state = createState({ currentTrackId: 'b', repeatMode: 'shuffle', status: 'playing' });
  const next = reducePlayerState(state, { type: 'trackEnded' }, firstValue);

  assert.notEqual(next.currentTrackId, 'b');
  assert.equal(next.status, 'loading');
});

test('trackEnded on an empty queue is a no-op', () => {
  const empty = createInitialPlayerState();

  assert.equal(reducePlayerState(empty, { type: 'trackEnded' }, firstValue), empty);
});

test('seekRequested clamps into the current duration', () => {
  const state = createState({ duration: 30 });

  assert.equal(reducePlayerState(state, { type: 'seekRequested', seconds: -4 }, firstValue).currentTime, 0);
  assert.equal(reducePlayerState(state, { type: 'seekRequested', seconds: 12 }, firstValue).currentTime, 12);
  assert.equal(reducePlayerState(state, { type: 'seekRequested', seconds: 99 }, firstValue).currentTime, 30);
});

test('playbackRateRequested rejects an out-of-range rate', () => {
  const state = createState();

  assert.equal(reducePlayerState(state, { type: 'playbackRateRequested', rate: 1.75 }, firstValue).playbackRate, 1.75);
  assert.equal(reducePlayerState(state, { type: 'playbackRateRequested', rate: 100 }, firstValue), state);
  assert.equal(reducePlayerState(state, { type: 'playbackRateRequested', rate: 0.1 }, firstValue), state);
});

test('repeatModeRequested stores all four playback modes', () => {
  const state = createState();

  for (const mode of ['off', 'all', 'one', 'shuffle'] as const) {
    assert.equal(reducePlayerState(state, { type: 'repeatModeRequested', mode }, firstValue).repeatMode, mode);
  }
});

test('trackLoaded normalizes the reported duration', () => {
  assert.equal(reducePlayerState(createState(), { type: 'trackLoaded', duration: 42 }, firstValue).duration, 42);
  assert.equal(reducePlayerState(createState(), { type: 'trackLoaded', duration: Number.NaN }, firstValue).duration, 0);
});

test('timeUpdated clamps progress against a known duration', () => {
  const state = createState({ duration: 30 });

  assert.equal(reducePlayerState(state, { type: 'timeUpdated', currentTime: 5 }, firstValue).currentTime, 5);
  assert.equal(reducePlayerState(state, { type: 'timeUpdated', currentTime: 45 }, firstValue).currentTime, 30);
  assert.equal(reducePlayerState(state, { type: 'timeUpdated', currentTime: -1 }, firstValue).currentTime, 0);
});

test('an intent and its runtime event are distinct inputs', () => {
  const state = createState();
  const afterIntent = reducePlayerState(state, { type: 'playRequested' }, firstValue);
  const afterEvent = reducePlayerState(state, { type: 'playStarted' }, firstValue);

  assert.notEqual(afterIntent.status, 'playing');
  assert.equal(afterEvent.status, 'playing');
});

test('restartToken marks every restart-from-zero transition', () => {
  const state = createState();

  assert.equal(reducePlayerState(state, { type: 'selectTrackRequested', trackId: 'b' }, firstValue).restartToken, 1);
  assert.equal(reducePlayerState(state, { type: 'nextRequested' }, firstValue).restartToken, 1);

  const fromSecondTrack = createState({ currentTrackId: 'b' });

  assert.equal(reducePlayerState(fromSecondTrack, { type: 'previousRequested' }, firstValue).restartToken, 1);
});

test('restartToken stays put when a previous request is a no-op', () => {
  const state = createState({ currentTrackId: 'a' });
  const next = reducePlayerState(state, { type: 'previousRequested' }, firstValue);

  assert.equal(next, state);
  assert.equal(next.restartToken, 0);
});

test('restartToken marks a repeat-one replay', () => {
  const state = createState({ currentTrackId: 'b', repeatMode: 'one', status: 'playing' });
  const next = reducePlayerState(state, { type: 'trackEnded' }, firstValue);

  assert.equal(next.restartToken, state.restartToken + 1);
});

test('restartToken stays put for resume, pause and seeking', () => {
  const state = createState({ currentTrackId: 'b', duration: 30 });

  assert.equal(reducePlayerState(state, { type: 'playRequested' }, firstValue).restartToken, state.restartToken);
  assert.equal(reducePlayerState(state, { type: 'pauseRequested' }, firstValue).restartToken, state.restartToken);
  assert.equal(
    reducePlayerState(state, { type: 'seekRequested', seconds: 5 }, firstValue).restartToken,
    state.restartToken,
  );
  assert.equal(reducePlayerState(state, { type: 'timeUpdated', currentTime: 5 }, firstValue).restartToken, state.restartToken);
});

test('trackEnded continues playback even when a pause event arrived first', () => {
  // 浏览器自然播放结束可能先派发 pause 再派发 ended，此时状态已经被置为 paused。
  const pausedByEndEvent = createState({ currentTrackId: 'b', status: 'paused' });
  const next = reducePlayerState(pausedByEndEvent, { type: 'trackEnded' }, firstValue);

  assert.equal(next.currentTrackId, 'c');
  assert.equal(next.status, 'loading');
});

test('trackEnded still wraps in repeat-all mode after a pause event', () => {
  const state = createState({ currentTrackId: 'c', repeatMode: 'all', status: 'paused' });
  const next = reducePlayerState(state, { type: 'trackEnded' }, firstValue);

  assert.equal(next.currentTrackId, 'a');
  assert.equal(next.status, 'loading');
});

test('a manual pause without trackEnded never advances the queue', () => {
  const state = createState({ currentTrackId: 'b' });
  const next = reducePlayerState(state, { type: 'playPaused' }, firstValue);

  assert.equal(next.currentTrackId, 'b');
  assert.equal(next.status, 'paused');
  assert.equal(next.restartToken, state.restartToken);
});

test('restartToken bumps when the queue advances to another track', () => {
  const state = createState({ currentTrackId: 'b', repeatMode: 'all', status: 'playing' });
  const next = reducePlayerState(state, { type: 'trackEnded' }, firstValue);

  assert.equal(next.currentTrackId, 'c');
  assert.equal(next.restartToken, state.restartToken + 1);
});

test('tracksLoaded keeps the current track, its status and its position', () => {
  const state = createState({ currentTrackId: 'b', status: 'playing', currentTime: 7.5 });
  const reloaded: MusicTrack[] = [
    { id: 'a', title: 'Alpha' },
    { id: 'b', title: 'Beta' },
    { id: 'd', title: 'Delta' },
  ];
  const next = reducePlayerState(state, { type: 'tracksLoaded', tracks: reloaded }, firstValue);

  assert.equal(next.currentTrackId, 'b');
  assert.equal(next.status, 'playing');
  assert.equal(next.currentTime, 7.5);
  assert.equal(next.restartToken, state.restartToken);
  assert.deepEqual(
    next.queue.map((track) => track.id),
    ['a', 'b', 'd'],
  );
});

test('tracksLoaded falls back to the new queue head when the current track is gone', () => {
  const state = createState({ currentTrackId: 'b', status: 'playing', currentTime: 7.5 });
  const reloaded: MusicTrack[] = [
    { id: 'd', title: 'Delta' },
    { id: 'e', title: 'Epsilon' },
  ];
  const next = reducePlayerState(state, { type: 'tracksLoaded', tracks: reloaded }, firstValue);

  assert.equal(next.currentTrackId, 'd');
  assert.equal(next.currentTime, 0);
  assert.equal(next.restartToken, state.restartToken + 1);
  // 原本在播放，因此新队首延续播放；这里只判定状态，不断言真的播出了。
  assert.equal(next.status, 'loading');
});

test('tracksLoaded from an empty queue selects the first track without starting playback', () => {
  const empty = createInitialPlayerState();
  const next = reducePlayerState(empty, { type: 'tracksLoaded', tracks }, firstValue);

  assert.equal(next.currentTrackId, 'a');
  assert.equal(next.status, 'paused');
  assert.notEqual(next.status, 'playing');
});

test('tracksLoaded onto an empty queue clears the cursor and returns to idle', () => {
  const state = createState({ currentTrackId: 'b', status: 'playing', currentTime: 7.5 });
  const next = reducePlayerState(state, { type: 'tracksLoaded', tracks: [] }, firstValue);

  assert.equal(next.currentTrackId, null);
  assert.equal(next.queue.length, 0);
  assert.equal(next.status, 'idle');
  assert.equal(next.currentTime, 0);
});

test('a catalog reload never introduces the audio error state', () => {
  // 目录加载失败在 core 里没有对应输入。这条测试固化该边界：
  // 健康状态下发生任何队列切换，都不会产生 errored 或 errorMessage。
  const healthyStates = [
    createState({ currentTrackId: 'b', status: 'playing' }),
    createInitialPlayerState(),
  ];
  const payloads: MusicTrack[][] = [tracks, [], [{ id: 'z', title: 'Zeta' }]];

  for (const state of healthyStates) {
    for (const payload of payloads) {
      const next = reducePlayerState(state, { type: 'tracksLoaded', tracks: payload }, firstValue);

      assert.notEqual(next.status, 'errored');
      assert.equal(next.errorMessage, undefined);
    }
  }
});

test('a catalog reload leaves an existing audio error untouched', () => {
  // 两个故障源必须保持独立：目录事件既不制造音频错误，也不清除真实的音频错误。
  const state = createState({
    currentTrackId: 'b',
    status: 'errored',
    errorMessage: 'audio_element_error',
  });
  const next = reducePlayerState(state, { type: 'tracksLoaded', tracks }, firstValue);

  assert.equal(next.status, 'errored');
  assert.equal(next.errorMessage, 'audio_element_error');
});
