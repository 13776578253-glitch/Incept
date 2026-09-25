export const MIN_PLAYBACK_RATE = 0.5;
export const MAX_PLAYBACK_RATE = 3;

export function isPlaybackRateInRange(rate: number): boolean {
  return Number.isFinite(rate) && rate >= MIN_PLAYBACK_RATE && rate <= MAX_PLAYBACK_RATE;
}

export function clampSeekSeconds(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 0;
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    return seconds;
  }

  return seconds > duration ? duration : seconds;
}

export function normalizeDuration(duration: number): number {
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}
