import { fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

export type AudioEventType =
  | 'play'
  | 'pause'
  | 'ended'
  | 'timeupdate'
  | 'loadedmetadata'
  | 'durationchange'
  | 'error';

export function installMediaElementMocks() {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});

  return {
    play,
    pause,
    load,
    setDuration(element: HTMLMediaElement, seconds: number) {
      Object.defineProperty(element, 'duration', { configurable: true, value: seconds });
    },
    dispatch(element: HTMLMediaElement, type: AudioEventType) {
      fireEvent(element, new Event(type));
    },
    restore() {
      play.mockRestore();
      pause.mockRestore();
      load.mockRestore();
    },
  };
}

export type MediaElementMocks = ReturnType<typeof installMediaElementMocks>;
