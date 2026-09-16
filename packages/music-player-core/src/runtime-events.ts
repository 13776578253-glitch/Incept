import type { MusicTrack } from './types';

// 运行时事实：播放器无法独自判定、由外部环境反馈的结果，都不是用户意图，
// 因此不属于 PlayerIntent。
//
// 前七项来自 HTMLAudioElement。tracksLoaded 来自曲目目录的数据层。
//
// 目录加载失败刻意没有对应事件：它属于数据层状态，不是音频播放事实。
// 若在此处表达，调用方就会把"目录请求失败"和"当前音频加载失败"压进同一个
// errored 状态，故障来源随之不可区分。目录状态由数据层自己维护。
export type PlayerRuntimeEvent =
  | { type: 'playStarted' }
  | { type: 'playPaused' }
  | { type: 'playRejected'; message?: string }
  | { type: 'trackLoaded'; duration: number }
  | { type: 'timeUpdated'; currentTime: number }
  | { type: 'trackEnded' }
  | { type: 'audioErrored'; message?: string }
  | { type: 'tracksLoaded'; tracks: MusicTrack[] };
