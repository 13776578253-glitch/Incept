export type RepeatMode = 'off' | 'all' | 'one' | 'shuffle';

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'errored';

export type MusicTrack = {
  id: string;
  title: string;
  artist?: string;
  durationHint?: number;
  artwork?: string;
};

export type PlayerState = {
  queue: MusicTrack[];
  currentTrackId: string | null;
  status: PlayerStatus;
  currentTime: number;
  duration: number;
  playbackRate: number;
  repeatMode: RepeatMode;
  // 每次"从 0 秒重新开始当前曲目"时递增，用于区分重播与续播。
  restartToken: number;
  errorMessage?: string;
};

export type PlaybackRandom = () => number;
