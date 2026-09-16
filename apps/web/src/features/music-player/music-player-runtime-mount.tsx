'use client';

import type { ReactNode } from 'react';

import { useMusicTrackCatalog } from './hooks/use-music-track-catalog';
import { MusicPlayerProvider } from './runtime/music-player-provider';

type MusicPlayerRuntimeMountProps = {
  children: ReactNode;
};

// 目录加载放在这里，而不是 [locale]/layout.tsx：后者在每次 locale 或页面布局变化时都会参与渲染，
// 让它承担数据加载会把根布局变成数据库依赖。
export function MusicPlayerRuntimeMount({ children }: MusicPlayerRuntimeMountProps) {
  const { entries, status, reload } = useMusicTrackCatalog();

  return (
    <MusicPlayerProvider catalog={entries} catalogStatus={status} onReloadCatalog={reload}>
      {children}
    </MusicPlayerProvider>
  );
}
