'use client';

import type { ReactNode } from 'react';

import { mockMusicTracks } from './adapter/mock-music-source';
import { MusicPlayerProvider } from './runtime/music-player-provider';

type MusicPlayerRuntimeMountProps = {
  children: ReactNode;
};

export function MusicPlayerRuntimeMount({ children }: MusicPlayerRuntimeMountProps) {
  return <MusicPlayerProvider tracks={mockMusicTracks}>{children}</MusicPlayerProvider>;
}
