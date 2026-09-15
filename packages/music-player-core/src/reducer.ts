import type { PlayerIntent } from './intents';
import { resolveNextIndex, resolvePreviousIndex } from './playback-mode';
import type { PlayerRuntimeEvent } from './runtime-events';
import { clampSeekSeconds, isPlaybackRateInRange, normalizeDuration } from './timing';
import type { PlaybackRandom, PlayerState } from './types';

export type PlayerInput = PlayerIntent | PlayerRuntimeEvent;

// 用户意图只表达意图，浏览器事实事件才更新真实播放状态。
export function reducePlayerState(
  state: PlayerState,
  input: PlayerInput,
  random: PlaybackRandom,
): PlayerState {
  switch (input.type) {
    case 'playRequested':
      return {
        ...state,
        status: state.currentTrackId ? 'loading' : state.status,
        errorMessage: undefined,
      };

    case 'pauseRequested':
      return state;

    case 'selectTrackRequested':
      return selectTrack(state, input.trackId);

    case 'nextRequested':
      return moveSelection(state, resolveNextIndex(state, random));

    case 'previousRequested':
      return moveSelection(state, resolvePreviousIndex(state, random));

    case 'seekRequested':
      return { ...state, currentTime: clampSeekSeconds(input.seconds, state.duration) };

    case 'playbackRateRequested':
      return isPlaybackRateInRange(input.rate) ? { ...state, playbackRate: input.rate } : state;

    case 'repeatModeRequested':
      return { ...state, repeatMode: input.mode };

    case 'playStarted':
      return { ...state, status: 'playing', errorMessage: undefined };

    case 'playPaused':
      return { ...state, status: 'paused' };

    case 'playRejected':
      return { ...state, status: 'paused', errorMessage: input.message };

    case 'trackLoaded':
      return { ...state, duration: normalizeDuration(input.duration) };

    case 'timeUpdated': {
      const seconds = Number.isFinite(input.currentTime) && input.currentTime > 0 ? input.currentTime : 0;

      return {
        ...state,
        currentTime: state.duration > 0 ? Math.min(seconds, state.duration) : seconds,
      };
    }

    case 'trackEnded':
      return resolveTrackEnded(state, random);

    case 'audioErrored':
      return { ...state, status: 'errored', errorMessage: input.message };
  }
}

function selectTrack(state: PlayerState, trackId: string): PlayerState {
  const index = state.queue.findIndex((track) => track.id === trackId);

  if (index === -1) {
    return state;
  }

  return moveSelection(state, index);
}

function resolveTrackEnded(state: PlayerState, random: PlaybackRandom): PlayerState {
  if (state.queue.length === 0) {
    return state;
  }

  if (state.repeatMode === 'one') {
    return { ...state, currentTime: 0, status: 'loading', restartToken: state.restartToken + 1 };
  }

  const nextIndex = resolveNextIndex(state, random);

  if (nextIndex === null) {
    return { ...state, currentTime: 0, status: 'paused' };
  }

  // 曲目自然播放结束只可能发生在播放中，因此无论此前是否收到过 pause 事件都要继续播放。
  return moveSelection(state, nextIndex, true);
}

function moveSelection(
  state: PlayerState,
  index: number | null,
  continuePlaying = false,
): PlayerState {
  if (index === null) {
    return state;
  }

  const track = state.queue[index];

  if (!track) {
    return state;
  }

  return {
    ...state,
    currentTrackId: track.id,
    currentTime: 0,
    duration: track.durationHint ?? 0,
    status: continuePlaying || state.status === 'playing' ? 'loading' : 'paused',
    restartToken: state.restartToken + 1,
    errorMessage: undefined,
  };
}
