import type { RepeatMode } from './types';

export type PlayerIntent =
  | { type: 'playRequested' }
  | { type: 'pauseRequested' }
  | { type: 'selectTrackRequested'; trackId: string }
  | { type: 'nextRequested' }
  | { type: 'previousRequested' }
  | { type: 'seekRequested'; seconds: number }
  | { type: 'playbackRateRequested'; rate: number }
  | { type: 'repeatModeRequested'; mode: RepeatMode };
