import type { PlayerIntent } from './intents';
import { resolveNextIndex, resolvePreviousIndex } from './playback-mode';
import { setQueue } from './queue';
import type { PlayerRuntimeEvent } from './runtime-events';
import { clampSeekSeconds, isPlaybackRateInRange, normalizeDuration } from './timing';
import type { PlaybackRandom, PlayerState } from './types';

export type PlayerInput = PlayerIntent | PlayerRuntimeEvent;

// 用户意图只表达意图；运行时事实（浏览器播放事件与目录加载结果）才更新真实状态
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

    case 'tracksLoaded':
      // 直接复用队列替换语义：当前曲目仍在队列中时保留曲目、状态与播放位置；
      // 已被移除时游标回到新队首；空队列与非空队列之间的切换也由同一处处理
      return setQueue(state, input.tracks);
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

  // 曲目自然结束只可能发生在播放中：即使浏览器先补发了一次 pause（pause-before-ended 竞态），也必须继续播放，所以不读 status
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
