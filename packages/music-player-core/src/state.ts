import type { MusicTrack, PlayerState, RepeatMode } from './types';

export const DEFAULT_PLAYBACK_RATE = 1;
export const DEFAULT_REPEAT_MODE: RepeatMode = 'off';

export function createInitialPlayerState(tracks: MusicTrack[] = []): PlayerState {
  const queue = [...tracks];
  const currentTrack = queue[0];

  return {
    queue,
    currentTrackId: currentTrack ? currentTrack.id : null,
    status: 'idle',
    currentTime: 0,
    duration: currentTrack?.durationHint ?? 0,
    playbackRate: DEFAULT_PLAYBACK_RATE,
    repeatMode: DEFAULT_REPEAT_MODE,
    restartToken: 0,
  };
}
