import type { MusicTrack, PlayerState } from './types';

export function getCurrentIndex(state: PlayerState): number {
  if (!state.currentTrackId) {
    return -1;
  }

  return state.queue.findIndex((track) => track.id === state.currentTrackId);
}

export function getCurrentTrack(state: PlayerState): MusicTrack | undefined {
  const index = getCurrentIndex(state);

  return index >= 0 ? state.queue[index] : undefined;
}

export function setQueue(state: PlayerState, tracks: MusicTrack[]): PlayerState {
  const queue = [...tracks];
  const keepsCurrentTrack =
    state.currentTrackId !== null && queue.some((track) => track.id === state.currentTrackId);

  if (keepsCurrentTrack) {
    return { ...state, queue };
  }

  return moveCursorTo(state, { ...state, queue }, queue[0]);
}

export function addTrackToQueue(state: PlayerState, track: MusicTrack, index?: number): PlayerState {
  const queue = [...state.queue];
  const insertAt =
    index === undefined ? queue.length : Math.min(Math.max(Math.trunc(index), 0), queue.length);

  queue.splice(insertAt, 0, track);

  if (state.currentTrackId === null) {
    return moveCursorTo(state, { ...state, queue }, track, 'idle');
  }

  return { ...state, queue };
}

export function removeTrackFromQueue(state: PlayerState, trackId: string): PlayerState {
  const removedIndex = state.queue.findIndex((track) => track.id === trackId);

  if (removedIndex === -1) {
    return state;
  }

  const queue = state.queue.filter((track) => track.id !== trackId);

  if (state.currentTrackId !== trackId) {
    return { ...state, queue };
  }

  const nextCurrent = queue.length > 0 ? queue[Math.min(removedIndex, queue.length - 1)] : undefined;

  return moveCursorTo(state, { ...state, queue }, nextCurrent, state.status === 'playing' ? 'loading' : 'paused');
}

export function moveQueueItem(state: PlayerState, fromIndex: number, toIndex: number): PlayerState {
  const { length } = state.queue;

  if (fromIndex < 0 || fromIndex >= length) {
    return state;
  }

  const targetIndex = Math.min(Math.max(Math.trunc(toIndex), 0), length - 1);

  if (targetIndex === fromIndex) {
    return state;
  }

  const queue = [...state.queue];
  const [movedTrack] = queue.splice(fromIndex, 1);

  queue.splice(targetIndex, 0, movedTrack);

  return { ...state, queue };
}

function moveCursorTo(
  state: PlayerState,
  nextState: PlayerState,
  track: MusicTrack | undefined,
  fallbackStatus: PlayerState['status'] = 'paused',
): PlayerState {
  if (!track) {
    return {
      ...nextState,
      currentTrackId: null,
      currentTime: 0,
      duration: 0,
      status: 'idle',
      errorMessage: undefined,
    };
  }

  return {
    ...nextState,
    currentTrackId: track.id,
    currentTime: 0,
    duration: track.durationHint ?? 0,
    status: state.status === 'playing' ? 'loading' : fallbackStatus,
    restartToken: nextState.restartToken + 1,
    errorMessage: undefined,
  };
}
