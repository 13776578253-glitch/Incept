import { clampSeekSeconds, isPlaybackRateInRange } from '@incept/music-player-core';
import type { PlayerIntent, PlayerState } from '@incept/music-player-core';

export type PlayerSideEffect =
  | { kind: 'pause' }
  | { kind: 'seek'; seconds: number }
  | { kind: 'playbackRate'; rate: number }
  | { kind: 'none' };

// 这里只解析"需要立刻对 <audio> 做的事"。
// 播放启动不在其中：所有启动都走 provider 的调和 effect，
// 保证"等音源就绪再播放"这条规则只有唯一实现点。
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
