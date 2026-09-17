import { clampSeekSeconds, isPlaybackRateInRange } from '@incept/music-player-core';
import type { PlayerIntent, PlayerState } from '@incept/music-player-core';

export type PlayerSideEffect =
  | { kind: 'pause' }
  | { kind: 'seek'; seconds: number }
  | { kind: 'playbackRate'; rate: number }
  | { kind: 'none' };

// 只解析立刻作用于 <audio> 的意图
// 播放启动不在其中：唯一出口是 provider 的 startPlayback——点击路径：在用户手势的调用栈内直接调用它，自动续播与重播由调和 effect 调用，两条路径共用同一个实现点
export function resolveIntentSideEffect(intent: PlayerIntent, state: PlayerState): PlayerSideEffect {
  switch (intent.type) {
    case 'pauseRequested':
      return { kind: 'pause' };

    case 'seekRequested':
      return { kind: 'seek', seconds: clampSeekSeconds(intent.seconds, state.duration) };

    case 'playbackRateRequested':
      return isPlaybackRateInRange(intent.rate) ? { kind: 'playbackRate', rate: intent.rate } : { kind: 'none' };

    default:
      return { kind: 'none' };
  }
}
