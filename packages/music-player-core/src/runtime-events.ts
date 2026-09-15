export type PlayerRuntimeEvent =
  | { type: 'playStarted' }
  | { type: 'playPaused' }
  | { type: 'playRejected'; message?: string }
  | { type: 'trackLoaded'; duration: number }
  | { type: 'timeUpdated'; currentTime: number }
  | { type: 'trackEnded' }
  | { type: 'audioErrored'; message?: string };
