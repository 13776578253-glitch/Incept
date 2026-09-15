import { getCurrentIndex } from './queue';
import type { PlaybackRandom, PlayerState } from './types';

export function pickShuffleIndex(
  queueLength: number,
  currentIndex: number,
  random: PlaybackRandom,
): number {
  if (queueLength <= 0) {
    return -1;
  }

  if (queueLength === 1) {
    return 0;
  }

  const raw = random();
  const normalized = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 0.999999) : 0;
  const offset = Math.floor(normalized * (queueLength - 1));

  return offset >= currentIndex ? offset + 1 : offset;
}

export function resolveNextIndex(state: PlayerState, random: PlaybackRandom): number | null {
  const { length } = state.queue;

  if (length === 0) {
    return null;
  }

  const currentIndex = getCurrentIndex(state);

  if (currentIndex < 0) {
    return 0;
  }

  if (state.repeatMode === 'one') {
    return currentIndex;
  }

  if (state.repeatMode === 'shuffle') {
    return pickShuffleIndex(length, currentIndex, random);
  }

  const nextIndex = currentIndex + 1;

  if (nextIndex < length) {
    return nextIndex;
  }

  return state.repeatMode === 'all' ? 0 : null;
}

export function resolvePreviousIndex(state: PlayerState, random: PlaybackRandom): number | null {
  const { length } = state.queue;

  if (length === 0) {
    return null;
  }

  const currentIndex = getCurrentIndex(state);

  if (currentIndex < 0) {
    return 0;
  }

  if (state.repeatMode === 'one') {
    return currentIndex;
  }

  if (state.repeatMode === 'shuffle') {
    return pickShuffleIndex(length, currentIndex, random);
  }

  const previousIndex = currentIndex - 1;

  if (previousIndex >= 0) {
    return previousIndex;
  }

  return state.repeatMode === 'all' ? length - 1 : null;
}
