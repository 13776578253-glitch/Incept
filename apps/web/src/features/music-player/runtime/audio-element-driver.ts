import type { PlayerRuntimeEvent } from '@incept/music-player-core';

export type AudioDriver = {
  dispose: () => void;
};

export type AudioEventBridge = (event: PlayerRuntimeEvent) => void;

export function attachAudioDriver(audio: HTMLAudioElement, bridge: AudioEventBridge): AudioDriver {
  const handlePlay = () => bridge({ type: 'playStarted' });
  const handlePause = () => bridge({ type: 'playPaused' });
  const handleTimeUpdate = () => bridge({ type: 'timeUpdated', currentTime: audio.currentTime });
  const handleLoadedMetadata = () => bridge({ type: 'trackLoaded', duration: audio.duration });
  const handleDurationChange = () => bridge({ type: 'trackLoaded', duration: audio.duration });
  const handleEnded = () => bridge({ type: 'trackEnded' });
  const handleError = () => bridge({ type: 'audioErrored', message: 'audio_element_error' });

  audio.addEventListener('play', handlePlay);
  audio.addEventListener('pause', handlePause);
  audio.addEventListener('timeupdate', handleTimeUpdate);
  audio.addEventListener('loadedmetadata', handleLoadedMetadata);
  audio.addEventListener('durationchange', handleDurationChange);
  audio.addEventListener('ended', handleEnded);
  audio.addEventListener('error', handleError);

  return {
    dispose: () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    },
  };
}

// play() 被拒绝时转成运行时事件；元素已带媒体错误说明是加载失败，不是自动播放被拦
export function requestAudioPlay(audio: HTMLAudioElement, bridge: AudioEventBridge): void {
  void audio.play().catch((error: unknown) => {
    if (audio.error) {
      bridge({ type: 'audioErrored', message: 'audio_element_error' });
      return;
    }

    bridge({
      type: 'playRejected',
      message: error instanceof Error ? error.message : 'play_rejected',
    });
  });
}

export function applyAudioPause(audio: HTMLAudioElement): void {
  audio.pause();
}

export function applyAudioSeek(audio: HTMLAudioElement, seconds: number): void {
  if (!Number.isFinite(audio.duration)) {
    return;
  }

  audio.currentTime = seconds;
}

export function applyAudioPlaybackRate(audio: HTMLAudioElement, rate: number): void {
  audio.playbackRate = rate;
}
