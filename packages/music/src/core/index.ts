export type { MusicTrack, PlaybackRandom, PlayerState, PlayerStatus, RepeatMode } from './types';
export type { PlayerIntent } from './intents';
export type { PlayerRuntimeEvent } from './runtime-events';
export type { PlayerInput } from './reducer';

export { DEFAULT_PLAYBACK_RATE, DEFAULT_REPEAT_MODE, createInitialPlayerState } from './state';

export {
  addTrackToQueue,
  getCurrentIndex,
  getCurrentTrack,
  moveQueueItem,
  removeTrackFromQueue,
  setQueue,
} from './queue';

export { pickShuffleIndex, resolveNextIndex, resolvePreviousIndex } from './playback-mode';

export {
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  clampSeekSeconds,
  isPlaybackRateInRange,
  normalizeDuration,
} from './timing';

export { reducePlayerState } from './reducer';
