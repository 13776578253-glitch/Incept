'use client';

import type { ReactNode } from 'react';

import { useMusicTrackCatalog } from './hooks/use-music-track-catalog';
import { MusicPlayerProvider } from './runtime/music-player-provider';

type MusicPlayerRuntimeMountProps = {
  children: ReactNode;
};

// 目录加载与 core 初始化都在 runtime mount 里完成，避免在 layout 里加载目录导致的 SSR/CSR 不一致
export function MusicPlayerRuntimeMount({ children }: MusicPlayerRuntimeMountProps) {
  const { entries, status, reload } = useMusicTrackCatalog();

  return (
    <MusicPlayerProvider catalog={entries} catalogStatus={status} onReloadCatalog={reload}>
      {children}
    </MusicPlayerProvider>
  );
}
