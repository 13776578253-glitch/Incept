import type { MusicTrack } from './types';

// 运行时事实：由外部环境反馈、播放器无法独自判定的结果，不是用户意图
// 前七项来自 HTMLAudioElement，tracksLoaded 来自曲目目录的数据层；目录加载失败属于数据层状态，不在这里表达
export type PlayerRuntimeEvent =
  | { type: 'playStarted' }
  | { type: 'playPaused' }
  | { type: 'playRejected'; message?: string }
  | { type: 'trackLoaded'; duration: number }
  | { type: 'timeUpdated'; currentTime: number }
  | { type: 'trackEnded' }
  | { type: 'audioErrored'; message?: string }
  | { type: 'tracksLoaded'; tracks: MusicTrack[] };
