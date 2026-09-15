'use client';

import { useContext } from 'react';

import { MusicPlayerContext, type MusicPlayerContextValue } from '../runtime/music-player-provider';

export function useMusicPlayer(): MusicPlayerContextValue {
  const value = useContext(MusicPlayerContext);

  if (!value) {
    throw new Error('useMusicPlayer must be used within MusicPlayerProvider.');
  }

  return value;
}
